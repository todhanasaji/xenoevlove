
# ============================================================
# XenoEvolve Omics
# Feature Ablation Evaluation
# ============================================================
# Trains separate models with feature groups removed.
# Evaluates each model on the same held-out reaction dataset.
#
# NOTE:
# This is feature ablation for the bond classifier.
# It is NOT ablation of Omics, MS/MS, Temporal, or Literature
# evidence modules.
# ============================================================

import os
import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd

from rdkit import Chem
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)

TRAIN_FILE = os.path.join(
    BACKEND_DIR, "ml", "data", "raw", "raw_train.csv"
)
TEST_FILE = os.path.join(
    BACKEND_DIR, "ml", "data", "raw", "raw_test.csv"
)
MODEL_FILE = os.path.join(
    BACKEND_DIR, "ml", "models", "transformation_model.joblib"
)
OUTPUT_FILE = os.path.join(
    BACKEND_DIR, "ml", "data", "ablation_results.json"
)

REACTION_COLUMN = "reactants>reagents>production"
MAX_NEGATIVE_PER_REACTION = 8
RANDOM_STATE = 42

FEATURE_NAMES = [
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
    "bond_conjugated",
]

# Feature indexes to retain in each experiment.
# Every experiment uses the same held-out test samples.
EXPERIMENTS = {
    "full_model": list(range(18)),
    "without_atom_descriptors": list(range(14, 18)),
    "without_bond_descriptors": list(range(14)),
    "without_aromaticity_and_ring_flags": [
        0, 1, 2, 3, 4,
        7, 8, 9, 10, 11,
        14, 17,
    ],
}


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
    atom_a = int(bond.GetBeginAtom().GetAtomMapNum())
    atom_b = int(bond.GetEndAtom().GetAtomMapNum())
    return tuple(sorted((atom_a, atom_b)))


