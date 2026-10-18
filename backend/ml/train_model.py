import os
import warnings

import joblib
import numpy as np
import pandas as pd

from rdkit import Chem
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score

warnings.filterwarnings("ignore")


# ============================================================
# XenoEvolve Omics
# Real Bond Transformation ML Model
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(BASE_DIR, "data", "raw")
MODEL_DIR = os.path.join(BASE_DIR, "models")

os.makedirs(MODEL_DIR, exist_ok=True)

TRAIN_FILE = os.path.join(DATA_DIR, "raw_train.csv")
VALID_FILE = os.path.join(DATA_DIR, "raw_valid.csv")
TEST_FILE = os.path.join(DATA_DIR, "raw_test.csv")

MODEL_FILE = os.path.join(
    MODEL_DIR,
    "transformation_model.joblib"
)


# ============================================================
# SETTINGS
# ============================================================

# Start with 30,000 reactions.
# This keeps the first training run manageable.
MAX_TRAIN_REACTIONS = 30000

# Maximum number of negative bonds kept per reaction.
MAX_NEGATIVE_PER_REACTION = 8

RANDOM_STATE = 42


# ============================================================
# BOND TYPE ENCODING
# ============================================================

def bond_type_value(bond):
    """Convert RDKit bond type into a numeric value."""

    bond_type = bond.GetBondType()

    if bond_type == Chem.BondType.SINGLE:
        return 1.0

    if bond_type == Chem.BondType.DOUBLE:
        return 2.0

    if bond_type == Chem.BondType.TRIPLE:
        return 3.0

    if bond_type == Chem.BondType.AROMATIC:
        return 1.5

    return 0.0


# ============================================================
# ATOM MAP
# ============================================================

def atom_map_number(atom):
    """Return atom mapping number."""

    return int(atom.GetAtomMapNum())


# ============================================================
# BOND KEY
# ============================================================

def bond_key(bond):
    """
    Represent a bond using atom mapping numbers.

    Example:

    atom 12 -- atom 18

    becomes:

    (12, 18)
    """

    a = atom_map_number(bond.GetBeginAtom())
    b = atom_map_number(bond.GetEndAtom())

    if a > b:
        a, b = b, a

    return (a, b)


# ============================================================
# PRODUCT BOND MAP
# ============================================================

def get_product_bonds(product_mol):
    """
    Build dictionary:

        atom-pair -> bond type
    """

    result = {}

    if product_mol is None:
        return result

    for bond in product_mol.GetBonds():

        key = bond_key(bond)

        result[key] = bond_type_value(bond)

    return result


# ============================================================
# REACTION PARSER
# ============================================================

def parse_reaction(reaction_string):
    """
    Parse:

        reactants>reagents>products
    """

    if not isinstance(reaction_string, str):
        return None, None

    parts = reaction_string.split(">")

    if len(parts) != 3:
        return None, None

    reactant_string = parts[0]
    product_string = parts[2]

    reactant_molecules = []
    product_molecules = []

    # --------------------------------------------------------
    # Reactants
    # --------------------------------------------------------

    for smiles in reactant_string.split("."):

        smiles = smiles.strip()

        if not smiles:
            continue

        mol = Chem.MolFromSmiles(smiles)

        if mol is not None:
            reactant_molecules.append(mol)

    # --------------------------------------------------------
    # Products
    # --------------------------------------------------------

    for smiles in product_string.split("."):

        smiles = smiles.strip()

        if not smiles:
            continue

        mol = Chem.MolFromSmiles(smiles)

        if mol is not None:
            product_molecules.append(mol)

    if len(reactant_molecules) == 0:
        return None, None

    if len(product_molecules) == 0:
        return None, None

    return reactant_molecules, product_molecules


# ============================================================
# PRODUCT BOND DATABASE
# ============================================================

def build_product_bond_database(product_molecules):

    database = {}

    for mol in product_molecules:

        for bond in mol.GetBonds():

            key = bond_key(bond)

            database[key] = bond_type_value(bond)

    return database


# ============================================================
# BOND FEATURES
# ============================================================

def extract_bond_features(bond):

    atom_a = bond.GetBeginAtom()
    atom_b = bond.GetEndAtom()

    features = [

        # Atom A
        atom_a.GetAtomicNum(),
        atom_a.GetDegree(),
        atom_a.GetTotalDegree(),
        atom_a.GetTotalNumHs(),
        atom_a.GetFormalCharge(),
        int(atom_a.GetIsAromatic()),
        int(atom_a.IsInRing()),

        # Atom B
        atom_b.GetAtomicNum(),
        atom_b.GetDegree(),
        atom_b.GetTotalDegree(),
        atom_b.GetTotalNumHs(),
        atom_b.GetFormalCharge(),
        int(atom_b.GetIsAromatic()),
        int(atom_b.IsInRing()),

        # Bond
        bond_type_value(bond),
        int(bond.GetIsAromatic()),
        int(bond.IsInRing()),
        int(bond.GetIsConjugated()),

    ]

    return features


# ============================================================
# PROCESS ONE REACTION
# ============================================================

