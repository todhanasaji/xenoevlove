# ============================================================
# XenoEvolve Omics
# CLEAN FASTAPI BACKEND
# Random Forest ML + PubChem + KEGG + NCBI
# ============================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from pathlib import Path

import requests
import joblib
import numpy as np
import uuid
import re

from rdkit import Chem

from ml.features import molecule_to_bonds


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="XenoEvolve Omics API",
    description="Computational Xenobiotic Enzyme Matrix Pipeline",
    version="5.0.0"
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
# MODEL
# ============================================================

model_package = None
model = None


try:

    model_package = joblib.load(
        MODEL_PATH
    )

    if isinstance(
        model_package,
        dict
    ):

        model = model_package.get(
            "model"
        )

    else:

        model = model_package


    print("=" * 70)
    print("XENOEVOLVE OMICS")
    print("TRANSFORMATION ML MODEL LOADED")
    print("=" * 70)

    print(
        "Model file:",
        MODEL_PATH
    )

    print(
        "Model type:",
        type(model).__name__
    )

    print(
        "Feature count:",
        getattr(
            model,
            "n_features_in_",
            "UNKNOWN"
        )
    )

    if isinstance(
        model_package,
        dict
    ):

        print(
            "Training reactions:",
            model_package.get(
                "training_reactions"
            )
        )

        print(
            "Feature names:",
            model_package.get(
                "feature_names"
            )
        )

    print("=" * 70)


except Exception as e:

    print("=" * 70)
    print("ERROR LOADING ML MODEL")
    print("=" * 70)

    print(e)

    print("=" * 70)


# ============================================================
# REQUEST MODELS
# ============================================================

class TransformationRequest(
    BaseModel
):

    smiles: str

    transformation_depth: int = 1


class AnalyzeRequest(
    BaseModel
):

    name: Optional[str] = None

    smiles: Optional[str] = None

    transformation_depth: int = 1


