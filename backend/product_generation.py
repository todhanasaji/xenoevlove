
# ============================================================
# XenoEvolve Omics
# Stage 7 — Candidate Product Generation and Validation
# ============================================================

from rdkit import Chem


def generate_cleavage_products(smiles, predictions, max_candidates=5):
    """
    Generate hypothetical bond-cleavage candidates ranked by ML score.

    RDKit checks structural validity, not chemical plausibility.
    These candidates are computational hypotheses only.
    """

    if not isinstance(smiles, str) or not smiles.strip():
        raise ValueError("SMILES is required")

    mol = Chem.MolFromSmiles(smiles)

    if mol is None:
        raise ValueError("Invalid SMILES structure")

    if not predictions:
        return []

    if not isinstance(max_candidates, int) or isinstance(max_candidates, bool):
        raise ValueError("max_candidates must be an integer")

    if max_candidates < 1:
        return []

    ranked_predictions = sorted(
        predictions,
        key=_safe_probability,
        reverse=True,
    )

    products = []
    seen_bonds = set()
    skipped_bonds = []

    stats = {
        "predictions_received": len(predictions),
        "eligible_bonds_examined": 0,
        "aromatic_or_ring_bonds_skipped": 0,
        "invalid_candidates_rejected": 0,
        "valid_candidates_accepted": 0,
        "invalid_predictions_skipped": 0,
    }

    for prediction in ranked_predictions:
        if len(products) >= max_candidates:
            break

        if not isinstance(prediction, dict):
            stats["invalid_predictions_skipped"] += 1
            continue

        try:
            bond_index = int(prediction["bond_index"])
            probability = float(
                prediction.get("transformation_probability", 0.0)
            )
        except (KeyError, TypeError, ValueError, OverflowError):
            stats["invalid_predictions_skipped"] += 1
            continue

        if (
            not 0.0 <= probability <= 1.0
            or bond_index < 0
            or bond_index >= mol.GetNumBonds()
            or bond_index in seen_bonds
        ):
            stats["invalid_predictions_skipped"] += 1
            continue

        seen_bonds.add(bond_index)
        bond = mol.GetBondWithIdx(bond_index)

        if bond.GetIsAromatic() or bond.IsInRing():
            stats["aromatic_or_ring_bonds_skipped"] += 1
            skipped_bonds.append({
                "bond_index": bond_index,
                "bond_type": str(bond.GetBondType()),
                "reason": "Aromatic or ring bond excluded by conservative filter",
            })
            continue

        stats["eligible_bonds_examined"] += 1

        atom1 = bond.GetBeginAtomIdx()
        atom2 = bond.GetEndAtomIdx()

        editable = Chem.RWMol(mol)
        editable.RemoveBond(atom1, atom2)
        candidate_mol = editable.GetMol()

        try:
            Chem.SanitizeMol(candidate_mol)
            fragments = Chem.GetMolFrags(
                candidate_mol,
                asMols=True,
                sanitizeFrags=True,
            )
            fragment_smiles = [
                Chem.MolToSmiles(fragment, canonical=True)
                for fragment in fragments
            ]

            if not fragment_smiles:
                raise ValueError("No valid molecular fragments generated")

        except Exception as exc:
            stats["invalid_candidates_rejected"] += 1
            continue

        stats["valid_candidates_accepted"] += 1

        products.append({
            "id": f"product-{len(products) + 1}",
            "candidate_type": "HYPOTHETICAL_BOND_CLEAVAGE",
            "source_smiles": smiles,
            "product_smiles": fragment_smiles,
            "fragment_count": len(fragment_smiles),
            "cleaved_bond_index": bond_index,
            "atom1_index": atom1,
            "atom2_index": atom2,
            "atom1_element": mol.GetAtomWithIdx(atom1).GetSymbol(),
            "atom2_element": mol.GetAtomWithIdx(atom2).GetSymbol(),
            "bond_type": str(bond.GetBondType()),
            "predicted_probability": round(probability, 4),
            "validation": {
                "rdkit_valid": True,
                "sanitized": True,
                "chemical_plausibility_assessed": False,
                "validation_error": None,
            },
            "confidence": prediction.get("confidence", "UNKNOWN"),
            "evidence_status": "COMPUTATIONAL_CANDIDATE",
            "experimental_validation_required": True,
        })

    return {
        "products": products,
        "validation_summary": stats,
        "skipped_bonds": skipped_bonds,
        "chemical_plausibility_assessed": False,
        "experimental_validation_required": True,
    }


def _safe_probability(prediction):
    """Return a valid probability for sorting."""
    if not isinstance(prediction, dict):
        return 0.0

    try:
        probability = float(
            prediction.get("transformation_probability", 0.0)
        )
    except (TypeError, ValueError, OverflowError):
        return 0.0

    if not 0.0 <= probability <= 1.0:
        return 0.0

    return probability
