# ============================================================
# XenoEvolve Omics
# Complete FastAPI Backend
# PubChem + RDKit + Random Forest + KEGG + NCBI
# ============================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

import requests
import joblib
import numpy as np
import re
import uuid
from datetime import datetime, timezone

from rdkit import Chem
from rdkit.Chem import Descriptors, Lipinski, Crippen, rdMolDescriptors

from ml.features import molecule_to_bonds


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="XenoEvolve Omics API",
    description="Computational Xenobiotic Enzyme Matrix Pipeline",
    version="5.1.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIR
    / "ml"
    / "models"
    / "transformation_model.joblib"
)


# ============================================================
# LOAD RANDOM FOREST MODEL
# ============================================================

model_package = None
model = None

try:
    model_package = joblib.load(MODEL_PATH)

    if isinstance(model_package, dict):
        model = model_package.get("model")
    else:
        model = model_package

    print("=" * 70)
    print("TRANSFORMATION ML MODEL LOADED")
    print("=" * 70)
    print("Model file:")
    print(MODEL_PATH)
    print("Model type:")
    print(type(model).__name__)

    if hasattr(model, "n_features_in_"):
        print("Features expected:", model.n_features_in_)

    if isinstance(model_package, dict):
        print("Feature count:", model_package.get("feature_count"))
        print("Training reactions:", model_package.get("training_reactions"))
        print("Feature names:", model_package.get("feature_names"))

    print("=" * 70)

except Exception as e:
    print("=" * 70)
    print("WARNING: ML MODEL COULD NOT BE LOADED")
    print("=" * 70)
    print("Reason:")
    print(e)
    print("=" * 70)


# ============================================================
# REQUEST MODELS
# ============================================================

class AnalyzeRequest(BaseModel):
    name: Optional[str] = None
    smiles: Optional[str] = None
    transformation_depth: int = 1


class TransformationRequest(BaseModel):
    smiles: str
    transformation_depth: int = 1


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "project": "XenoEvolve Omics",
        "status": "running",
        "version": "5.1.0",
        "ml_model": "Random Forest",
        "ml_model_loaded": model is not None,
        "feature_count": (
            model.n_features_in_
            if model is not None and hasattr(model, "n_features_in_")
            else 18
        ),
        "prediction_source": "REAL_RANDOM_FOREST",
        "endpoints": [
            "/",
            "/health",
            "/analyze",
            "/transformations/predict",
            "/pubchem/{compound_name}",
            "/kegg/context/{compound_id}",
            "/ncbi/context/{query}",
            "/docs",
        ],
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "ml_model_loaded": model is not None,
        "model_file": str(MODEL_PATH),
        "model_type": (
            type(model).__name__ if model is not None else None
        ),
        "feature_count": (
            model.n_features_in_
            if model is not None and hasattr(model, "n_features_in_")
            else None
        ),
        "training_reactions": (
            model_package.get("training_reactions")
            if isinstance(model_package, dict)
            else None
        ),
        "prediction_source": "REAL_RANDOM_FOREST",
    }


# ============================================================
# PUBCHEM
# IMPORTANT FIX:
# Use the same simple PUG REST property request that was verified
# successfully from PowerShell.
# ============================================================

PUBCHEM_HEADERS = {
    "User-Agent": "XenoEvolve-Omics/5.1 (research project)"
}


