import type {
  AnalysisResult,
  ApiHealth,
} from '../models';

// ============================================================
// XenoEvolve OMICS
// Frontend API service
// FastAPI + Random Forest ML
// ============================================================

export class ApiError extends Error {
  status?: number;

  code:
    | 'network'
    | 'timeout'
    | 'http'
    | 'invalid_response'
    | 'configuration';

  constructor(
    message: string,
    code: ApiError['code'],
    status?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// ============================================================
// CONFIGURATION
// ============================================================

const API_BASE_KEY =
  'xenoevolve.apiBase';

const DEFAULT_API_BASE =
  'http://127.0.0.1:8001';

const DEFAULT_TIMEOUT_MS =
  30_000;

// ============================================================
// API BASE URL
// ============================================================

export function getApiBase(): string {
  const saved =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(
          API_BASE_KEY
        )
      : null;

  const configured =
    saved ||
    import.meta.env.VITE_API_BASE_URL ||
    DEFAULT_API_BASE;

  return (
    configured
      .trim()
      .replace(/\/$/, '') ||
    DEFAULT_API_BASE
  );
}

// ============================================================
// SAVE API BASE
// ============================================================

export function saveApiBase(
  value: string
): void {
  const normalized =
    value.trim().replace(/\/$/, '');

  if (!normalized) {
    throw new ApiError(
      'Enter a FastAPI base URL.',
      'configuration'
    );
  }

  if (
    !normalized.startsWith('/') &&
    !/^https?:\/\//i.test(normalized)
  ) {
    throw new ApiError(
      'Use a valid HTTP(S) URL such as http://127.0.0.1:8000.',
      'configuration'
    );
  }

  window.localStorage.setItem(
    API_BASE_KEY,
    normalized
  );
}

// ============================================================
// BASIC HELPERS
// ============================================================

function objectOrEmpty(
  value: unknown
): Record<string, any> {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as Record<string, any>;
  }

  return {};
}

function numberOrUndefined(
  value: unknown
): number | undefined {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const number =
      Number(value);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return undefined;
}

function stringOrUndefined(
  value: unknown
): string | undefined {
  return typeof value === 'string'
    ? value
    : undefined;
}

// ============================================================
// GENERIC REQUEST
// ============================================================

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const base =
    getApiBase();

  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () => {
        controller.abort(
          new DOMException(
            'Request timed out',
            'TimeoutError'
          )
        );
      },
      options.timeoutMs ??
        DEFAULT_TIMEOUT_MS
    );

  const relayAbort = () => {
    controller.abort(
      options.signal?.reason
    );
  };

  options.signal?.addEventListener(
    'abort',
    relayAbort,
    { once: true }
  );

  try {
    const url =
      `${base}${
        path.startsWith('/')
          ? path
          : `/${path}`
      }`;

    const response =
      await fetch(
        url,
        {
          method:
            options.method ??
            'GET',

          headers:
            options.body === undefined
              ? {
                  Accept:
                    'application/json',
                }
              : {
                  Accept:
                    'application/json',

                  'Content-Type':
                    'application/json',
                },

          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(
                  options.body
                ),

          signal:
            controller.signal,

          credentials:
            'same-origin',
        }
      );

    const contentType =
      response.headers.get(
        'content-type'
      ) ?? '';

    const text =
      await response.text();

    let data: unknown =
      undefined;

    if (text) {
      if (
        !contentType
          .toLowerCase()
          .includes('json')
      ) {
        throw new ApiError(
          'FastAPI returned a non-JSON response.',
          'invalid_response',
          response.status
        );
      }

      try {
        data =
          JSON.parse(text);
      } catch {
        throw new ApiError(
          'FastAPI returned malformed JSON.',
          'invalid_response',
          response.status
        );
      }
    }

    if (!response.ok) {
      const payload =
        data &&
        typeof data === 'object'
          ? data as Record<
              string,
              unknown
            >
          : {};

      const detail =
        payload.detail ??
        payload.message ??
        payload.error;

      throw new ApiError(
        typeof detail === 'string'
          ? detail
          : `FastAPI returned HTTP ${response.status}.`,
        'http',
        response.status
      );
    }

    return data as T;

  } catch (error) {

    if (
      error instanceof ApiError
    ) {
      throw error;
    }

    if (
      controller.signal.aborted
    ) {
      const reason =
        controller.signal.reason;

      if (
        reason instanceof DOMException &&
        reason.name ===
          'TimeoutError'
      ) {
        throw new ApiError(
          'The FastAPI request timed out.',
          'timeout'
        );
      }

      throw new ApiError(
        'The request was cancelled.',
        'network'
      );
    }

    throw new ApiError(
      'Could not reach the FastAPI backend. Make sure it is running on port 8001.',
      'network'
    );

  } finally {

    window.clearTimeout(
      timeout
    );

    options.signal?.removeEventListener(
      'abort',
      relayAbort
    );
  }
}

