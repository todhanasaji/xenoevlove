
import os
import json
import joblib
import numpy as np
import pandas as pd

from datetime import datetime, timezone
from rdkit import Chem
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(BASE_DIR, "models", "transformation_model.joblib")
TEST_FILE = os.path.join(BASE_DIR, "data", "raw", "raw_test.csv")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "benchmark_results.json")

MAX_NEGATIVE_PER_REACTION = 8
RANDOM_STATE = 42


def bond_type_value(bond):
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


def bond_key(bond):
    a = bond.GetBeginAtom().GetAtomMapNum()
    b = bond.GetEndAtom().GetAtomMapNum()
    return tuple(sorted((int(a), int(b))))


def bond_features(bond):
    a = bond.GetBeginAtom()
    b = bond.GetEndAtom()

    return [
        a.GetAtomicNum(), a.GetDegree(), a.GetTotalDegree(),
        a.GetTotalNumHs(), a.GetFormalCharge(),
        int(a.GetIsAromatic()), int(a.IsInRing()),
        b.GetAtomicNum(), b.GetDegree(), b.GetTotalDegree(),
        b.GetTotalNumHs(), b.GetFormalCharge(),
        int(b.GetIsAromatic()), int(b.IsInRing()),
        bond_type_value(bond), int(bond.GetIsAromatic()),
        int(bond.IsInRing()), int(bond.GetIsConjugated()),
    ]


def evaluate_reaction(reaction):
    if not isinstance(reaction, str):
        return [], []

    parts = reaction.split(">")

    if len(parts) != 3:
        return [], []

    reactants = []
    products = []

    for smiles in parts[0].split("."):
        mol = Chem.MolFromSmiles(smiles.strip()) if smiles.strip() else None
        if mol is not None:
            reactants.append(mol)

    for smiles in parts[2].split("."):
        mol = Chem.MolFromSmiles(smiles.strip()) if smiles.strip() else None
        if mol is not None:
            products.append(mol)

    if not reactants or not products:
        return [], []

    product_bonds = {}

    for mol in products:
        for bond in mol.GetBonds():
            product_bonds[bond_key(bond)] = bond_type_value(bond)

    positive = []
    negative = []

    for mol in reactants:
        for bond in mol.GetBonds():
            key = bond_key(bond)

            changed = (
                key not in product_bonds
                or product_bonds[key] != bond_type_value(bond)
            )

            if changed:
                positive.append(bond_features(bond))
            else:
                negative.append(bond_features(bond))

    if len(negative) > MAX_NEGATIVE_PER_REACTION:
        rng = np.random.RandomState(RANDOM_STATE)
        chosen = rng.choice(
            len(negative),
            MAX_NEGATIVE_PER_REACTION,
            replace=False,
        )
        negative = [negative[i] for i in chosen]

    features = positive + negative
    labels = [1] * len(positive) + [0] * len(negative)

    return features, labels


def main():
    if not os.path.exists(MODEL_FILE):
        raise FileNotFoundError(f"Model not found: {MODEL_FILE}")

    if not os.path.exists(TEST_FILE):
        raise FileNotFoundError(f"Test data not found: {TEST_FILE}")

    bundle = joblib.load(MODEL_FILE)
    model = bundle["model"]

    df = pd.read_csv(TEST_FILE, low_memory=False)
    column = "reactants>reagents>production"

    if column not in df.columns:
        raise ValueError(f"Missing reaction column: {column}")

    all_x = []
    all_y = []
    skipped = 0

    for reaction in df[column]:
        x, y = evaluate_reaction(reaction)

        if not x:
            skipped += 1
            continue

        all_x.extend(x)
        all_y.extend(y)

    if not all_y:
        raise RuntimeError("No valid test samples were created.")

    X = np.asarray(all_x, dtype=float)
    y = np.asarray(all_y, dtype=int)

    expected_features = int(bundle.get("feature_count", 18))

    if X.shape[1] != expected_features:
        raise ValueError(
            f"Expected {expected_features} features, got {X.shape[1]}"
        )

    predictions = model.predict(X)
    probabilities = model.predict_proba(X)

    classes = list(model.classes_)

    if 1 not in classes:
        raise ValueError("The trained model has no positive class (1).")

    positive_index = classes.index(1)
    positive_probabilities = probabilities[:, positive_index]

    accuracy = float(accuracy_score(y, predictions))
    precision = float(precision_score(y, predictions, zero_division=0))
    recall = float(recall_score(y, predictions, zero_division=0))
    f1 = float(f1_score(y, predictions, zero_division=0))

    roc_auc = None

    if len(np.unique(y)) == 2:
        roc_auc = float(roc_auc_score(y, positive_probabilities))

    matrix = confusion_matrix(y, predictions, labels=[0, 1])

    # Store only metrics measured by this evaluation.
    result = {
        "status": "completed",
        "evaluation_level": "bond",
        "test_file": "ml/data/raw/raw_test.csv",
        "test_reactions": int(len(df)),
        "reactions_skipped": int(skipped),
        "bond_samples_evaluated": int(len(y)),
        "positive_labels": int(np.sum(y == 1)),
        "negative_labels": int(np.sum(y == 0)),
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "roc_auc": roc_auc,
        "confusion_matrix": matrix.tolist(),
        "classification_report": classification_report(
            y,
            predictions,
            output_dict=True,
            zero_division=0,
        ),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "limitations": (
            "Bond-level held-out evaluation. These metrics do not establish "
            "biological or experimental validity."
        ),
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(result, file, indent=2, allow_nan=False)

    print("\n=== HELD-OUT TEST SET EVALUATION ===")
    print(f"Test reactions: {len(df)}")
    print(f"Reactions skipped: {skipped}")
    print(f"Bond samples evaluated: {len(y)}")
    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 score:  {f1:.4f}")
    print(f"ROC-AUC:   {roc_auc if roc_auc is not None else 'Unavailable'}")

    print("\nConfusion matrix (rows=true, columns=predicted):")
    print(matrix)

    print("\nSaved evaluation results to:")
    print(OUTPUT_FILE)

    print("\nNote: Bond-level metrics do not establish biological or "
          "experimental validity.")


if __name__ == "__main__":
    main()