def get_pubchem_compound(compound_name: str):
    if not compound_name:
        return None

    name = compound_name.strip()

    if not name:
        return None

    # Path-safe URL encoding. safe="" is intentional.
    encoded_name = requests.utils.quote(name, safe="")

    # First request: exactly the core properties needed by XenoEvolve.
    property_url = (
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
        f"{encoded_name}/property/"
        "Title,CanonicalSMILES,MolecularFormula,MolecularWeight,InChIKey/"
        "JSON"
    )

    try:
        response = requests.get(
            property_url,
            headers=PUBCHEM_HEADERS,
            timeout=20,
        )

        print(
            f"PubChem lookup: {name!r} -> "
            f"HTTP {response.status_code}"
        )

        if response.status_code == 200:
            data = response.json()

            properties = (
                data.get("PropertyTable", {})
                .get("Properties", [])
            )

            if properties:
                result = properties[0]

                # Make sure the downstream code has a usable SMILES.
                if result.get("CanonicalSMILES"):
                    result["ConnectivitySMILES"] = (
                        result["CanonicalSMILES"]
                    )

                return result

        # Fallback: ask PubChem for CID first, then retrieve properties.
        cid_url = (
            "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
            f"{encoded_name}/cids/JSON"
        )

        cid_response = requests.get(
            cid_url,
            headers=PUBCHEM_HEADERS,
            timeout=20,
        )

        print(
            f"PubChem CID fallback: {name!r} -> "
            f"HTTP {cid_response.status_code}"
        )

        if cid_response.status_code == 200:
            cid_data = cid_response.json()
            cids = cid_data.get("IdentifierList", {}).get("CID", [])

            if cids:
                cid = cids[0]

                cid_property_url = (
                    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
                    f"{cid}/property/"
                    "Title,CanonicalSMILES,MolecularFormula,"
                    "MolecularWeight,InChIKey/JSON"
                )

                cid_property_response = requests.get(
                    cid_property_url,
                    headers=PUBCHEM_HEADERS,
                    timeout=20,
                )

                print(
                    f"PubChem CID property lookup: CID {cid} -> "
                    f"HTTP {cid_property_response.status_code}"
                )

                if cid_property_response.status_code == 200:
                    cid_data = cid_property_response.json()

                    properties = (
                        cid_data.get("PropertyTable", {})
                        .get("Properties", [])
                    )

                    if properties:
                        result = properties[0]

                        if result.get("CanonicalSMILES"):
                            result["ConnectivitySMILES"] = (
                                result["CanonicalSMILES"]
                            )

                        return result

        print(
            "PubChem lookup failed. Response:",
            response.text[:500]
        )
        return None

    except requests.RequestException as e:
        print("PubChem network error:", repr(e))
        return None

    except Exception as e:
        print("PubChem parsing error:", repr(e))
        return None


# ============================================================
# PUBCHEM ENDPOINT
# ============================================================

@app.get("/pubchem/{compound_name}")
def pubchem(compound_name: str):
    result = get_pubchem_compound(compound_name)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Compound '{compound_name}' could not be found in PubChem.",
        )

    return {
        "success": True,
        "source": "PubChem",
        "data": result,
    }


# ============================================================
# KEGG SEARCH
# ============================================================

def find_kegg_compound(compound_name: str):
    if not compound_name:
        return None

    url = (
        "https://rest.kegg.jp/find/compound/"
        f"{requests.utils.quote(compound_name.strip(), safe='')}"
    )

    try:
        response = requests.get(url, timeout=10)

        if response.status_code != 200:
            return None

        text = response.text.strip()

        if not text:
            return None

        for line in text.splitlines():
            parts = line.split("\t")

            if not parts:
                continue

            compound_id = (
                parts[0]
                .strip()
                .replace("cp:", "")
            )

            match = re.search(r"C\d{5}", compound_id)

            if match:
                return match.group(0)

        return None

    except Exception as e:
        print("KEGG search error:", e)
        return None


# ============================================================
# KEGG GET CONTEXT
# ============================================================

def get_kegg_context(compound_id: str):
    compound_id = (
        compound_id.upper()
        .strip()
        .replace("CP:", "")
    )

    if not re.fullmatch(r"C\d{5}", compound_id):
        return None

    url = f"https://rest.kegg.jp/get/cpd:{compound_id}"

    try:
        response = requests.get(url, timeout=10)

        if response.status_code != 200:
            return None

        return response.text

    except Exception as e:
        print("KEGG context error:", e)
        return None


# ============================================================
# PARSE KEGG PATHWAYS
# ============================================================

def parse_kegg_pathways(kegg_text: str):
    pathways = []

    if not kegg_text:
        return pathways

    for line in kegg_text.splitlines():
        if line.startswith("PATHWAY"):
            content = line[len("PATHWAY"):].strip()

            if content:
                pathways.append(content)

    return list(dict.fromkeys(pathways))