// ============================================================
// NORMALIZE ML PREDICTIONS
// ============================================================

function normalizePredictions(
  value: Record<string, unknown>
): any[] {

  const machineLearning =
    objectOrEmpty(
      value.machine_learning
    );

  let predictions:
    unknown[] = [];

  // ----------------------------------------------------------
  // LOCATION 1
  // machine_learning.predictions
  // ----------------------------------------------------------

  if (
    Array.isArray(
      machineLearning.predictions
    )
  ) {
    predictions =
      machineLearning.predictions;
  }

  // ----------------------------------------------------------
  // LOCATION 2
  // predictions
  // ----------------------------------------------------------

  else if (
    Array.isArray(
      value.predictions
    )
  ) {
    predictions =
      value.predictions;
  }

  // ----------------------------------------------------------
  // LOCATION 3
  // transformations
  // ----------------------------------------------------------

  else if (
    Array.isArray(
      value.transformations
    )
  ) {
    predictions =
      value.transformations;
  }

  // ----------------------------------------------------------
  // CONVERT EACH PREDICTION
  // ----------------------------------------------------------

  return predictions.map(
    (
      prediction,
      index
    ) => {

      const item =
        objectOrEmpty(
          prediction
        );

      // ------------------------------------------------------
      // PROBABILITY
      // ------------------------------------------------------

      const probability =
        numberOrUndefined(
          item.transformation_probability
        ) ??
        numberOrUndefined(
          item.cleavage_probability
        ) ??
        numberOrUndefined(
          item.predicted_probability
        ) ??
        numberOrUndefined(
          item.probability
        );

      // ------------------------------------------------------
      // BOND INDEX
      // ------------------------------------------------------

      const bondIndex =
        numberOrUndefined(
          item.bond_index
        ) ?? index;

      // ------------------------------------------------------
      // ATOMS
      // ------------------------------------------------------

      const atomA =
        stringOrUndefined(
          item.atom_a
        ) ??
        stringOrUndefined(
          item.atom1_symbol
        ) ??
        '?';

      const atomB =
        stringOrUndefined(
          item.atom_b
        ) ??
        stringOrUndefined(
          item.atom2_symbol
        ) ??
        '?';

      // ------------------------------------------------------
      // BOND TYPE
      // ------------------------------------------------------

      const bondType =
        stringOrUndefined(
          item.bond_type
        ) ??
        'UNKNOWN';

      // ------------------------------------------------------
      // CONFIDENCE
      // ------------------------------------------------------

      const backendConfidence =
        typeof item.confidence ===
        'string'
          ? item.confidence.toUpperCase()
          : '';

      let confidence:
        | 'CONFIRMED'
        | 'PUTATIVE'
        | 'TENTATIVE'
        | 'LOW CONFIDENCE'
        | 'UNKNOWN';

      if (
        backendConfidence === 'HIGH'
      ) {
        confidence =
          'PUTATIVE';
      }

      else if (
        backendConfidence ===
        'MODERATE'
      ) {
        confidence =
          'TENTATIVE';
      }

      else if (
        backendConfidence ===
          'LOW' ||
        backendConfidence ===
          'VERY_LOW'
      ) {
        confidence =
          'LOW CONFIDENCE';
      }

      else if (
        typeof probability ===
        'number'
      ) {

        if (
          probability >= 0.80
        ) {
          confidence =
            'PUTATIVE';
        }

        else if (
          probability >= 0.50
        ) {
          confidence =
            'TENTATIVE';
        }

        else {
          confidence =
            'LOW CONFIDENCE';
        }

      }

      else {
        confidence =
          'UNKNOWN';
      }

      // ------------------------------------------------------
      // FRONTEND TRANSFORMATION OBJECT
      // ------------------------------------------------------

      return {

        id:
          stringOrUndefined(
            item.id
          ) ??
          `prediction-${index + 1}`,

        candidate:
          atomA !== '?' &&
          atomB !== '?'
            ? `${atomA}-${atomB} bond transformation`
            : `Bond ${bondIndex + 1} transformation`,

        reaction:
          stringOrUndefined(
            item.reaction
          ) ??
          'ML-predicted bond transformation',

        step:
          numberOrUndefined(
            item.step
          ) ?? 1,

        predicted_probability:
          probability,

        enzyme_class:
          stringOrUndefined(
            item.enzyme_class
          ) ??
          'Candidate enzyme (putative)',

        exact_mass:
          numberOrUndefined(
            item.exact_mass
          ),

        evidence_status:
          stringOrUndefined(
            item.evidence_status
          ) ??
          'ML_PREDICTED',

        confidence,

        evidence: {

          bond_index:
            bondIndex,

          atom1:
            item.atom1,

          atom2:
            item.atom2,

          atom_a:
            atomA,

          atom_b:
            atomB,

          bond_type:
            bondType,

          prediction:
            item.prediction,

          transformation_probability:
            numberOrUndefined(
              item.transformation_probability
            ),

          cleavage_probability:
            numberOrUndefined(
              item.cleavage_probability
            ),

          confidence:
            stringOrUndefined(
              item.confidence
            ),

          model:
            stringOrUndefined(
              item.model
            ) ??
            'Random Forest',

          feature_count:
            numberOrUndefined(
              item.feature_count
            ),
        },
      };
    }
  );
}

