# ============================================================
# XenoEvolve Omics
# 18-Feature RDKit Molecular Bond Feature Extraction
# ============================================================

from rdkit import Chem


# ============================================================
# EXACT FEATURE ORDER USED BY THE RANDOM FOREST MODEL
# ============================================================

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


# ============================================================
# FEATURE COUNT
# ============================================================

FEATURE_COUNT = len(FEATURE_NAMES)


# ============================================================
# GET ATOM FEATURES
# ============================================================

def get_atom_features(atom):

    return [

        # Atomic number
        float(
            atom.GetAtomicNum()
        ),

        # Degree
        float(
            atom.GetDegree()
        ),

        # Total degree
        float(
            atom.GetTotalDegree()
        ),

        # Total hydrogens
        float(
            atom.GetTotalNumHs()
        ),

        # Formal charge
        float(
            atom.GetFormalCharge()
        ),

        # Aromatic
        float(
            atom.GetIsAromatic()
        ),

        # Ring membership
        float(
            atom.IsInRing()
        ),
    ]


# ============================================================
# GET BOND FEATURES
# ============================================================

def get_bond_features(bond):

    return [

        # Bond type
        float(
            bond.GetBondTypeAsDouble()
        ),

        # Aromatic bond
        float(
            bond.GetIsAromatic()
        ),

        # Ring bond
        float(
            bond.IsInRing()
        ),

        # Conjugated bond
        float(
            bond.GetIsConjugated()
        ),
    ]


# ============================================================
# MOLECULE → BOND FEATURES
# ============================================================

def molecule_to_bonds(smiles):

    # --------------------------------------------------------
    # Convert SMILES to RDKit molecule
    # --------------------------------------------------------

    mol = Chem.MolFromSmiles(
        smiles
    )

    if mol is None:

        return None, []


    # --------------------------------------------------------
    # Prepare bond list
    # --------------------------------------------------------

    bonds = []


    # --------------------------------------------------------
    # Iterate through every molecular bond
    # --------------------------------------------------------

    for bond in mol.GetBonds():

        bond_index = int(
            bond.GetIdx()
        )

        atom1 = bond.GetBeginAtom()

        atom2 = bond.GetEndAtom()

        atom1_index = int(
            atom1.GetIdx()
        )

        atom2_index = int(
            atom2.GetIdx()
        )


        # ----------------------------------------------------
        # Atom A features
        # ----------------------------------------------------

        atom_a_features = get_atom_features(
            atom1
        )


        # ----------------------------------------------------
        # Atom B features
        # ----------------------------------------------------

        atom_b_features = get_atom_features(
            atom2
        )


        # ----------------------------------------------------
        # Bond features
        # ----------------------------------------------------

        bond_features = get_bond_features(
            bond
        )


        # ----------------------------------------------------
        # Combine ALL 18 features
        # ----------------------------------------------------

        features = (
            atom_a_features
            + atom_b_features
            + bond_features
        )


        # ----------------------------------------------------
        # SAFETY CHECK
        # ----------------------------------------------------

        if len(features) != FEATURE_COUNT:

            raise RuntimeError(

                "Internal feature extraction error: "

                f"expected {FEATURE_COUNT} features "

                f"but generated {len(features)}"
            )


        # ----------------------------------------------------
        # Store bond information
        # ----------------------------------------------------

        bonds.append({

            "bond_index":
                bond_index,

            "atom1":
                atom1_index,

            "atom2":
                atom2_index,

            "atom_a":
                atom1.GetSymbol(),

            "atom_b":
                atom2.GetSymbol(),

            "bond_type":
                str(
                    bond.GetBondType()
                ),

            "features":
                features
        })


    # --------------------------------------------------------
    # Return molecule + bonds
    # --------------------------------------------------------

    return mol, bonds


# ============================================================
# OPTIONAL HELPER
# ============================================================

def get_feature_names():

    return FEATURE_NAMES.copy()


# ============================================================
# OPTIONAL TEST
# ============================================================

if __name__ == "__main__":

    test_smiles = (
        "CC(=O)OC1=CC=CC=C1C(=O)O"
    )

    mol, bonds = molecule_to_bonds(
        test_smiles
    )

    print("=" * 70)
    print("XENOEVOLVE FEATURE TEST")
    print("=" * 70)

    print(
        "Feature count:",
        FEATURE_COUNT
    )

    print(
        "Number of bonds:",
        len(bonds)
    )

    if bonds:

        print(
            "First bond feature count:",
            len(
                bonds[0]["features"]
            )
        )

        print(
            "Feature names:"
        )

        for i, name in enumerate(
            FEATURE_NAMES,
            start=1
        ):

            print(
                f"{i}. {name}"
            )

    print("=" * 70)