# XenoEvolve Omics

A React + TypeScript scientific workbench for inspecting xenobiotic transformation hypotheses and evidence returned by a FastAPI service. The UI is prepared for the REST contract in the project brief; this repository does not include or claim a running scientific backend.

## Run locally

Requirements: Node.js 22 and pnpm 11.

```bash
pnpm install
pnpm dev
```

For a production bundle, run `pnpm build`. `pnpm typecheck` runs strict TypeScript diagnostics.

## Backend configuration

The browser API base defaults to `/api`. Set the non-secret `VITE_API_BASE_URL` build-time variable or change it in **Settings** to target the deployed FastAPI service. The client uses the configured service for analysis, evidence, omics, LC-MS/MS uploads, temporal analysis, KEGG/NCBI context, benchmarking, history and reports. Configure external-service credentials only on the backend—never in `VITE_*` variables or browser storage.

Expected endpoints are documented in `src/services/api.ts`. A successful backend health response is required before the UI reports the backend connected; individual service availability is shown only when explicitly returned by health data.

## Scientific status and example data

No local predictor or service-response fallback is used. Backend results remain backend-reported; unavailable analytical, omics, temporal, KEGG, NCBI and benchmark evidence is shown as unavailable. Optional examples use only explicitly supplied brief values and are marked **DEMO DATA**; they are not measured results or validation. Candidate pathways are hypotheses unless suitable experimental/reference-standard evidence is returned.