// ============================================================
// NORMALIZE ANALYSIS RESPONSE
// ============================================================

function normalizeAnalysisResponse(
  value: unknown
): AnalysisResult {

  const data =
    objectOrEmpty(value);

  // ==========================================================
  // BACKEND SECTIONS
  // ==========================================================

  const chemical =
    objectOrEmpty(
      data.chemical
    );

  const molecularInformation =
    objectOrEmpty(
      data.molecular_information
    );

  const machineLearning =
    objectOrEmpty(
      data.machine_learning
    );

  // ==========================================================
  // CHEMICAL NAME
  // ==========================================================

  const compoundName =
    stringOrUndefined(
      chemical.name
    ) ??
    stringOrUndefined(
      data.name
    );

  // ==========================================================
  // FORMULA
  // ==========================================================

  const formula =
    stringOrUndefined(
      molecularInformation.formula
    ) ??
    stringOrUndefined(
      chemical.formula
    );

  // ==========================================================
  // MOLECULAR WEIGHT
  // ==========================================================

  const molecularWeight =
    numberOrUndefined(
      molecularInformation.molecular_weight
    ) ??
    numberOrUndefined(
      chemical.molecular_weight
    );

  // ==========================================================
  // SMILES
  // ==========================================================

  const canonicalSmiles =
    stringOrUndefined(
      chemical.canonical_smiles
    ) ??
    stringOrUndefined(
      chemical.smiles
    ) ??
    stringOrUndefined(
      data.canonical_smiles
    ) ??
    stringOrUndefined(
      data.smiles
    );

  // ==========================================================
  // INCHIKEY
  // ==========================================================

  const inchikey =
    stringOrUndefined(
      molecularInformation.inchi_key
    ) ??
    stringOrUndefined(
      molecularInformation.inchikey
    ) ??
    stringOrUndefined(
      chemical.inchikey
    );

  // ==========================================================
  // MOLECULAR COUNTS
  // ==========================================================

  const atomCount =
    numberOrUndefined(
      molecularInformation.atom_count
    ) ??
    numberOrUndefined(
      machineLearning.atom_count
    ) ??
    numberOrUndefined(
      chemical.atom_count
    );

  const bondCount =
    numberOrUndefined(
      machineLearning.total_bonds
    ) ??
    numberOrUndefined(
      molecularInformation.bond_count
    ) ??
    numberOrUndefined(
      chemical.bond_count
    ) ??
    numberOrUndefined(
      data.total_bonds
    );

  // ==========================================================
  // OTHER MOLECULAR PROPERTIES
  // ==========================================================

  const rotatableBonds =
    numberOrUndefined(
      molecularInformation.rotatable_bonds
    );

  const hBondDonors =
    numberOrUndefined(
      molecularInformation.h_bond_donors
    );

  const hBondAcceptors =
    numberOrUndefined(
      molecularInformation.h_bond_acceptors
    );

  const logP =
    numberOrUndefined(
      molecularInformation.logp
    );

  // ==========================================================
  // ML TRANSFORMATIONS
  // ==========================================================

  const transformations =
    normalizePredictions(
      data
    );

  // ==========================================================
  // PIPELINE
  // ==========================================================

  const pipeline =
    Array.isArray(data.pipeline)
      ? data.pipeline
      : undefined;

  // ==========================================================
  // GRAPH
  // ==========================================================

  const graph =
    data.graph &&
    typeof data.graph === 'object' &&
    !Array.isArray(data.graph)
      ? data.graph
      : undefined;

  // ==========================================================
  // EVIDENCE
  // ==========================================================

  const evidence =
    data.evidence &&
    typeof data.evidence === 'object' &&
    !Array.isArray(data.evidence)
      ? data.evidence
      : {};

  // ==========================================================
  // PATHWAYS
  // ==========================================================

  const pathways =
    Array.isArray(
      data.pathways
    )
      ? data.pathways
      : [];

  // ==========================================================
  // CREATE PROPER AnalysisResult
  //
  // IMPORTANT:
  // We explicitly create an AnalysisResult here.
  // We do NOT do:
  //
  // return data as AnalysisResult
  //
  // This fixes your TS2352 error.
  // ==========================================================

  const result: AnalysisResult = {

    id:
      stringOrUndefined(
        data.id
      ) ??
      `analysis-${Date.now()}`,

    created_at:
      stringOrUndefined(
        data.created_at
      ) ??
      new Date().toISOString(),

    status:
      stringOrUndefined(
        data.status
      ) ??
      'completed',

    compound: {

      name:
        compoundName,

      formula:
        formula,

      molecular_weight:
        molecularWeight,

      canonical_smiles:
        canonicalSmiles,

      inchikey:
        inchikey,

      atom_count:
        atomCount,

      bond_count:
        bondCount,

      rotatable_bonds:
        rotatableBonds,

      h_bond_donors:
        hBondDonors,

      h_bond_acceptors:
        hBondAcceptors,

      logp:
        logP,

      structure_svg:
        stringOrUndefined(
          chemical.structure_svg
        ),
    },

    transformations:
      transformations,

    graph:
      graph as any,

    evidence:
      evidence as any,

    pathways:
      pathways as any[],

    annotation_confidence:
      'UNKNOWN',

    pathway_confidence:
      'UNKNOWN',

    provenance: [
      'FastAPI backend',
      'PubChem',
      'RDKit',
      'Random Forest transformation model',
    ],

    limitations: [
      'ML predictions are hypotheses and require experimental validation.',
      'Transformation probabilities represent model predictions and are not experimental measurements.',
    ],

    raw:
      data,
  };

  // ==========================================================
  // ATTACH BACKEND METADATA
  // ==========================================================

  const extended =
    result as AnalysisResult &
      Record<string, any>;

  extended.ml_verified =
    data.ml_verified ??
    true;

  extended.prediction_source =
    data.prediction_source ??
    'Random Forest';

  extended.model =
    data.model ??
    machineLearning.model ??
    'Random Forest';

  extended.total_bonds =
    data.total_bonds ??
    bondCount;

  extended.pipeline =
    pipeline;

  extended.machine_learning =
    machineLearning;

  return result;
}