def bond_features(bond):
    atom_a = bond.GetBeginAtom()
    atom_b = bond.GetEndAtom()

    return [
        atom_a.GetAtomicNum(),
        atom_a.GetDegree(),
        atom_a.GetTotalDegree(),
        atom_a.GetTotalNumHs(),
        atom_a.GetFormalCharge(),
        int(atom_a.GetIsAromatic()),
        int(atom_a.IsInRing()),

        atom_b.GetAtomicNum(),
        atom_b.GetDegree(),
        atom_b.GetTotalDegree(),
        atom_b.GetTotalNumHs(),
        atom_b.GetFormalCharge(),
        int(atom_b.GetIsAromatic()),
        int(atom_b.IsInRing()),

        bond_type_value(bond),
        int(bond.GetIsAromatic()),
        int(bond.IsInRing()),
        int(bond.GetIsConjugated()),
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
        smiles = smiles.strip()
        if smiles:
            mol = Chem.MolFromSmiles(smiles)
            if mol is not None:
                reactants.append(mol)

    for smiles in parts[2].split("."):
        smiles = smiles.strip()
        if smiles:
            mol = Chem.MolFromSmiles(smiles)
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
        selected = rng.choice(
            len(negative),
            MAX_NEGATIVE_PER_REACTION,
            replace=False,
        )
        negative = [negative[i] for i in selected]

    features = positive + negative
    labels = [1] * len(positive) + [0] * len(negative)

    return features, labels


def build_dataset(path):
    print(f"\nLoading dataset: {path}")
    df = pd.read_csv(path, low_memory=False)

    if REACTION_COLUMN not in df.columns:
        raise ValueError(f"Missing column: {REACTION_COLUMN}")

    all_x = []
    all_y = []
    skipped = 0

    for index, reaction in enumerate(df[REACTION_COLUMN], start=1):
        try:
            x, y = evaluate_reaction(reaction)
        except Exception:
            x, y = [], []

        if not x:
            skipped += 1
            continue

        all_x.extend(x)
        all_y.extend(y)

        if index % 5000 == 0:
            print(f"Processed {index:,}/{len(df):,} reactions")

    if not all_y:
        raise RuntimeError(f"No valid samples were created from {path}")

    X = np.asarray(all_x, dtype=np.float32)
    y = np.asarray(all_y, dtype=np.int32)

    print("Reactions:", len(df))
    print("Skipped reactions:", skipped)
    print("Bond samples:", len(y))
    print("Positive labels:", int(np.sum(y == 1)))
    print("Negative labels:", int(np.sum(y == 0)))

    return X, y, len(df), skipped


def calculate_metrics(y_true, probabilities):
    predictions = (probabilities >= 0.5).astype(int)

    result = {
        "accuracy": float(accuracy_score(y_true, predictions)),
        "precision": float(
            precision_score(y_true, predictions, zero_division=0)
        ),
        "recall": float(
            recall_score(y_true, predictions, zero_division=0)
        ),
        "f1_score": float(
            f1_score(y_true, predictions, zero_division=0)
        ),
        "roc_auc": None,
        "confusion_matrix": confusion_matrix(
            y_true, predictions, labels=[0, 1]
        ).tolist(),
    }

    if len(np.unique(y_true)) == 2:
        result["roc_auc"] = float(
            roc_auc_score(y_true, probabilities)
        )

    return result


def main():
    for path in (TRAIN_FILE, TEST_FILE, MODEL_FILE):
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Required file not found: {path}")

    # Read original model package for training configuration.
    bundle = joblib.load(MODEL_FILE)
    original_model = bundle["model"]

    if hasattr(original_model, "n_estimators"):
        n_estimators = int(original_model.n_estimators)
    else:
        n_estimators = 250

    if hasattr(original_model, "max_depth"):
        max_depth = original_model.max_depth
    else:
        max_depth = 18

    if hasattr(original_model, "min_samples_leaf"):
        min_samples_leaf = int(original_model.min_samples_leaf)
    else:
        min_samples_leaf = 2

    if hasattr(original_model, "class_weight"):
        class_weight = original_model.class_weight
    else:
        class_weight = "balanced"

    print("=" * 65)
    print("XenoEvolve Omics — Feature Ablation Evaluation")
    print("=" * 65)
    print("Building training data...")
    X_train, y_train, train_reactions, train_skipped = build_dataset(
        TRAIN_FILE
    )

    print("\nBuilding held-out test data...")
    X_test, y_test, test_reactions, test_skipped = build_dataset(
        TEST_FILE
    )

    if X_train.shape[1] != len(FEATURE_NAMES):
        raise ValueError(
            f"Training data has {X_train.shape[1]} features; "
            f"expected {len(FEATURE_NAMES)}"
        )

    if X_test.shape[1] != len(FEATURE_NAMES):
        raise ValueError(
            f"Test data has {X_test.shape[1]} features; "
            f"expected {len(FEATURE_NAMES)}"
        )

    results = {
        "status": "completed",
        "evaluation_level": "bond",
        "training_file": "ml/data/raw/raw_train.csv",
        "test_file": "ml/data/raw/raw_test.csv",
        "training_reactions": int(train_reactions),
        "training_reactions_skipped": int(train_skipped),
        "test_reactions": int(test_reactions),
        "test_reactions_skipped": int(test_skipped),
        "training_bond_samples": int(len(y_train)),
        "test_bond_samples": int(len(y_test)),
        "threshold": 0.5,
        "random_state": RANDOM_STATE,
        "experiments": {},
        "limitations": (
            "Feature-group ablation of the bond classifier, not ablation "
            "of Omics, Temporal, MS/MS, or Literature evidence modules. "
            "Reaction labels are derived from atom-mapped reactant/product "
            "bond changes. Metrics do not establish experimental validity."
        ),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    }

    for experiment_name, feature_indices in EXPERIMENTS.items():
        print(f"\n--- Experiment: {experiment_name} ---")

        X_train_subset = X_train[:, feature_indices]
        X_test_subset = X_test[:, feature_indices]

        model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            class_weight=class_weight,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )

        model.fit(X_train_subset, y_train)

        probabilities_all = model.predict_proba(X_test_subset)
        class_list = list(model.classes_)

        if 1 not in class_list:
            raise RuntimeError(
                f"{experiment_name}: training data lacks positive class"
            )

        positive_index = class_list.index(1)
        positive_probabilities = probabilities_all[:, positive_index]

        metrics = calculate_metrics(y_test, positive_probabilities)

        result = {
            "features_used": [
                FEATURE_NAMES[i] for i in feature_indices
            ],
            "feature_count": len(feature_indices),
            **metrics,
        }

        results["experiments"][experiment_name] = result

        print("Features:", len(feature_indices))
        print(f"Accuracy:  {metrics['accuracy']:.4f}")
        print(f"Precision: {metrics['precision']:.4f}")
        print(f"Recall:    {metrics['recall']:.4f}")
        print(f"F1 score:  {metrics['f1_score']:.4f}")
        print("ROC-AUC:", metrics["roc_auc"])

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(results, file, indent=2, allow_nan=False)

    print("\nAblation results saved to:")
    print(OUTPUT_FILE)
    print("\nThis experiment did not modify your deployed model.")


if __name__ == "__main__":
    main()