def process_reaction(reaction_string):

    reactant_molecules, product_molecules = parse_reaction(
        reaction_string
    )

    if reactant_molecules is None:
        return [], []

    product_bonds = build_product_bond_database(
        product_molecules
    )

    positive_samples = []
    negative_samples = []

    # --------------------------------------------------------
    # Examine every reactant bond
    # --------------------------------------------------------

    for mol in reactant_molecules:

        for bond in mol.GetBonds():

            key = bond_key(bond)

            reactant_bond_type = bond_type_value(bond)

            product_bond_type = product_bonds.get(key)

            # ------------------------------------------------
            # A bond is considered changed if:
            #
            # 1. It disappeared
            # OR
            # 2. Its bond order changed
            # ------------------------------------------------

            changed = (

                product_bond_type is None

                or

                product_bond_type != reactant_bond_type
            )

            features = extract_bond_features(bond)

            if changed:

                positive_samples.append(
                    features
                )

            else:

                negative_samples.append(
                    features
                )

    # --------------------------------------------------------
    # Limit negative examples
    # --------------------------------------------------------

    if len(negative_samples) > MAX_NEGATIVE_PER_REACTION:

        rng = np.random.RandomState(
            RANDOM_STATE
        )

        indices = rng.choice(
            len(negative_samples),
            MAX_NEGATIVE_PER_REACTION,
            replace=False
        )

        negative_samples = [
            negative_samples[i]
            for i in indices
        ]

    X = positive_samples + negative_samples

    y = (
        [1] * len(positive_samples)
        +
        [0] * len(negative_samples)
    )

    return X, y


# ============================================================
# BUILD DATASET
# ============================================================

def build_dataset(csv_file, max_reactions=None):

    print()
    print("=" * 60)
    print("Loading:")
    print(csv_file)
    print("=" * 60)

    df = pd.read_csv(
        csv_file,
        nrows=max_reactions,
        low_memory=False
    )

    reaction_column = "reactants>reagents>production"

    if reaction_column not in df.columns:

        raise RuntimeError(
            f"Column '{reaction_column}' not found."
        )

    X = []
    y = []

    processed = 0
    skipped = 0

    for _, row in df.iterrows():

        reaction = row[reaction_column]

        try:

            features, labels = process_reaction(
                reaction
            )

            if len(features) == 0:
                skipped += 1
                continue

            X.extend(features)
            y.extend(labels)

            processed += 1

        except Exception:

            skipped += 1
            continue

        if processed % 1000 == 0:

            print(
                f"Processed reactions: {processed:,}"
            )

    print()
    print("Finished dataset processing.")
    print("Processed reactions:", processed)
    print("Skipped reactions:", skipped)
    print("Bond samples:", len(X))

    return np.array(X, dtype=np.float32), np.array(y)


# ============================================================
# MAIN
# ============================================================

print()
print("=" * 70)
print("XenoEvolve Omics")
print("REAL TRANSFORMATION PREDICTION MODEL")
print("=" * 70)

print()
print("Training reactions:", MAX_TRAIN_REACTIONS)


# ============================================================
# TRAIN DATA
# ============================================================

def main():
    X_train, y_train = build_dataset(
        TRAIN_FILE,
        MAX_TRAIN_REACTIONS
    )


    print()
    print("Training feature matrix:")
    print(X_train.shape)

    print()
    print("Training label distribution:")

    unique, counts = np.unique(
        y_train,
        return_counts=True
    )

    for value, count in zip(unique, counts):

        print(
            f"Label {int(value)}: {count:,}"
        )


    # ============================================================
    # RANDOM FOREST
    # ============================================================

    print()
    print("=" * 70)
    print("Training Random Forest")
    print("=" * 70)

    model = RandomForestClassifier(

        n_estimators=250,

        max_depth=18,

        min_samples_leaf=2,

        class_weight="balanced",

        random_state=RANDOM_STATE,

        n_jobs=-1
    )


    model.fit(
        X_train,
        y_train
    )


    # ============================================================
    # TRAINING METRICS
    # ============================================================

    train_predictions = model.predict(
        X_train
    )

    train_probabilities = model.predict_proba(
        X_train
    )[:, 1]


    accuracy = accuracy_score(
        y_train,
        train_predictions
    )

    print()
    print(
        "Training accuracy:",
        round(accuracy, 4)
    )


    try:

        auc = roc_auc_score(
            y_train,
            train_probabilities
        )

        print(
            "Training ROC-AUC:",
            round(auc, 4)
        )

    except Exception:

        pass


    # ============================================================
    # SAVE MODEL
    # ============================================================

    model_package = {

        "model": model,

        "feature_count": X_train.shape[1],

        "feature_names": [

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
        ],

        "training_reactions": MAX_TRAIN_REACTIONS,

        "description": (
            "Random Forest bond transformation classifier "
            "trained from atom-mapped USPTO reaction data."
        )
    }


    joblib.dump(
        model_package,
        MODEL_FILE
    )


    print()
    print("=" * 70)
    print("MODEL SAVED")
    print("=" * 70)

    print()
    print(MODEL_FILE)

    print()
    print("REAL ML TRAINING COMPLETE.")
    print("=" * 70)

if __name__ == "__main__":
    main()