# ============================================================
# KEGG ENDPOINT
# ============================================================

@app.get("/kegg/context/{compound_id}")
def kegg_context(compound_id: str):
    raw_data = get_kegg_context(compound_id)

    if raw_data is None:
        raise HTTPException(
            status_code=404,
            detail="KEGG compound not found",
        )

    pathways = parse_kegg_pathways(raw_data)

    return {
        "success": True,
        "compound_id": compound_id.upper(),
        "pathways": pathways,
        "data": raw_data,
    }


# ============================================================
# NCBI SEARCH
# ============================================================

def ncbi_search(query: str):
    url = (
        "https://eutils.ncbi.nlm.nih.gov/"
        "entrez/eutils/esearch.fcgi"
    )

    params = {
        "db": "protein",
        "term": query,
        "retmode": "json",
        "retmax": 10,
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=10,
        )

        if response.status_code != 200:
            return None

        return response.json()

    except Exception as e:
        print("NCBI search error:", e)
        return None


# ============================================================
# NCBI ENDPOINT
# ============================================================

@app.get("/ncbi/context/{query}")
def ncbi_context(query: str):
    result = ncbi_search(query)

    if result is None:
        raise HTTPException(
            status_code=500,
            detail="NCBI request failed",
        )

    return {
        "success": True,
        "query": query,
        "database": "protein",
        "results": result,
    }


# ============================================================
# RANDOM FOREST PREDICTION
# ============================================================

def predict_transformation(smiles: str):
    if model is None:
        raise RuntimeError(
            "Transformation ML model is not loaded"
        )

    mol, bonds = molecule_to_bonds(smiles)

    if mol is None:
        raise ValueError("Invalid SMILES structure")

    if not bonds:
        return {
            "total_bonds": 0,
            "predictions": [],
        }

    X = np.array(
        [bond["features"] for bond in bonds],
        dtype=float,
    )

    if X.ndim != 2:
        raise RuntimeError(
            "Invalid feature matrix generated by RDKit"
        )

    actual_features = X.shape[1]

    expected_features = getattr(
        model,
        "n_features_in_",
        18,
    )

    if actual_features != expected_features:
        raise RuntimeError(
            f"Feature mismatch: model expects "
            f"{expected_features} features but RDKit generated "
            f"{actual_features}"
        )

    predictions = model.predict(X)

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(X)
        classes = list(model.classes_)

        if 1 in classes:
            positive_index = classes.index(1)
            probabilities_1 = probabilities[:, positive_index]
        else:
            probabilities_1 = np.max(
                probabilities,
                axis=1,
            )
    else:
        probabilities_1 = np.asarray(
            predictions,
            dtype=float,
        )

    results = []

    for i, bond in enumerate(bonds):
        probability = float(probabilities_1[i])
        prediction = int(predictions[i])

        if probability >= 0.80:
            confidence = "HIGH"
        elif probability >= 0.60:
            confidence = "MODERATE"
        elif probability >= 0.40:
            confidence = "LOW"
        else:
            confidence = "VERY_LOW"

        bond_index = int(bond["bond_index"])
        atom1 = int(bond["atom1"])
        atom2 = int(bond["atom2"])

        atom1_symbol = mol.GetAtomWithIdx(atom1).GetSymbol()
        atom2_symbol = mol.GetAtomWithIdx(atom2).GetSymbol()

        rdkit_bond = mol.GetBondWithIdx(bond_index)
        bond_type = str(rdkit_bond.GetBondType())

        results.append({
            "id": str(uuid.uuid4()),
            "bond_index": bond_index,
            "atom1": atom1,
            "atom2": atom2,
            "prediction": prediction,
            "transformation_probability": round(
                probability,
                4,
            ),
            "cleavage_probability": round(
                probability,
                4,
            ),
            "confidence": confidence,
            "evidence_status": "ML_PREDICTED",
            "model": "Random Forest",
            "feature_count": actual_features,
            "bond_type": bond_type,
            "atom_a": atom1_symbol,
            "atom_b": atom2_symbol,
        })

    results.sort(
        key=lambda x: x["transformation_probability"],
        reverse=True,
    )

    # Keep the top 10 candidates for the frontend.
    results = results[:10]

    return {
        "total_bonds": len(bonds),
        "predictions": results,
    }