class ChemicalInput(
    BaseModel
):

    query: str


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {

        "project":
            "XenoEvolve Omics",

        "status":
            "running",

        "version":
            "5.0.0",

        "model":
            "RandomForestClassifier",

        "model_loaded":
            model is not None,

        "feature_count":
            (
                getattr(
                    model,
                    "n_features_in_",
                    None
                )
                if model is not None
                else None
            ),

        "prediction_source":
            "REAL_RANDOM_FOREST",

        "endpoints": [

            "/",

            "/health",

            "/transformations/predict",

            "/analyze",

            "/chemical",

            "/pubchem/{compound_name}",

            "/kegg/context/{compound_id}",

            "/ncbi/context/{query}",

            "/docs"
        ]
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    return {

        "status":
            "healthy",

        "model_loaded":
            model is not None,

        "model_file":
            str(MODEL_PATH),

        "model_type":
            (
                type(model).__name__
                if model is not None
                else None
            ),

        "feature_count":
            (
                getattr(
                    model,
                    "n_features_in_",
                    None
                )
                if model is not None
                else None
            ),

        "training_reactions":
            (
                model_package.get(
                    "training_reactions"
                )
                if isinstance(
                    model_package,
                    dict
                )
                else None
            ),

        "prediction_source":
            "REAL_RANDOM_FOREST"
    }


# ============================================================
# PUBCHEM
# ============================================================

def get_pubchem_compound(compound_name: str):

    url = (
        "https://pubchem.ncbi.nlm.nih.gov/"
        "rest/pug/compound/name/"
        f"{requests.utils.quote(compound_name)}"
        "/property/"
        "Title,"
        "SMILES,"
        "ConnectivitySMILES,"
        "MolecularFormula,"
        "MolecularWeight,"
        "InChIKey/JSON"
    )

    try:

        response = requests.get(
            url,
            timeout=15
        )

        print("PubChem URL:", url)
        print("PubChem status:", response.status_code)

        if response.status_code != 200:

            print(
                "PubChem response:",
                response.text
            )

            return None

        data = response.json()

        properties = (
            data
            .get("PropertyTable", {})
            .get("Properties", [])
        )

        if not properties:

            print("PubChem returned no properties")

            return None

        return properties[0]

    except Exception as e:

        print(
            "PubChem error:",
            e
        )

        return None
#=============================================
# PUBCHEM ENDPOINT
#=============================================

@app.get(
    "/pubchem/{compound_name}"
)
def pubchem(
    compound_name: str
):

    result = get_pubchem_compound(
        compound_name
    )

    if result is None:

        raise HTTPException(
            status_code=404,
            detail=
            "Compound not found in PubChem"
        )

    return {

        "success":
            True,

        "source":
            "PubChem",

        "data":
            result
    }


# ============================================================
# KEGG SEARCH
# ============================================================

def find_kegg_compound(
    compound_name: str
):

    url = (
        "https://rest.kegg.jp/"
        "find/compound/"
        f"{requests.utils.quote(compound_name)}"
    )

    try:

        response = requests.get(
            url,
            timeout=20
        )

        if response.status_code != 200:

            return None

        text = response.text.strip()

        if not text:

            return None

        for line in text.splitlines():

            parts = line.split("\t")

            if len(parts) >= 1:

                match = re.search(
                    r"C\d{5}",
                    parts[0]
                )

                if match:

                    return match.group(0)

        return None

    except Exception as e:

        print(
            "KEGG search error:",
            e
        )

        return None


# ============================================================
# KEGG CONTEXT
# ============================================================

def get_kegg_context(
    compound_id: str
):

    compound_id = (
        compound_id
        .upper()
        .strip()
        .replace(
            "CP:",
            ""
        )
    )

    if not re.fullmatch(
        r"C\d{5}",
        compound_id
    ):

        return None

    url = (
        "https://rest.kegg.jp/"
        f"get/cpd:{compound_id}"
    )

    try:

        response = requests.get(
            url,
            timeout=20
        )

        if response.status_code != 200:

            return None

        return response.text

    except Exception as e:

        print(
            "KEGG context error:",
            e
        )

        return None


# ============================================================
# KEGG PATHWAYS
# ============================================================

def parse_kegg_pathways(
    kegg_text: str
):

    pathways = []

    if not kegg_text:

        return pathways

    for line in kegg_text.splitlines():

        if line.startswith(
            "PATHWAY"
        ):

            content = (
                line[
                    len("PATHWAY"):
                ]
                .strip()
            )

            if content:

                pathways.append(
                    content
                )

    return list(
        dict.fromkeys(
            pathways
        )
    )


# ============================================================
# KEGG ENDPOINT
# ============================================================

@app.get(
    "/kegg/context/{compound_id}"
)
def kegg_context(
    compound_id: str
):

    raw_data = get_kegg_context(
        compound_id
    )

    if raw_data is None:

        raise HTTPException(
            status_code=404,
            detail=
            "KEGG compound not found"
        )

    return {

        "success":
            True,

        "compound_id":
            compound_id.upper(),

        "pathways":
            parse_kegg_pathways(
                raw_data
            ),

        "data":
            raw_data
    }


# ============================================================
# NCBI SEARCH
# ============================================================

def ncbi_search(
    query: str
):

    url = (
        "https://eutils.ncbi.nlm.nih.gov/"
        "entrez/eutils/esearch.fcgi"
    )

    params = {

        "db":
            "protein",

        "term":
            query,

        "retmode":
            "json",

        "retmax":
            10
    }

    try:

        response = requests.get(
            url,
            params=params,
            timeout=20
        )

        if response.status_code != 200:

            return None

        return response.json()

    except Exception as e:

        print(
            "NCBI error:",
            e
        )

        return None


# ============================================================
# NCBI ENDPOINT
# ============================================================

@app.get(
    "/ncbi/context/{query}"
)
def ncbi_context(
    query: str
):

    result = ncbi_search(
        query
    )

    if result is None:

        raise HTTPException(
            status_code=500,
            detail=
            "NCBI request failed"
        )

    return {

        "success":
            True,

        "query":
            query,

        "database":
            "protein",

        "results":
            result
    }


# ============================================================
# REAL RANDOM FOREST PREDICTION
# ============================================================

def predict_transformation(
    smiles: str
):

    # --------------------------------------------------------
    # MODEL CHECK
    # --------------------------------------------------------

    if model is None:

        raise RuntimeError(
            "Random Forest model is not loaded"
        )


    # --------------------------------------------------------
    # RDKit
    # --------------------------------------------------------

    mol, bonds = molecule_to_bonds(
        smiles
    )

    if mol is None:

        raise ValueError(
            "Invalid SMILES structure"
        )


    if not bonds:

        return {

            "total_bonds":
                0,

            "predictions":
                []
        }


    # --------------------------------------------------------
    # FEATURE MATRIX
    # --------------------------------------------------------

    X = np.asarray(
        [
            bond["features"]
            for bond in bonds
        ],
        dtype=float
    )


    # --------------------------------------------------------
    # MODEL FEATURE COUNT
    # --------------------------------------------------------

    expected_features = getattr(
        model,
        "n_features_in_",
        X.shape[1]
    )


    if X.shape[1] != expected_features:

        raise RuntimeError(

            "Feature mismatch: "

            f"model expects "
            f"{expected_features} "

            f"features but RDKit generated "
            f"{X.shape[1]}"
        )


    # --------------------------------------------------------
    # REAL RANDOM FOREST
    # --------------------------------------------------------

    predictions = model.predict(
        X
    )


    # --------------------------------------------------------
    # REAL PROBABILITY
    # --------------------------------------------------------

    if not hasattr(
        model,
        "predict_proba"
    ):

        raise RuntimeError(
            "Loaded model does not support predict_proba()"
        )


    probabilities = model.predict_proba(
        X
    )


    classes = list(
        model.classes_
    )


    # Find class 1 safely
    positive_class = 1

    if positive_class in classes:

        positive_index = classes.index(
            positive_class
        )

    else:

        # If classes are strings,
        # try string version.

        if "1" in classes:

            positive_index = classes.index(
                "1"
            )

        else:

            raise RuntimeError(
                "Model does not contain a positive class 1"
            )


    probabilities_1 = (
        probabilities[
            :,
            positive_index
        ]
    )


    # --------------------------------------------------------
    # BUILD RESULTS
    # --------------------------------------------------------

    results = []


    for i, bond in enumerate(
        bonds
    ):

        probability = float(
            probabilities_1[i]
        )

        prediction = int(
            predictions[i]
        )


        # ----------------------------------------------------
        # CONFIDENCE
        # ----------------------------------------------------

        if probability >= 0.80:

            confidence = "HIGH"

        elif probability >= 0.60:

            confidence = "MODERATE"

        elif probability >= 0.40:

            confidence = "LOW"

        else:

            confidence = "VERY_LOW"


        # ----------------------------------------------------
        # BOND INFO
        # ----------------------------------------------------

        bond_index = int(
            bond["bond_index"]
        )

        atom1 = int(
            bond["atom1"]
        )

        atom2 = int(
            bond["atom2"]
        )


        atom1_symbol = (
            mol
            .GetAtomWithIdx(
                atom1
            )
            .GetSymbol()
        )


        atom2_symbol = (
            mol
            .GetAtomWithIdx(
                atom2
            )
            .GetSymbol()
        )


        rdkit_bond = (
            mol
            .GetBondWithIdx(
                bond_index
            )
        )


        bond_type = str(
            rdkit_bond.GetBondType()
        )


        # ----------------------------------------------------
        # RESULT
        # ----------------------------------------------------

        results.append({

            "id":
                str(uuid.uuid4()),

            "bond_index":
                bond_index,

            "atom1":
                atom1,

            "atom2":
                atom2,

            "atom_a":
                atom1_symbol,

            "atom_b":
                atom2_symbol,

            "bond_type":
                bond_type,

            "prediction":
                prediction,

            "transformation_probability":
                round(
                    probability,
                    4
                ),

            "cleavage_probability":
                round(
                    probability,
                    4
                ),

            "confidence":
                confidence,

            "evidence_status":
                "ML_PREDICTED",

            "model":
                "Random Forest",

            "feature_count":
                int(
                    X.shape[1]
                )
        })


    # --------------------------------------------------------
    # SORT
    # --------------------------------------------------------

    results.sort(
        key=lambda x:
            x[
                "transformation_probability"
            ],
        reverse=True
    )


    return {

        "total_bonds":
            len(bonds),

        "predictions":
            results
    }


# ============================================================
# ONLY TRANSFORMATION ENDPOINT
# ============================================================

@app.post(
    "/transformations/predict"
)
def transformations_predict(
    request: TransformationRequest
):

    # --------------------------------------------------------
    # VALIDATE
    # --------------------------------------------------------

    if not request.smiles:

        raise HTTPException(
            status_code=400,
            detail=
            "SMILES is required"
        )


    try:

        # ----------------------------------------------------
        # RDKit
        # ----------------------------------------------------

        mol = Chem.MolFromSmiles(
            request.smiles
        )

        if mol is None:

            raise HTTPException(
                status_code=400,
                detail=
                "Invalid SMILES structure"
            )


        # ----------------------------------------------------
        # CANONICAL SMILES
        # ----------------------------------------------------

        canonical_smiles = (
            Chem.MolToSmiles(
                mol,
                canonical=True
            )
        )


        # ----------------------------------------------------
        # REAL ML
        # ----------------------------------------------------

        result = predict_transformation(
            canonical_smiles
        )


        # ----------------------------------------------------
        # FRONTEND TRANSFORMATIONS
        # ----------------------------------------------------

        transformations = []


        for item in result[
            "predictions"
        ]:

            transformations.append({

                "id":
                    item["id"],

                "candidate":
                    (
                        f"Bond "
                        f"{item['bond_index'] + 1}"
                    ),

                "reaction":
                    "Potential bond transformation",

                "step":
                    1,

                "predicted_probability":
                    item[
                        "transformation_probability"
                    ],

                "transformation_probability":
                    item[
                        "transformation_probability"
                    ],

                "cleavage_probability":
                    item[
                        "cleavage_probability"
                    ],

                "enzyme_class":
                    "Transformation candidate",

                "evidence_status":
                    "ML_PREDICTED",

                "confidence":
                    item["confidence"],

                "evidence": {

                    "bond_index":
                        item["bond_index"],

                    "atom_a":
                        item["atom_a"],

                    "atom_b":
                        item["atom_b"],

                    "atom_a_index":
                        item["atom1"],

                    "atom_b_index":
                        item["atom2"],

                    "bond_type":
                        item["bond_type"]
                },

                "model":
                    "Random Forest",

                "feature_count":
                    item["feature_count"]
            })


        # ----------------------------------------------------
        # RESPONSE
        # ----------------------------------------------------

        return {

            "success":
                True,

            "smiles":
                request.smiles,

            "canonical_smiles":
                canonical_smiles,

            "transformation_depth":
                request.transformation_depth,

            "model": {

                "type":
                    "RandomForestClassifier",

                "source":
                    "USPTO reaction data",

                "feature_count":
                    int(
                        getattr(
                            model,
                            "n_features_in_",
                            18
                        )
                    ),

                "real_ml_prediction":
                    True
            },

            "total_bonds":
                result[
                    "total_bonds"
                ],

            "predictions":
                result[
                    "predictions"
                ],

            "transformations":
                transformations,

            "ml_verified":
                True,

            "prediction_source":
                "REAL_RANDOM_FOREST"
        }


    except HTTPException:

        raise


    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=
                f"ML prediction failed: {str(e)}"
        )


