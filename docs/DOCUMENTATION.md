# XenoEvolve Omics — Project Documentation

## 1. Overview

XenoEvolve Omics is a computational workbench for exploring how xenobiotic
(foreign) chemicals may be transformed biologically. A user enters a chemical
name or SMILES string. The backend looks up the structure, predicts which bonds
are likely to transform with a Random Forest model, generates hypothetical
cleavage products, and attaches database context (KEGG, NCBI). The frontend
presents the results next to optional experimental evidence (LC-MS/MS,
time-course data).

**Everything the model produces is a hypothesis.** The UI and API deliberately
avoid inventing values: fields that were not measured or returned are shown as
unavailable rather than imputed.

| Part     | Stack                                                        |
|----------|--------------------------------------------------------------|
| Frontend | React 18, TypeScript, Vite 6, React Router 6, Recharts       |
| Backend  | FastAPI, RDKit, scikit-learn (Random Forest), requests       |
| Data     | PubChem, KEGG, NCBI (queried live by the backend)            |

## 2. Repository layout

```
xenoevlove/
├── src/                      React frontend
│   ├── app/App.tsx           Route table (lazy-loaded pages)
│   ├── components/           Shell (nav/layout), GraphView, ui helpers, toasts
│   ├── pages/                One file per workspace page
│   ├── services/api.ts       API client, response normalisation
│   ├── state/Workspace.tsx   Global state: analysis, history, health, demo mode
│   ├── models.ts             TypeScript types, evidence weights, XES formula
│   └── demo.ts               Clearly-labelled illustrative demo data
├── backend/
│   ├── main.py               FastAPI app, /analyze pipeline, benchmark endpoints
│   ├── extra_routes.py       History, temporal, MS/MS, report endpoints
│   ├── product_generation.py Bond-cleavage candidate products
│   ├── requirements.txt
│   ├── data/                 Runtime data (git-ignored): analyses.json, reports/
│   └── ml/
│       ├── prepare_training_data.py, features.py, train_model.py
│       ├── evaluate_model.py, ablation_evaluation.py, predict.py
│       ├── data/             raw_{train,val,test}.csv, training_data.csv,
│       │                     benchmark_results.json, ablation_results.json
│       └── models/           transformation_model.joblib, cleavage_model.joblib
├── docs/DOCUMENTATION.md     This file
├── .env.example, vite.config.ts, tsconfig.json, package.json
```

Files named `*_backup.py`, `*.backup`, `*.before_validation_update`,
`AnalyzeChemical_old.txt` and `models_backup.ts` are old copies and are not used.

## 3. Setup and running

Requirements: Node.js 22 and pnpm 11 for the frontend; Python 3 with the
packages in `backend/requirements.txt` for the backend.

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

**Frontend**

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # type-check + production bundle
pnpm typecheck    # strict TypeScript only
```

**Pointing the frontend at the backend.** The API base URL is resolved in this
order: the value saved in **Settings** (browser `localStorage`, key
`xenoevolve.apiBase`), then `VITE_API_BASE_URL`, then the built-in default
`http://127.0.0.1:8001`. Note that `.env.example` sets `/api`, which only works
behind a reverse proxy. Never put credentials in `VITE_*` variables.

The backend needs internet access for PubChem, KEGG and NCBI lookups. Searching
by SMILES skips PubChem.

## 4. Analysis pipeline (`POST /analyze`)

1. **Input** — a name or a SMILES string (one is required).
2. **PubChem** — resolves a name to a structure and properties.
3. **Structure normalisation** — RDKit canonical SMILES.
4. **Molecular analysis** — formula, mass, InChIKey, atom/bond counts,
   rotatable bonds, H-bond donors/acceptors, LogP.
5. **Transformation prediction** — for each bond, 18 atom/bond features
   (atomic numbers, degree, hydrogens, charge, aromaticity, ring membership,
   bond type, conjugation) go into the Random Forest, which returns a
   transformation probability.
6. **Candidate products** — the highest-scoring non-ring, non-aromatic bonds are
   cleaved (up to 5 candidates). Each result is sanitised with RDKit. This
   proves structural validity only, not chemical or biological plausibility.
7. **Candidate graph** — atoms as nodes, bonds as edges with probabilities.
8. **Evidence retrieval** — KEGG pathways and NCBI protein records.
9. **Evidence fusion and pathway ranking** — KEGG-associated pathways are listed
   in rank order; temporal evidence is marked unavailable unless supplied.
10. **Report** — summary stored with the analysis.

The response includes `id`, `chemical`, `transformations`, `candidate_products`,
`graph`, `evidence`, `pathways`, `pipeline` (per-stage status), `provenance` and
`limitations`. Completed analyses are kept in memory (last 200) and saved to
`backend/data/analyses.json`.