// ============================================================
// FORM DATA REQUEST
// ============================================================

async function fetchForm<
  T = Record<string, unknown>
>(
  path: string,
  form: FormData,
  signal?: AbortSignal
): Promise<T> {

  const base =
    getApiBase();

  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () => {
        controller.abort(
          new DOMException(
            'Upload timed out',
            'TimeoutError'
          )
        );
      },
      120_000
    );

  const relayAbort = () => {
    controller.abort(
      signal?.reason
    );
  };

  signal?.addEventListener(
    'abort',
    relayAbort,
    { once: true }
  );

  try {

    const response =
      await fetch(
        `${base}${path}`,
        {
          method: 'POST',

          body: form,

          signal:
            controller.signal,

          headers: {
            Accept:
              'application/json',
          },
        }
      );

    const contentType =
      response.headers.get(
        'content-type'
      ) ?? '';

    let data:
      unknown = undefined;

    if (
      contentType
        .toLowerCase()
        .includes('json')
    ) {
      data =
        await response.json();
    }

    if (!response.ok) {

      const payload =
        data &&
        typeof data === 'object'
          ? data as Record<
              string,
              unknown
            >
          : {};

      const detail =
        payload.detail ??
        payload.message ??
        payload.error;

      throw new ApiError(
        typeof detail === 'string'
          ? detail
          : `FastAPI returned HTTP ${response.status}.`,
        'http',
        response.status
      );
    }

    if (!data) {
      throw new ApiError(
        'The backend returned a non-JSON response.',
        'invalid_response',
        response.status
      );
    }

    return data as T;

  } catch (error) {

    if (
      error instanceof ApiError
    ) {
      throw error;
    }

    if (
      controller.signal.aborted
    ) {

      const reason =
        controller.signal.reason;

      if (
        reason instanceof DOMException &&
        reason.name ===
          'TimeoutError'
      ) {
        throw new ApiError(
          'File upload timed out.',
          'timeout'
        );
      }

      throw new ApiError(
        'File upload was cancelled.',
        'network'
      );
    }

    throw new ApiError(
      'Could not reach the FastAPI backend.',
      'network'
    );

  } finally {

    window.clearTimeout(
      timeout
    );

    signal?.removeEventListener(
      'abort',
      relayAbort
    );
  }
}