# ============================================================
# COMPLETE ANALYZE ENDPOINT
# ============================================================

@app.post(
    "/analyze"
)
def analyze(
    request: AnalyzeRequest
):

    # --------------------------------------------------------
    # VALIDATE
    # --------------------------------------------------------

    if (
        not request.name
        and not request.smiles
    ):

        raise HTTPException(
            status_code=400,
            detail=
            "Please provide a compound name or SMILES"
        )


    # --------------------------------------------------------
    # GET SMILES
    # --------------------------------------------------------

    pubchem_data = None

    smiles = request.smiles


    if not smiles:

        pubchem_data = (
            get_pubchem_compound(
                request.name
            )
        )

        if pubchem_data is None:

            raise HTTPException(
                status_code=404,
                detail=
                "Compound could not be found in PubChem"
            )


        smiles = (

            pubchem_data.get(
                "ConnectivitySMILES"
            )

            or

            pubchem_data.get(
                "CanonicalSMILES"
            )

            or

            pubchem_data.get(
                "IsomericSMILES"
            )
        )


    if not smiles:

        raise HTTPException(
            status_code=404,
            detail=
            "No usable SMILES found"
        )


    # --------------------------------------------------------
    # RDKit
    # --------------------------------------------------------

    mol = Chem.MolFromSmiles(
        smiles
    )


    if mol is None:

        raise HTTPException(
            status_code=400,
            detail=
            "Invalid SMILES structure"
        )


    canonical_smiles = (
        Chem.MolToSmiles(
            mol,
            canonical=True
        )
    )


    # --------------------------------------------------------
    # ML
    # --------------------------------------------------------

    try:

        ml_result = predict_transformation(
            canonical_smiles
        )

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=
                f"ML prediction failed: {str(e)}"
        )


    # --------------------------------------------------------
    # MOLECULAR INFORMATION
    # --------------------------------------------------------

    molecular_info = {

        "formula":
            None,

        "molecular_weight":
            None,

        "inchi_key":
            None,

        "pubchem_cid":
            None
    }


    if pubchem_data:

        molecular_info = {

            "formula":
                pubchem_data.get(
                    "MolecularFormula"
                ),

            "molecular_weight":
                pubchem_data.get(
                    "MolecularWeight"
                ),

            "inchi_key":
                pubchem_data.get(
                    "InChIKey"
                ),

            "pubchem_cid":
                pubchem_data.get(
                    "CID"
                )
        }


    # --------------------------------------------------------
    # KEGG
    # --------------------------------------------------------

    kegg_result = None


    if request.name:

        kegg_id = find_kegg_compound(
            request.name
        )


        if kegg_id:

            raw_kegg = get_kegg_context(
                kegg_id
            )


            if raw_kegg:

                kegg_result = {

                    "compound_id":
                        kegg_id,

                    "pathways":
                        parse_kegg_pathways(
                            raw_kegg
                        ),

                    "available":
                        True
                }


    # --------------------------------------------------------
    # NCBI
    # --------------------------------------------------------

    ncbi_result = None


    if request.name:

        ncbi_result = ncbi_search(
            request.name
            + " enzyme"
        )


    # --------------------------------------------------------
    # FRONTEND TRANSFORMATIONS
    # --------------------------------------------------------

    transformations = []


    for item in ml_result[
        "predictions"
    ]:

        transformations.append({

            "id":
                item["id"],

            "candidate":
                (
                    f"Bond "
                    f"{item['bond_index'] + 1}"
                ),

            "reaction":
                "Potential bond transformation",

            "step":
                1,

            "predicted_probability":
                item[
                    "transformation_probability"
                ],

            "transformation_probability":
                item[
                    "transformation_probability"
                ],

            "cleavage_probability":
                item[
                    "cleavage_probability"
                ],

            "enzyme_class":
                "Transformation candidate",

            "evidence_status":
                "ML_PREDICTED",

            "confidence":
                item["confidence"],

            "evidence": {

                "bond_index":
                    item["bond_index"],

                "atom_a":
                    item["atom_a"],

                "atom_b":
                    item["atom_b"],

                "bond_type":
                    item["bond_type"]
            },

            "model":
                "Random Forest",

            "feature_count":
                item["feature_count"]
        })


    # --------------------------------------------------------
    # FINAL
    # --------------------------------------------------------

    return {

        "success":
            True,

        "chemical": {

            "name":
                request.name,

            "smiles":
                smiles,

            "canonical_smiles":
                canonical_smiles
        },

        "molecular_information":
            molecular_info,

        "machine_learning": {

            "model":
                "Random Forest",

            "features":
                18,

            "training_reactions":
                (
                    model_package.get(
                        "training_reactions"
                    )
                    if isinstance(
                        model_package,
                        dict
                    )
                    else None
                ),

            "transformation_depth":
                request.transformation_depth,

            "total_bonds":
                ml_result[
                    "total_bonds"
                ],

            "predictions":
                ml_result[
                    "predictions"
                ],

            "transformations":
                transformations,

            "ml_verified":
                True,

            "prediction_source":
                "REAL_RANDOM_FOREST"
        },

        "kegg":
            kegg_result,

        "ncbi": {

            "available":
                ncbi_result is not None,

            "results":
                ncbi_result
        },

        "pipeline": [

            "Input chemical",

            "PubChem compound retrieval",

            "SMILES extraction",

            "RDKit molecular processing",

            "18-feature bond extraction",

            "Random Forest prediction",

            "Real ML probability calculation",

            "Bond probability ranking",

            "KEGG compound mapping",

            "KEGG pathway retrieval",

            "NCBI protein evidence retrieval",

            "Evidence-aware result generation"
        ]
    }


# ============================================================
# SIMPLE CHEMICAL ENDPOINT
# ============================================================

@app.post(
    "/chemical"
)
def chemical_query(
    data: ChemicalInput
):

    pubchem = get_pubchem_compound(
        data.query
    )


    if pubchem is None:

        return {

            "success":
                False,

            "query":
                data.query,

            "properties":
                {}
        }


    return {

        "success":
            True,

        "query":
            data.query,

        "properties":
            pubchem
    }


# ============================================================
# STARTUP
# ============================================================

@app.on_event(
    "startup"
)
async def startup_event():

    print()
    print("=" * 70)
    print("XENOEVOLVE OMICS BACKEND STARTED")
    print("=" * 70)

    print(
        "Transformation endpoint:"
        " POST /transformations/predict"
    )

    print(
        "Analyze endpoint:"
        " POST /analyze"
    )

    print(
        "Model loaded:",
        model is not None
    )

    if model is not None:

        print(
            "Model type:",
            type(model).__name__
        )

        print(
            "Features:",
            getattr(
                model,
                "n_features_in_",
                None
            )
        )

    print("=" * 70)
    print()


# ============================================================
# LOCAL RUN
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(

        "main:app",

        host="127.0.0.1",

        port=8000,

        reload=True
    )