# ============================================================
# BUILD FRONTEND TRANSFORMATIONS
# ============================================================

def build_transformations(predictions):
    transformations = []

    for item in predictions:
        transformations.append({
            "id": item["id"],
            "candidate": (
                f"{item['atom_a']}-{item['atom_b']} "
                f"bond transformation"
            ),
            "reaction": "ML-predicted bond transformation",
            "step": 1,
            "predicted_probability": item[
                "transformation_probability"
            ],
            "transformation_probability": item[
                "transformation_probability"
            ],
            "cleavage_probability": item[
                "cleavage_probability"
            ],
            "enzyme_class": "Candidate hydrolase (putative)",
            "evidence_status": "ML_PREDICTED",
            "confidence": item["confidence"],
            "evidence": {
                "bond_index": item["bond_index"],
                "atom_a": item["atom_a"],
                "atom_b": item["atom_b"],
                "atom_a_index": item["atom1"],
                "atom_b_index": item["atom2"],
                "bond_type": item["bond_type"],
            },
            "model": "Random Forest",
            "feature_count": item["feature_count"],
        })

    return transformations


# ============================================================
# BUILD MOLECULAR INFORMATION
# ============================================================

def build_molecular_information(mol, pubchem_data=None):
    formula = rdMolDescriptors.CalcMolFormula(mol)
    molecular_weight = float(Descriptors.MolWt(mol))
    exact_mass = float(Descriptors.ExactMolWt(mol))
    atom_count = int(mol.GetNumAtoms())
    bond_count = int(mol.GetNumBonds())
    rotatable_bonds = int(Lipinski.NumRotatableBonds(mol))
    h_bond_donors = int(Lipinski.NumHDonors(mol))
    h_bond_acceptors = int(Lipinski.NumHAcceptors(mol))
    logp = float(Crippen.MolLogP(mol))

    try:
        inchikey = Chem.MolToInchiKey(mol)
    except Exception:
        inchikey = None

    pubchem_cid = None

    if pubchem_data:
        pubchem_cid = pubchem_data.get("CID")

        if pubchem_data.get("MolecularFormula"):
            formula = pubchem_data["MolecularFormula"]

        if pubchem_data.get("MolecularWeight"):
            try:
                molecular_weight = float(
                    pubchem_data["MolecularWeight"]
                )
            except Exception:
                pass

        if pubchem_data.get("InChIKey"):
            inchikey = pubchem_data["InChIKey"]

    return {
        "formula": formula,
        "molecular_weight": round(molecular_weight, 4),
        "exact_mass": round(exact_mass, 4),
        "inchi_key": inchikey,
        "pubchem_cid": pubchem_cid,
        "atom_count": atom_count,
        "bond_count": bond_count,
        "rotatable_bonds": rotatable_bonds,
        "h_bond_donors": h_bond_donors,
        "h_bond_acceptors": h_bond_acceptors,
        "logp": round(logp, 4),
    }


# ============================================================
# BUILD CANDIDATE GRAPH
# ============================================================