// ============================================================
// API
// ============================================================

export const api = {

  // ==========================================================
  // RAW REQUEST
  // ==========================================================

  request,

  // ==========================================================
  // HEALTH
  // ==========================================================

  health:
    async (): Promise<ApiHealth> => {

      const value =
        await request<
          Record<string, unknown>
        >(
          '/health',
          {
            timeoutMs: 6_000,
          }
        );

      return {

        connected:
          true,

        checkedAt:
          new Date().toISOString(),

        rdkit:
          typeof value.rdkit_ready ===
          'boolean'
            ? value.rdkit_ready
            : typeof value.rdkit ===
              'boolean'
              ? value.rdkit
              : null,

        services:
          value.services &&
          typeof value.services ===
            'object'
            ? value.services as Record<
                string,
                boolean |
                string |
                null
              >
            : undefined,

        message:
          stringOrUndefined(
            value.message
          ),
      };
    },

  // ==========================================================
  // MAIN ANALYSIS
  // ==========================================================

  analyze:
    async (
      payload: {
        name?: string;
        smiles?: string;
        transformation_depth?: number;
      },
      signal?: AbortSignal
    ): Promise<AnalysisResult> => {

      const response =
        await request<
          Record<string, unknown>
        >(
          '/analyze',
          {
            method: 'POST',

            body:
              payload,

            signal:
              signal,

            timeoutMs:
              120_000,
          }
        );

      return normalizeAnalysisResponse(
        response
      );
    },

  // ==========================================================
  // CHEMICAL LOOKUP
  // ==========================================================

  lookupChemical:
    (
      payload: {
        name?: string;
        smiles?: string;
      },
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/chemical/lookup',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // STRUCTURE
  // ==========================================================

  processStructure:
    (
      payload: {
        smiles: string;
      },
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/structure/process',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // TRANSFORMATION PREDICTION
  // ==========================================================

  predictTransformations:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/transformations/predict',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,

          timeoutMs:
            60_000,
        }
      ),

  // ==========================================================
  // GRAPH
  // ==========================================================

  buildGraph:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/graph/build',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // EVIDENCE
  // ==========================================================

  calculateEvidence:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/evidence/calculate',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // PATHWAYS
  // ==========================================================

  rankPathways:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/pathways/rank',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // OMICS
  // ==========================================================

  analyzeOmics:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/omics/analyze',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // MS/MS
  // ==========================================================

  analyzeMsms:
    (
      form: FormData,
      signal?: AbortSignal
    ) =>
      fetchForm(
        '/msms/analyze',
        form,
        signal
      ),

  // ==========================================================
  // TEMPORAL
  // ==========================================================

  analyzeTemporal:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/temporal/analyze',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,
        }
      ),

  // ==========================================================
  // KEGG
  // ==========================================================

  keggContext:
    (
      id: string,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        `/kegg/context/${encodeURIComponent(id)}`,
        {
          signal:
            signal,
        }
      ),

  // ==========================================================
  // NCBI
  // ==========================================================

  ncbiContext:
    (
      id: string,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        `/ncbi/context/${encodeURIComponent(id)}`,
        {
          signal:
            signal,
        }
      ),

  // ==========================================================
  // BENCHMARK
  // ==========================================================

  runBenchmark:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/benchmark/run',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,

          timeoutMs:
            120_000,
        }
      ),

  // ==========================================================
  // ABLATION
  // ==========================================================

  runAblation:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/ablation/run',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,

          timeoutMs:
            120_000,
        }
      ),

  // ==========================================================
  // HISTORY
  // ==========================================================

  analysisHistory:
    (
      signal?: AbortSignal
    ) =>
      request<{
        analyses?:
          AnalysisResult[];
      }>(
        '/analysis/history',
        {
          signal:
            signal,
        }
      ),

  // ==========================================================
  // REPORT
  // ==========================================================

  generateReport:
    (
      payload:
        Record<string, unknown>,
      signal?: AbortSignal
    ) =>
      request<
        Record<string, unknown>
      >(
        '/report/generate',
        {
          method: 'POST',

          body:
            payload,

          signal:
            signal,

          timeoutMs:
            60_000,
        }
      ),
};