## 5. API reference

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/` , `/health` | Service info; model, RDKit, PubChem/KEGG/NCBI status |
| POST | `/analyze` | Full pipeline. Body: `{name?, smiles?, transformation_depth?}` |
| POST | `/transformations/predict` | Bond predictions only. Body: `{smiles, transformation_depth?}` |
| GET  | `/pubchem/{name}` | PubChem compound lookup |
| GET  | `/kegg/context/{id}` | KEGG compound/pathway context |
| GET  | `/ncbi/context/{query}` | NCBI protein search |
| POST | `/benchmark/run` | Body `{analysis_id}`; returns stored test-set metrics |
| POST | `/ablation/run` | Body `{analysis_id}`; returns stored ablation results |
| GET  | `/analysis/history` | Saved analyses (id, date, status, compound summary) |
| GET  | `/analysis/{id}` | One full saved analysis |
| POST | `/temporal/analyze` | Time-course analysis (see 5.1) |
| POST | `/msms/analyze` | Multipart upload: `file`, optional `analysis_id` (see 5.2) |
| POST | `/report/generate` | Body `{analysis_id, format?, disclaimer?}`; builds a PDF |
| GET  | `/report/download/{id}` | Download a generated PDF |

Interactive docs are served by FastAPI at `/docs`.

### 5.1 Temporal analysis

Input observations are `{time_point, compound, abundance, replicate?}`. The
parent is the linked analysis compound, otherwise the most abundant compound at
the first time point. Returned fields: `time_series`,
`parent_depletion_evidence` (change from first to last time point),
`product_appearance_order` (first time each product reaches 10% of its own
maximum), `parent_product_correlation` (Pearson r, needs at least 3 paired
points) and `replicate_consistency` (mean coefficient of variation). Time
labels are ordered by their numeric part (`0h`, `2h`, `4h`).

### 5.2 LC-MS/MS upload

Accepted formats: `.mzML`, `.mzXML`, `.mgf`, `.msp`, `.csv`, `.txt` (up to
50 MB). CSV/TXT needs an `mz` column and may have `intensity` and `rt`. The
response lists features (m/z, retention time, intensity), a chromatogram, the
most peak-rich spectrum, and candidate matches. When an `analysis_id` is linked,
each feature m/z is compared with the exact masses of the parent and the
RDKit-valid candidate products as `[M+H]+` and `[M-H]-`, using a 5 ppm
tolerance. Isotope patterns and fragment annotation are not scored. A mass match
alone does not confirm identity.

## 6. Frontend pages

| Route | Page | What it does |
|-------|------|--------------|
| `/` | Landing | Intro and a labelled demo mode |
| `/dashboard` | Dashboard | Backend status and entry points |
| `/analyze` | Analyze Chemical | Run an analysis; pipeline status, candidates, profile |
| `/graph` | Transformation Graph | Interactive candidate graph |
| `/evidence` | Evidence Engine | XenoEvolve Evidence Score (XES) breakdown |
| `/pathways` | Pathway Explorer | Filter and sort pathway hypotheses |
| `/omics` | Omics Evidence | Gene/enzyme records, when returned |
| `/msms` | LC-MS/MS Evidence | Upload and view analytical features |
| `/temporal` | Temporal Analysis | Paste time-course CSV |
| `/kegg`, `/ncbi` | Context pages | Look up KEGG / NCBI records via the backend |
| `/benchmarking` | Benchmarking | Model metrics and ablation study |
| `/reports` | Reports | Export JSON, CSV, PDF, or print |
| `/history` | Analysis History | Backend and browser-local records |
| `/project-info`, `/settings` | Info / Settings | About, API base URL, chart preferences |

State lives in `src/state/Workspace.tsx`: the current analysis, history
(also mirrored to `localStorage`), backend health and toasts. **Demo mode**
loads illustrative sample data and marks it "DEMO DATA" everywhere.

## 7. Evidence score (XES)

`XES = 0.20·chemical + 0.25·omics + 0.30·msms + 0.15·temporal + 0.10·literature`

Each component is a number from 0 to 1. If any component is missing, no overall
score is shown (nothing is imputed). The weights are defined in
`src/models.ts`. In development builds they can be overridden through
`localStorage` key `xenoevolve.devWeights`, provided they sum to 1.

## 8. Machine-learning model

- **Task:** per-bond binary classification, whether a bond is transformed.
- **Model:** scikit-learn `RandomForestClassifier`, 18 features, trained on
  30,000 reactions (`backend/ml/data/raw`).
- **Test-set results** (`benchmark_results.json`, 5,007 reactions, 53,011 bonds):
  accuracy 0.878, precision 0.741, recall 0.769, F1 0.755, ROC-AUC 0.923.
- **Retrain / evaluate:**

```bash
cd backend
python ml/prepare_training_data.py
python ml/train_model.py
python ml/evaluate_model.py
python ml/ablation_evaluation.py
```

The `/benchmark/run` and `/ablation/run` endpoints return the stored result
files; they do not retrain the model.

## 9. Limitations

- Predictions and candidate products are computational hypotheses.
- RDKit sanitisation checks structure, not whether a reaction occurs in biology.
  Cleaving some bonds (for example a C=O double bond) gives valid but weak
  candidates.
- Candidate generation skips ring and aromatic bonds.
- Pathway "ranking" currently lists KEGG compound associations in returned
  order. It is not a scored ranking, and compounds without KEGG pathways get
  none.
- Omics evidence is not computed by the backend; the Omics page shows records
  only if some are returned.
- Analysis history is a local JSON file, suitable for a single-user setup.
- The backend allows all CORS origins; restrict this before any public
  deployment.
