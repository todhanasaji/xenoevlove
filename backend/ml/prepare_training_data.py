import pandas as pd
import numpy as np
from rdkit import Chem
from pathlib import Path
import random

from ml.features import bond_features


INPUT_FILE = "ml/data/raw/raw_train.csv"
OUTPUT_FILE = "ml/data/training_data.csv"

RANDOM_SEED = 42
MAX_NEGATIVE_RATIO = 3


def parse_molecule(smiles):
    """Convert SMILES into an RDKit molecule."""
    if not smiles:
        return None

    try:
        mol = Chem.MolFromSmiles(smiles)
        return mol
    except Exception:
        return None


def get_product_bonds(product_smiles):
    """
    Get bonds from the product side using atom-map numbers.

    Returns:
        dictionary:
        (map_number_1, map_number_2) -> bond_order
    """

    product_bonds = {}

    for component in product_smiles.split("."):

        mol = parse_molecule(component)

        if mol is None:
            continue

        for bond in mol.GetBonds():

            atom1 = bond.GetBeginAtom()
            atom2 = bond.GetEndAtom()

            map1 = atom1.GetAtomMapNum()
            map2 = atom2.GetAtomMapNum()

            if map1 == 0 or map2 == 0:
                continue

            key = tuple(sorted((map1, map2)))

            product_bonds[key] = bond.GetBondTypeAsDouble()

    return product_bonds


def process_reaction(reaction_smiles):

    parts = reaction_smiles.split(">")

    if len(parts) != 3:
        return [], 0

    reactants_smiles = parts[0]
    products_smiles = parts[2]

    product_bonds = get_product_bonds(products_smiles)

    rows = []

    for component in reactants_smiles.split("."):

        mol = parse_molecule(component)

        if mol is None:
            continue

        for bond in mol.GetBonds():

            atom1 = bond.GetBeginAtom()
            atom2 = bond.GetEndAtom()

            map1 = atom1.GetAtomMapNum()
            map2 = atom2.GetAtomMapNum()

            if map1 == 0 or map2 == 0:
                continue

            key = tuple(sorted((map1, map2)))

            reactant_order = bond.GetBondTypeAsDouble()

            product_order = product_bonds.get(key)

            # Positive = bond disappeared or bond order changed
            if product_order is None:
                label = 1
            elif product_order != reactant_order:
                label = 1
            else:
                label = 0

            features = bond_features(mol, bond)

            row = {
                "map_atom1": map1,
                "map_atom2": map2,
                "label": label
            }

            for i, value in enumerate(features):
                row[f"feature_{i}"] = float(value)

            rows.append(row)

    return rows, len(rows)


def main():

    print("=" * 60)
    print("XenoEvolve - USPTO-50K Training Data Preparation")
    print("=" * 60)

    print("\nLoading dataset...")

    df = pd.read_csv(INPUT_FILE)

    print(f"Reactions found: {len(df)}")

    all_rows = []

    successful = 0
    failed = 0

    for index, reaction in enumerate(df["reactants>reagents>production"]):

        try:

            rows, count = process_reaction(reaction)

            if count > 0:
                all_rows.extend(rows)
                successful += 1
            else:
                failed += 1

        except Exception:
            failed += 1

        if (index + 1) % 1000 == 0:
            print(
                f"Processed {index + 1}/{len(df)} reactions..."
            )

    print("\nProcessing finished.")

    print(f"Successful reactions: {successful}")
    print(f"Skipped reactions: {failed}")
    print(f"Total bond examples: {len(all_rows)}")

    if not all_rows:
        print("\nERROR: No training examples were generated.")
        return

    training_df = pd.DataFrame(all_rows)

    positives = training_df[training_df["label"] == 1]
    negatives = training_df[training_df["label"] == 0]

    print(f"\nPositive examples: {len(positives)}")
    print(f"Negative examples: {len(negatives)}")

    # Limit negatives so the model is not overwhelmed by unchanged bonds
    max_negatives = min(
        len(negatives),
        len(positives) * MAX_NEGATIVE_RATIO
    )

    negatives = negatives.sample(
        n=max_negatives,
        random_state=RANDOM_SEED
    )

    training_df = pd.concat(
        [positives, negatives],
        ignore_index=True
    )

    training_df = training_df.sample(
        frac=1,
        random_state=RANDOM_SEED
    ).reset_index(drop=True)

    Path("ml/data").mkdir(
        parents=True,
        exist_ok=True
    )

    training_df.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print("\nFinal ML dataset:")
    print(training_df.shape)

    print("\nFinal label distribution:")
    print(training_df["label"].value_counts())

    print(f"\nSaved to:")
    print(OUTPUT_FILE)

    print("\nDONE.")


if __name__ == "__main__":
    main()