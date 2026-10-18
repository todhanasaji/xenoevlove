# XenoEvolve Omics

A scientific workbench for exploring how xenobiotic chemicals may be transformed biologically. Enter a chemical name or SMILES; the FastAPI backend resolves the structure (PubChem, RDKit), predicts bond transformations with a Random Forest model, generates hypothetical cleavage products and attaches KEGG/NCBI context. The React frontend presents these next to optional LC-MS/MS and time-course evidence.

- **Frontend:** React 18, TypeScript, Vite, React Router, Recharts
- **Backend:** FastAPI, RDKit, scikit-learn, requests

Full documentation (pipeline, API reference, model results, limitations) is in [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md), also available as `docs/XenoEvolve_Documentation.docx`.

## Quick start

Requirements: Node.js 22, pnpm 11 and Python 3. The backend needs internet access for PubChem, KEGG and NCBI.

**1. Backend** (http://127.0.0.1:8001)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

**2. Frontend** (http://localhost:3000)

```bash
pnpm install
pnpm dev
```

Open the app, go to **Analyze Chemical** and run a compound such as `aspirin`. The header shows "Backend connected" when the frontend can reach the API.

Other scripts: `pnpm build` (type-check and production bundle), `pnpm typecheck` (strict TypeScript only).

## Configuration

The frontend picks the API base URL in this order: the value saved in **Settings**, the `VITE_API_BASE_URL` build-time variable, then the default `http://127.0.0.1:8001`. `.env.example` sets `/api`, which only works behind a reverse proxy that forwards `/api` to the backend. Configure external-service credentials only on the backend; never in `VITE_*` variables or browser storage.

## Backend endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Model, RDKit and PubChem/KEGG/NCBI status |
| `POST /analyze` | Full analysis pipeline |
| `POST /transformations/predict` | Bond-level predictions only |
| `GET /pubchem/{name}`, `/kegg/context/{id}`, `/ncbi/context/{query}` | Database lookups |
| `POST /benchmark/run`, `/ablation/run` | Stored model evaluation results |
| `GET /analysis/history`, `/analysis/{id}` | Saved analyses (kept in `backend/data/`, git-ignored) |
| `POST /temporal/analyze` | Time-course evidence from supplied observations |
| `POST /msms/analyze` | LC-MS/MS upload (mzML, mzXML, MGF, MSP, CSV/TXT, up to 50 MB) |
| `POST /report/generate`, `GET /report/download/{id}` | PDF report |

Interactive API docs are served at `/docs`. The frontend's client is in `src/services/api.ts`.

## Machine-learning model

A Random Forest classifier predicts, per bond, whether it is transformed (18 atom and bond features, trained on 30,000 reactions). On the held-out test set it scores accuracy 0.878 and ROC-AUC 0.923. To retrain or re-evaluate, run the scripts in `backend/ml/`; see the documentation for the order.

## Scientific status

All outputs are computational hypotheses unless confirmed experimentally. RDKit validation checks that a product structure is valid, not that the reaction occurs in biology. No fallback values are invented: evidence that is unavailable (omics, LC-MS/MS, temporal, KEGG, NCBI, benchmarks) is shown as unavailable, and no overall evidence score is computed from missing components. Optional examples use only explicitly supplied sample values and are marked **DEMO DATA**; they are not measured results.

Old copies of source files (`*_backup.py`, `*.backup`, `*.before_validation_update`, `models_backup.ts`, `AnalyzeChemical_old.txt`) are kept for reference and are not used.
