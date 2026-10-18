from rdkit import Chem

SMILES = "CC(=O)OC1=CC=CC=C1C(=O)O"


def test_bond_cleavage(smiles):
    mol = Chem.MolFromSmiles(smiles)

    if mol is None:
        raise ValueError("Input SMILES is invalid")

    print("Original molecule:", Chem.MolToSmiles(mol))
    print("Total bonds:", mol.GetNumBonds())
    print("\nBond-cleavage structural validation")
    print("=" * 50)

    passed = 0
    failed = 0

    for bond in mol.GetBonds():
        editable = Chem.RWMol(mol)
        editable.RemoveBond(
            bond.GetBeginAtomIdx(),
            bond.GetEndAtomIdx(),
        )
        candidate = editable.GetMol()

        try:
            Chem.SanitizeMol(candidate)

            fragments = Chem.GetMolFrags(
                candidate,
                asMols=True,
                sanitizeFrags=True,
            )
            fragment_smiles = [
                Chem.MolToSmiles(fragment, canonical=True)
                for fragment in fragments
            ]

            print(
                f"Bond {bond.GetIdx()} "
                f"({bond.GetBondType()}): STRUCTURE VALID"
            )
            print("  Fragment count:", len(fragment_smiles))
            for index, fragment in enumerate(fragment_smiles, start=1):
                print(f"  Fragment {index}: {fragment}")

            passed += 1

        except Exception as error:
            print(
                f"Bond {bond.GetIdx()} "
                f"({bond.GetBondType()}): STRUCTURE INVALID"
            )
            print("  Reason:", str(error))
            failed += 1

    print("\nSummary")
    print("Structurally valid:", passed)
    print("Structurally invalid:", failed)
    print(
        "Note: Structural validity does not establish chemical "
        "plausibility or experimental product formation."
    )


if __name__ == "__main__":
    test_bond_cleavage(SMILES)