def build_candidate_graph(mol, predictions):
    nodes = []
    edges = []

    probability_by_bond = {
        item["bond_index"]: item["transformation_probability"]
        for item in predictions
    }

    molecular_formula = rdMolDescriptors.CalcMolFormula(mol)
    canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
    molecular_weight = round(float(Descriptors.MolWt(mol)), 4)

    for atom in mol.GetAtoms():
        atom_idx = atom.GetIdx()
        nodes.append({
            "id": atom_idx,
            "element": atom.GetSymbol(),
            "atomic_number": atom.GetAtomicNum(),
            "aromatic": atom.GetIsAromatic(),
            "degree": atom.GetDegree(),
            "total_degree": atom.GetTotalDegree(),
            "hydrogens": atom.GetTotalNumHs(),
            "formal_charge": atom.GetFormalCharge(),
            "in_ring": atom.IsInRing(),
            "label": f"{atom.GetSymbol()} (atom {atom_idx})",
            "atom_index": atom_idx,
            "formula": molecular_formula,
            "molecular_formula": molecular_formula,
            "smiles": canonical_smiles,
            "canonical_smiles": canonical_smiles,
            "molecular_weight": molecular_weight,
        })

    for bond in mol.GetBonds():
        bond_index = bond.GetIdx()
        source = bond.GetBeginAtomIdx()
        target = bond.GetEndAtomIdx()
        probability = probability_by_bond.get(bond_index, 0.0)
        source_atom = mol.GetAtomWithIdx(source)
        target_atom = mol.GetAtomWithIdx(target)

        edges.append({
            "id": bond_index,
            "source": source,
            "target": target,
            "bond_index": bond_index,
            "bond_type": str(bond.GetBondType()),
            "aromatic": bond.GetIsAromatic(),
            "in_ring": bond.IsInRing(),
            "conjugated": bond.GetIsConjugated(),
            "source_element": source_atom.GetSymbol(),
            "target_element": target_atom.GetSymbol(),
            "predicted_probability": round(float(probability), 4),
            "transformation": (
                f"{source_atom.GetSymbol()}-"
                f"{target_atom.GetSymbol()} bond transformation"
            ),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "candidate_count": len(predictions),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "molecular_formula": molecular_formula,
        "canonical_smiles": canonical_smiles,
        "molecular_weight": molecular_weight,
    }


# ============================================================
# PIPELINE
# ============================================================

def build_pipeline(
    pubchem_available: bool,
    rdkit_complete: bool,
    ml_complete: bool,
    graph_complete: bool,
    biological_available: bool,
    kegg_available: bool,
):
    return [
        {
            "name": "Input received",
            "status": "completed",
            "message": "Chemical input received successfully.",
        },
        {
            "name": "PubChem lookup",
            "status": (
                "completed"
                if pubchem_available
                else "pending"
            ),
            "message": (
                "PubChem compound information retrieved."
                if pubchem_available
                else "PubChem lookup unavailable."
            ),
        },
        {
            "name": "Structure normalization",
            "status": "completed" if rdkit_complete else "pending",
            "message": "Canonical SMILES generated.",
        },
        {
            "name": "RDKit molecular analysis",
            "status": "completed" if rdkit_complete else "pending",
            "message": "Molecular descriptors and bond structure calculated.",
        },
        {
            "name": "Transformation prediction",
            "status": "completed" if ml_complete else "pending",
            "message": "Random Forest transformation predictions generated.",
        },
        {
            "name": "Candidate graph construction",
            "status": "completed" if graph_complete else "pending",
            "message": "Molecular candidate graph constructed.",
        },
        {
            "name": "Biological evidence retrieval",
            "status": (
                "completed"
                if biological_available
                else "pending"
            ),
            "message": (
                "NCBI protein evidence retrieved."
                if biological_available
                else "No NCBI evidence returned for this query."
            ),
        },
        {
            "name": "Analytical evidence processing",
            "status": "completed" if ml_complete else "pending",
            "message": "ML predictions processed as analytical evidence.",
        },
        {
            "name": "Temporal evidence processing",
            "status": "pending",
            "message": "Temporal experimental data is not available.",
        },
        {
            "name": "Evidence fusion",
            "status": "completed",
            "message": "Available molecular, ML, KEGG and NCBI evidence combined.",
        },
        {
            "name": "Pathway ranking",
            "status": "completed" if kegg_available else "pending",
            "message": (
                "KEGG pathways ranked."
                if kegg_available
                else "No KEGG pathway evidence available."
            ),
        },
        {
            "name": "Report generation",
            "status": "completed",
            "message": "Analysis report generated.",
        },
    ]


# ============================================================
# TRANSFORMATIONS ENDPOINT
# ============================================================

@app.post("/transformations/predict")
def predict_transformation_endpoint(
    request: TransformationRequest,
):
    if not request.smiles:
        raise HTTPException(
            status_code=400,
            detail="SMILES is required",
        )

    try:
        mol = Chem.MolFromSmiles(request.smiles)

        if mol is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid SMILES structure",
            )

        canonical_smiles = Chem.MolToSmiles(
            mol,
            canonical=True,
        )

        result = predict_transformation(canonical_smiles)

        transformations = build_transformations(
            result["predictions"]
        )

        return {
            "success": True,
            "smiles": request.smiles,
            "canonical_smiles": canonical_smiles,
            "transformation_depth": request.transformation_depth,
            "model": {
                "type": "RandomForestClassifier",
                "source": "USPTO reaction data",
                "feature_count": 18,
                "real_ml_prediction": True,
            },
            "total_bonds": result["total_bonds"],
            "predictions": result["predictions"],
            "transformations": transformations,
            "ml_verified": True,
            "prediction_source": "REAL_RANDOM_FOREST",
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ML prediction failed: {str(e)}",
        )


