import os
import uuid
import joblib
import numpy as np
from rdkit import Chem


# =========================================================
# MODEL PATH
# =========================================================

MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "models",
    "transformation_model.joblib"
)


# =========================================================
# LOAD TRAINED RANDOM FOREST
# =========================================================

bundle = joblib.load(MODEL_PATH)

model = bundle["model"]

FEATURE_NAMES = bundle.get(
    "feature_names",
    [
        "atom_a_atomic_number",
        "atom_a_degree",
        "atom_a_total_degree",
        "atom_a_hydrogens",
        "atom_a_formal_charge",
        "atom_a_aromatic",
        "atom_a_ring",

        "atom_b_atomic_number",
        "atom_b_degree",
        "atom_b_total_degree",
        "atom_b_hydrogens",
        "atom_b_formal_charge",
        "atom_b_aromatic",
        "atom_b_ring",

        "bond_type",
        "bond_aromatic",
        "bond_ring",
        "bond_conjugated"
    ]
)


print("=" * 70)
print("TRANSFORMATION ML MODEL LOADED")
print("=" * 70)
print("Model file:", MODEL_PATH)
print("Model type:", type(model).__name__)
print("Features expected:", len(FEATURE_NAMES))
print("Feature names:", FEATURE_NAMES)
print("=" * 70)


# =========================================================
# BOND TYPE ENCODING
# =========================================================

def get_bond_type_value(bond):

    bond_type = bond.GetBondType()

    if bond_type == Chem.BondType.SINGLE:
        return 1.0

    elif bond_type == Chem.BondType.DOUBLE:
        return 2.0

    elif bond_type == Chem.BondType.TRIPLE:
        return 3.0

    elif bond_type == Chem.BondType.AROMATIC:
        return 1.5

    return 0.0


# =========================================================
# ATOM FEATURES
# =========================================================

def atom_features(atom):

    return {
        "atomic_number":
            float(atom.GetAtomicNum()),

        "degree":
            float(atom.GetDegree()),

        "total_degree":
            float(atom.GetTotalDegree()),

        "hydrogens":
            float(atom.GetTotalNumHs()),

        "formal_charge":
            float(atom.GetFormalCharge()),

        "aromatic":
            float(atom.GetIsAromatic()),

        "ring":
            float(atom.IsInRing())
    }


# =========================================================
# CREATE 18 FEATURES
# =========================================================

def make_bond_features(mol, bond):

    atom_a = bond.GetBeginAtom()
    atom_b = bond.GetEndAtom()

    a = atom_features(atom_a)
    b = atom_features(atom_b)

    features = [

        # Atom A
        a["atomic_number"],
        a["degree"],
        a["total_degree"],
        a["hydrogens"],
        a["formal_charge"],
        a["aromatic"],
        a["ring"],

        # Atom B
        b["atomic_number"],
        b["degree"],
        b["total_degree"],
        b["hydrogens"],
        b["formal_charge"],
        b["aromatic"],
        b["ring"],

        # Bond
        get_bond_type_value(bond),
        float(bond.GetIsAromatic()),
        float(bond.IsInRing()),
        float(bond.GetIsConjugated())
    ]

    return features


# =========================================================
# GET PROBABILITY FROM RANDOM FOREST
# =========================================================

def get_model_probability(features):

    X = np.asarray(
        [features],
        dtype=float
    )

    probabilities = model.predict_proba(X)[0]

    # Find probability belonging to class 1
    if hasattr(model, "classes_"):

        classes = list(model.classes_)

        if 1 in classes:

            class_index = classes.index(1)

            return float(
                probabilities[class_index]
            )

    # Fallback for binary classifier
    if len(probabilities) >= 2:

        return float(
            probabilities[1]
        )

    return float(
        probabilities[0]
    )


# =========================================================
# CONFIDENCE LABEL
# =========================================================

def get_confidence(probability):

    if probability >= 0.80:
        return "HIGH"

    elif probability >= 0.60:
        return "MODERATE"

    elif probability >= 0.40:
        return "LOW"

    else:
        return "VERY_LOW"


# =========================================================
# REAL ML BOND PREDICTION
# =========================================================

def predict_bonds(smiles):

    mol = Chem.MolFromSmiles(smiles)

    if mol is None:

        raise ValueError(
            "Invalid SMILES"
        )

    results = []

    for bond in mol.GetBonds():

        features = make_bond_features(
            mol,
            bond
        )

        probability = get_model_probability(
            features
        )

        atom_a = bond.GetBeginAtom()
        atom_b = bond.GetEndAtom()

        results.append({

            "id":
                str(uuid.uuid4()),

            "bond_index":
                int(bond.GetIdx()),

            "atom1":
                int(atom_a.GetIdx()),

            "atom2":
                int(atom_b.GetIdx()),

            "atom_a":
                atom_a.GetSymbol(),

            "atom_b":
                atom_b.GetSymbol(),

            "bond_type":
                str(bond.GetBondType()),

            "predicted_probability":
                round(
                    probability,
                    4
                ),

            "transformation_probability":
                round(
                    probability,
                    4
                ),

            # Kept for compatibility with main.py.
            # This model predicts transformation probability,
            # not a separately trained cleavage model.
            "cleavage_probability":
                round(
                    probability,
                    4
                ),

            "confidence":
                get_confidence(
                    probability
                )
        })

    # Highest ML probability first
    results.sort(
        key=lambda x:
            x["transformation_probability"],
        reverse=True
    )

    return results


# =========================================================
# MAIN FUNCTION USED BY main.py
# =========================================================

def predict_transformation(smiles):

    predictions = predict_bonds(
        smiles
    )

    return {

        "success":
            True,

        "smiles":
            smiles,

        "prediction_count":
            len(predictions),

        "predictions":
            predictions
    }


# =========================================================
# DIRECT TEST
# =========================================================

if __name__ == "__main__":

    test_smiles = (
        "CC(=O)OC1=CC=CC=C1C(=O)O"
    )

    print()
    print("=" * 70)
    print("TESTING TRANSFORMATION ML PREDICTION")
    print("=" * 70)
    print("SMILES:", test_smiles)
    print()

    result = predict_transformation(
        test_smiles
    )

    print(
        "Prediction count:",
        result["prediction_count"]
    )

    print()

    for prediction in result["predictions"]:

        print(
            f"Bond {prediction['bond_index'] + 1}: "
            f"{prediction['atom_a']}-"
            f"{prediction['atom_b']} | "
            f"{prediction['bond_type']} | "
            f"Probability = "
            f"{prediction['transformation_probability']} | "
            f"Confidence = "
            f"{prediction['confidence']}"
        )

    print()
    print("=" * 70)
    print("ML TRANSFORMATION TEST COMPLETE")
    print("=" * 70)