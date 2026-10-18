from rdkit import Chem
import numpy as np


def bond_features(mol, bond):
    """
    Extract numerical features for one chemical bond.
    """

    atom1 = bond.GetBeginAtom()
    atom2 = bond.GetEndAtom()

    features = [
        # Atomic numbers
        atom1.GetAtomicNum(),
        atom2.GetAtomicNum(),

        # Atom degree
        atom1.GetDegree(),
        atom2.GetDegree(),

        # Formal charge
        atom1.GetFormalCharge(),
        atom2.GetFormalCharge(),

        # Number of hydrogens
        atom1.GetTotalNumHs(),
        atom2.GetTotalNumHs(),

        # Aromaticity
        int(atom1.GetIsAromatic()),
        int(atom2.GetIsAromatic()),

        # Ring membership
        int(atom1.IsInRing()),
        int(atom2.IsInRing()),

        # Bond type
        float(bond.GetBondTypeAsDouble()),

        # Bond aromaticity
        int(bond.GetIsAromatic()),

        # Bond ring membership
        int(bond.IsInRing())
    ]

    return np.array(features, dtype=float)


def molecule_to_bonds(smiles):
    """
    Convert a SMILES string into individual bonds
    and their numerical features.
    """

    mol = Chem.MolFromSmiles(smiles)

    if mol is None:
        raise ValueError("Invalid SMILES")

    results = []

    for bond in mol.GetBonds():

        features = bond_features(mol, bond)

        results.append({
            "bond_index": bond.GetIdx(),
            "atom1": bond.GetBeginAtomIdx(),
            "atom2": bond.GetEndAtomIdx(),
            "features": features
        })

    return mol, results