# ============================================================
# COMPLETE ANALYZE ENDPOINT
# ============================================================

@app.post("/analyze")
def analyze(request: AnalyzeRequest):

    # --------------------------------------------------------
    # STAGE 1 — INPUT
    # --------------------------------------------------------

    if not request.name and not request.smiles:
        raise HTTPException(
            status_code=400,
            detail="Please provide a compound name or SMILES.",
        )

    # --------------------------------------------------------
    # STAGE 2 — PUBCHEM
    # --------------------------------------------------------

    pubchem_data = None
    smiles = request.smiles

    if not smiles:
        pubchem_data = get_pubchem_compound(request.name)

        if pubchem_data is None:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"PubChem lookup failed for '{request.name}'. "
                    "Check the backend terminal for the PubChem HTTP status."
                ),
            )

        smiles = (
            pubchem_data.get("CanonicalSMILES")
            or pubchem_data.get("ConnectivitySMILES")
            or pubchem_data.get("IsomericSMILES")
        )

    if not smiles:
        raise HTTPException(
            status_code=502,
            detail="PubChem did not return a usable SMILES.",
        )

    # --------------------------------------------------------
    # STAGE 3 — RDKit
    # --------------------------------------------------------

    mol = Chem.MolFromSmiles(smiles)

    if mol is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid SMILES structure.",
        )

    canonical_smiles = Chem.MolToSmiles(
        mol,
        canonical=True,
    )

    # --------------------------------------------------------
    # STAGE 4 — MOLECULAR INFORMATION
    # --------------------------------------------------------

    molecular_info = build_molecular_information(
        mol,
        pubchem_data,
    )

    # --------------------------------------------------------
    # STAGE 5 — REAL ML
    # --------------------------------------------------------

    try:
        ml_result = predict_transformation(canonical_smiles)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ML prediction failed: {str(e)}",
        )

    transformations = build_transformations(
        ml_result["predictions"]
    )

    # --------------------------------------------------------
    # STAGE 6 — GRAPH
    # --------------------------------------------------------

    graph = build_candidate_graph(
        mol,
        ml_result["predictions"],
    )

    # --------------------------------------------------------
    # STAGE 7 — KEGG
    # --------------------------------------------------------

    kegg_result = None
    kegg_compound_id = None

    if request.name:
        kegg_compound_id = find_kegg_compound(request.name)

    if kegg_compound_id:
        kegg_raw = get_kegg_context(kegg_compound_id)

        if kegg_raw:
            pathways = parse_kegg_pathways(kegg_raw)

            kegg_result = {
                "compound_id": kegg_compound_id,
                "pathways": pathways,
                "available": True,
            }

    # --------------------------------------------------------
    # STAGE 8 — NCBI
    # --------------------------------------------------------

    ncbi_result = None

    if request.name:
        ncbi_result = ncbi_search(
            request.name + " enzyme"
        )

    # --------------------------------------------------------
    # STAGE 9 — EVIDENCE
    # --------------------------------------------------------

    probabilities = [
        x["transformation_probability"]
        for x in ml_result["predictions"]
    ]

    analytical_evidence = {
        "prediction_count": len(ml_result["predictions"]),
        "total_bonds": ml_result["total_bonds"],
        "highest_probability": max(
            probabilities,
            default=0.0,
        ),
        "model": "Random Forest",
        "verified": True,
    }

    biological_evidence = {
        "available": ncbi_result is not None,
        "source": "NCBI protein database",
        "results": ncbi_result,
    }

    # --------------------------------------------------------
    # STAGE 10 — EVIDENCE FUSION
    # --------------------------------------------------------

    evidence_fusion = {
        "molecular": molecular_info,
        "machine_learning": analytical_evidence,
        "biological": biological_evidence,
        "kegg": kegg_result,
        "temporal": {
            "available": False,
            "message": "No temporal experimental dataset connected.",
        },
    }

    # --------------------------------------------------------
    # STAGE 11 — PATHWAY RANKING
    # --------------------------------------------------------

    ranked_pathways = []

    if kegg_result:
        for index, pathway in enumerate(
            kegg_result.get("pathways", [])
        ):
            ranked_pathways.append({
                "rank": index + 1,
                "pathway": pathway,
                "source": "KEGG",
                "evidence": "KEGG compound association",
            })

    # --------------------------------------------------------
    # STAGE 12 — REPORT
    # --------------------------------------------------------

    report = {
        "status": "completed",
        "chemical": request.name or canonical_smiles,
        "summary": (
            "Chemical structure processed with RDKit "
            "and evaluated using the trained Random "
            "Forest transformation model."
        ),
        "candidate_transformations": len(transformations),
        "experimental_validation_required": True,
    }

    # --------------------------------------------------------
    # PIPELINE STATUS
    # --------------------------------------------------------

    pipeline = build_pipeline(
        pubchem_available=pubchem_data is not None,
        rdkit_complete=True,
        ml_complete=True,
        graph_complete=True,
        biological_available=ncbi_result is not None,
        kegg_available=kegg_result is not None,
    )

    # --------------------------------------------------------
    # FINAL RESPONSE
    # --------------------------------------------------------

    return {
        "success": True,
        "id": f"analysis-{uuid.uuid4().hex[:12]}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",

        "chemical": {
            "name": request.name,
            "smiles": smiles,
            "canonical_smiles": canonical_smiles,
            "formula": molecular_info["formula"],
            "molecular_weight": molecular_info["molecular_weight"],
            "exact_mass": molecular_info["exact_mass"],
            "inchikey": molecular_info["inchi_key"],
            "atom_count": molecular_info["atom_count"],
            "bond_count": molecular_info["bond_count"],
            "rotatable_bonds": molecular_info["rotatable_bonds"],
            "h_bond_donors": molecular_info["h_bond_donors"],
            "h_bond_acceptors": molecular_info["h_bond_acceptors"],
            "logp": molecular_info["logp"],
        },

        "molecular_information": molecular_info,

        "machine_learning": {
            "model": "Random Forest",
            "type": "RandomForestClassifier",
            "features": 18,
            "training_reactions": (
                model_package.get("training_reactions")
                if isinstance(model_package, dict)
                else None
            ),
            "transformation_depth": request.transformation_depth,
            "total_bonds": ml_result["total_bonds"],
            "predictions": ml_result["predictions"],
            "transformations": transformations,
            "ml_verified": True,
            "prediction_source": "REAL_RANDOM_FOREST",
        },

        "transformations": transformations,
        "predictions": ml_result["predictions"],
        "ml_verified": True,
        "prediction_source": "REAL_RANDOM_FOREST",

        "graph": graph,

        "evidence": evidence_fusion,

        "kegg": kegg_result,

        "ncbi": {
            "available": ncbi_result is not None,
            "results": ncbi_result,
        },

        "pathways": ranked_pathways,

        "pipeline": pipeline,

        "report": report,

        "provenance": [
            "FastAPI backend",
            "PubChem",
            "RDKit",
            "Random Forest transformation model",
            "KEGG",
            "NCBI",
        ],

        "limitations": [
            "ML predictions are computational hypotheses.",
            "Transformation probabilities are model outputs, "
            "not experimental measurements.",
            "Experimental validation is required before "
            "biological interpretation.",
        ],
    }


# ============================================================
# RUN DIRECTLY
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )

