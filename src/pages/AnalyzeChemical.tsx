import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Beaker,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Clock3,
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { api, ApiError } from '../services/api';
import {
  calculateXes,
  getEvidenceWeights,
  PIPELINE_STEPS,
  type AnalysisResult,
  type PipelineStep,
  type TransformationCandidate,
} from '../models';

import { useWorkspace } from '../state/Workspace';

import {
  Badge,
  ConfidenceBadge,
  DemoNotice,
  EmptyState,
  PageHeading,
  Panel,
  StatusNote,
} from '../components/ui';

type CandidateProduct = {
  id?: string | number;
  product_smiles?: string[];
  atom1_index?: number;
  atom2_index?: number;
  atom1_element?: string;
  atom2_element?: string;
  cleaved_bond_index?: number;
  bond_index?: number;
  predicted_probability?: number;
  transformation_probability?: number;
  probability?: number;
  fragment_count?: number;
  validation?: {
    rdkit_valid?: boolean;
    sanitized?: boolean;
    chemical_plausibility_assessed?: boolean;
    validation_error?: string | null;
  };
  evidence_status?: string;
  experimental_validation_required?: boolean;
};

export function AnalyzeChemical() {
  const {
    analysis,
    demoMode,
    setAnalysis,
    setDemoMode,
    notify,
    health,
  } = useWorkspace();

  const [inputType, setInputType] =
    useState<'name' | 'smiles'>('name');

  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [pipeline, setPipeline] = useState<PipelineStep[]>(
    PIPELINE_STEPS.map((name) => ({
      name,
      status: 'pending',
    }))
  );

  const [backendPipelineNote, setBackendPipelineNote] =
    useState(
      'Per-stage progress is shown only when returned by the FastAPI backend.'
    );

  const [selectedCandidate, setSelectedCandidate] =
    useState<TransformationCandidate | null>(null);

  const [showProfile, setShowProfile] = useState(false);

  const requestController =
    useRef<AbortController | null>(null);

  const navigate = useNavigate();

  const candidates = useMemo(
    () => analysis?.transformations ?? [],
    [analysis]
  );
  const candidateProducts = useMemo<CandidateProduct[]>(() => {
    const current = analysis as any;
    const raw = current?.raw;
    const products: unknown =
      current?.candidate_products ??
      raw?.candidate_products ??
      raw?.raw?.candidate_products ??
      raw?.data?.candidate_products;

    if (!Array.isArray(products)) return [];

    // Normalize backend field variants without inventing validation results.
    return products.map((item: any, index: number) => ({
      ...item,
      id: item?.id ?? `product-${index + 1}`,
      product_smiles: Array.isArray(item?.product_smiles)
        ? item.product_smiles
        : Array.isArray(item?.fragments)
          ? item.fragments
          : [],
      cleaved_bond_index:
        item?.cleaved_bond_index ?? item?.bond_index,
      predicted_probability:
        item?.predicted_probability ??
        item?.transformation_probability ??
        item?.probability,
      fragment_count:
        typeof item?.fragment_count === 'number'
          ? item.fragment_count
          : Array.isArray(item?.product_smiles)
            ? item.product_smiles.length
            : Array.isArray(item?.fragments)
              ? item.fragments.length
              : undefined,
    }));
  }, [analysis]);

  // ============================================================
  // LOAD EXAMPLE
  // ============================================================

  const loadExample = () => {
    setInputType('name');
    setValue('Aspirin');
    setError('');
    setAnalysis(null);

    setPipeline(
      PIPELINE_STEPS.map((name) => ({
        name,
        status: 'pending',
      }))
    );

    notify(
      'Example input loaded',
      'info',
      'This fills the input only; it does not represent an analysis result.'
    );
  };


  // ============================================================
  // CLEAR
  // ============================================================

  const clearForm = () => {
    setValue('');
    setError('');
    setSelectedCandidate(null);
    setAnalysis(null);

    setPipeline(
      PIPELINE_STEPS.map((name) => ({
        name,
        status: 'pending',
      }))
    );

    setBackendPipelineNote(
      'Per-stage progress is shown only when returned by the FastAPI backend.'
    );
  };


  // ============================================================
  // RUN ANALYSIS
  // ============================================================

  const runAnalysis = async () => {

    if (!value.trim()) {
      setError(
        'Enter a chemical name or SMILES before analyzing.'
      );
      return;
    }

    setError('');
    setBusy(true);

    // Make sure real backend mode is used
    setDemoMode(false);

    // Clear previous analysis
    setAnalysis(null);

    // Mark first pipeline stage
    setPipeline(
      PIPELINE_STEPS.map((name, index) => ({
        name,
        status:
          index === 0
            ? 'completed'
            : 'pending',
      }))
    );

    setBackendPipelineNote(
      'Request submitted. Waiting for FastAPI analysis response.'
    );

    const controller = new AbortController();

    requestController.current = controller;


    try {

      // --------------------------------------------------------
      // TRANSFORMATION DEPTH
      // --------------------------------------------------------

      const transformation_depth =
        Number(
          window.localStorage.getItem(
            'xenoevolve.depth'
          ) ?? '2'
        );


      // --------------------------------------------------------
      // REQUEST PAYLOAD
      // --------------------------------------------------------

      const payload =
        inputType === 'name'
          ? {
              name: value.trim(),
              transformation_depth,
            }
          : {
              smiles: value.trim(),
              transformation_depth,
            };


      console.log(
        '[XenoEvolve] Sending analysis request:',
        payload
      );


      // --------------------------------------------------------
      // CALL FASTAPI
      // --------------------------------------------------------

      const raw = await api.analyze(
        payload,
        controller.signal
      );


      console.log(
        '[XenoEvolve] Backend response:',
        raw
      );
      console.log(
        '[XenoEvolve] Raw candidate products:',
        (raw as any).candidate_products ??
          (raw as any).raw?.candidate_products ??
          (raw as any).data?.candidate_products
      );

      // --------------------------------------------------------
      // BASIC RESPONSE VALIDATION
      // --------------------------------------------------------

      if (
        !raw ||
        typeof raw !== 'object'
      ) {
        throw new ApiError(
          'The backend response did not contain a structured analysis object.',
          'invalid_response'
        );
      }


      // --------------------------------------------------------
      // NORMALIZE RESPONSE
      // --------------------------------------------------------

      const source =
        raw as AnalysisResult & {
          chemical?: AnalysisResult['compound'];

          molecular_profile?:
            AnalysisResult['compound'];

          pipeline?: unknown[];

          predictions?: unknown[];

          transformations?: unknown[];

          ml_verified?: boolean;

          prediction_source?: string;

          model?: unknown;

          canonical_smiles?: string;

          smiles?: string;

          total_bonds?: number;
        };


      // --------------------------------------------------------
      // FIND MOLECULAR PROFILE
      // --------------------------------------------------------

      const compound =
        source.compound ??
        source.chemical ??
        source.molecular_profile;


      /*
       * IMPORTANT:
       *
       * Your FastAPI response may contain:
       *
       * chemical
       * molecular_information
       * predictions
       * transformations
       *
       * instead of the exact frontend model shape.
       *
       * We therefore build a safe compound object.
       */

      const molecularInformation =
        (source as any).molecular_information;


      const fallbackCompound =
        molecularInformation
          ? {
              name:
                (source as any).chemical?.name ??
                (source as any).name ??
                value.trim(),

              formula:
                molecularInformation.formula,

              molecular_weight:
                molecularInformation.molecular_weight,

              inchikey:
                molecularInformation.inchi_key ??
                molecularInformation.inchikey,

              canonical_smiles:
                source.canonical_smiles ??
                (source as any).chemical?.canonical_smiles ??
                (inputType === 'smiles'
                  ? value.trim()
                  : undefined),

              atom_count:
                molecularInformation.atom_count,

              bond_count:
                molecularInformation.bond_count,

              rotatable_bonds:
                molecularInformation.rotatable_bonds,

              h_bond_donors:
                molecularInformation.h_bond_donors,

              h_bond_acceptors:
                molecularInformation.h_bond_acceptors,

              logp:
                molecularInformation.logp,
            }
          : undefined;


      const finalCompound =
        compound ??
        fallbackCompound;


      if (
        !finalCompound ||
        typeof finalCompound !== 'object'
      ) {
        throw new ApiError(
          'The backend response did not include a molecular profile.',
          'invalid_response'
        );
      }


      // --------------------------------------------------------
      // NORMALIZE TRANSFORMATION CANDIDATES
      // --------------------------------------------------------

      let normalizedTransformations:
        TransformationCandidate[] = [];


      /*
       * Case 1:
       *
       * Backend already returns transformations
       */

      if (
        Array.isArray(
          (source as any).transformations
        )
      ) {

        normalizedTransformations =
          (source as any).transformations.map(
            (item: any, index: number) => ({
              id:
                item.id ??
                `transformation-${index}`,

              candidate:
                item.candidate ??
                `Bond ${(
                  item.bond_index ??
                  index
                ) + 1}`,

              reaction:
                item.reaction ??
                'Potential bond transformation',

              step:
                item.step ?? 1,

              predicted_probability:
                item.predicted_probability ??
                item.transformation_probability ??
                item.probability,

              enzyme_class:
                item.enzyme_class ??
                'Candidate enzyme (putative)',

              exact_mass:
                item.exact_mass,

              evidence_status:
                item.evidence_status ??
                (
                  source.ml_verified
                    ? 'ML_PREDICTED'
                    : 'PUTATIVE'
                ),

              confidence:
                item.confidence,

              evidence:
                item.evidence,
            })
          );
      }


      /*
       * Case 2:
       *
       * Backend returns predictions[]
       *
       * This matches your current FastAPI ML response.
       */

      else if (
        Array.isArray(
          (source as any).predictions
        )
      ) {

        normalizedTransformations =
          (source as any).predictions.map(
            (item: any, index: number) => ({
              id:
                item.id ??
                `prediction-${index}`,

              candidate:
                item.candidate ??
                `Bond ${
                  (item.bond_index ?? index) + 1
                }`,

              reaction:
                item.reaction ??
                'Potential bond transformation',

              step:
                item.step ?? 1,

              predicted_probability:
                item.predicted_probability ??
                item.transformation_probability ??
                item.probability,

              enzyme_class:
                item.enzyme_class ??
                'Candidate hydrolase (putative)',

              exact_mass:
                item.exact_mass,

              evidence_status:
                item.evidence_status ??
                (
                  source.ml_verified
                    ? 'ML_PREDICTED'
                    : 'PUTATIVE'
                ),

              confidence:
                item.confidence,

              evidence:
                item.evidence ??
                {
                  bond_index:
                    item.bond_index,

                  atom_a:
                    item.atom_a,

                  atom_b:
                    item.atom_b,

                  atom_a_index:
                    item.atom1,

                  atom_b_index:
                    item.atom2,

                  bond_type:
                    item.bond_type,
                },
            })
          );
      }


      // --------------------------------------------------------
      // CREATE FRONTEND ANALYSIS RESULT
      // --------------------------------------------------------

      const result: AnalysisResult = {

        ...source,

        id:
          source.id ??
          `analysis-${Date.now()}`,

        created_at:
          source.created_at ??
          new Date().toISOString(),

        raw:
          source.raw ??
          raw,

        compound: {

          ...(finalCompound as any),

          name:
            (finalCompound as any).name ??
            (
              inputType === 'name'
                ? value.trim()
                : undefined
            ),

          canonical_smiles:
            (finalCompound as any)
              .canonical_smiles ??
            source.canonical_smiles ??
            (
              inputType === 'smiles'
                ? value.trim()
                : undefined
            ),
        },

        transformations:
          normalizedTransformations,

        // Preserve product candidates explicitly so response normalization
        // cannot accidentally hide them from the candidate-products panel.
        candidate_products: (() => {
          const rawResponse = raw as any;
          const products =
            rawResponse.candidate_products ??
            rawResponse.raw?.candidate_products ??
            rawResponse.data?.candidate_products;
          return Array.isArray(products) ? products : [];
        })(),

      } as AnalysisResult;


      // --------------------------------------------------------
      // PIPELINE
      // --------------------------------------------------------
      // The backend currently returns a completed analysis response,
      // but it may not return a `pipeline` array.  The old code treated
      // that case as "everything pending", which is why the UI showed
      // Response received + all pipeline stages PENDING.
      //
      // We now:
      // 1. Use explicit backend pipeline statuses when available.
      // 2. Otherwise infer ONLY the stages that are supported by data
      //    actually present in the backend response.
      // 3. Never mark evidence/pathway stages complete unless the
      //    response contains corresponding evidence.
      // --------------------------------------------------------

      const normalizePipelineName = (name: unknown): string => {
        if (typeof name !== 'string') return '';

        return name
          .toLowerCase()
          .replace(/[_-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const pipelineAliases: Record<string, string[]> = {
        'Input received': [
          'input received',
          'input',
          'request received',
        ],
        'PubChem lookup': [
          'pubchem lookup',
          'pubchem',
          'chemical lookup',
          'compound lookup',
        ],
        'Structure normalization': [
          'structure normalization',
          'normalization',
          'smiles normalization',
          'structure normalized',
        ],
        'RDKit molecular analysis': [
          'rdkit molecular analysis',
          'rdkit analysis',
          'rdkit',
          'molecular analysis',
        ],
        'Transformation prediction': [
          'transformation prediction',
          'transformation',
          'prediction',
          'ml prediction',
        ],
        'Candidate graph construction': [
          'candidate graph construction',
          'candidate graph',
          'graph construction',
        ],
        'Biological evidence retrieval': [
          'biological evidence retrieval',
          'biological evidence',
          'kegg context',
          'ncbi context',
        ],
        'Analytical evidence processing': [
          'analytical evidence processing',
          'analytical evidence',
          'lc-hrms/ms',
          'lc-hrms',
          'msms evidence',
        ],
        'Temporal evidence processing': [
          'temporal evidence processing',
          'temporal evidence',
        ],
        'Evidence fusion': [
          'evidence fusion',
          'evidence score',
          'xes',
        ],
        'Pathway ranking': [
          'pathway ranking',
          'pathway',
          'pathways',
        ],
        'Report generation': [
          'report generation',
          'report',
        ],
      };

      const hasPipeline = Array.isArray(
        (source as any).pipeline
      );

      const explicitPipeline = new Map<
        string,
        { status?: PipelineStep['status']; message?: string }
      >();

      if (hasPipeline) {
        for (const step of (source as any).pipeline) {
          if (typeof step === 'string') {
            explicitPipeline.set(
              normalizePipelineName(step),
              { status: 'completed' }
            );
            continue;
          }

          if (step && typeof step === 'object') {
            const name = normalizePipelineName(step.name);
            if (name) {
              explicitPipeline.set(name, {
                status:
                  step.status === 'completed'
                    ? 'completed'
                    : 'pending',
                message:
                  typeof step.message === 'string'
                    ? step.message
                    : undefined,
              });
            }
          }
        }
      }

      const responseHas = (...keys: string[]) =>
        keys.some((key) => {
          const value = (source as any)[key];
          if (value === undefined || value === null) return false;
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === 'object') return Object.keys(value).length > 0;
          return Boolean(value);
        });

      const inferredCompleted = new Set<string>();

      // A successful /analyze response proves the input reached FastAPI.
      inferredCompleted.add('Input received');

      // The molecular profile shown by this page is evidence that a
      // chemical lookup/annotation was completed.
      if (
        responseHas(
          'chemical',
          'compound',
          'molecular_profile',
          'molecular_information'
        )
      ) {
        inferredCompleted.add('PubChem lookup');
      }

      const canonicalSmiles =
        (source as any).canonical_smiles ??
        (source as any).smiles ??
        (source as any).chemical?.canonical_smiles ??
        (source as any).compound?.canonical_smiles ??
        (source as any).molecular_profile?.canonical_smiles;

      if (canonicalSmiles) {
        inferredCompleted.add('Structure normalization');
      }

      // These descriptors/bond counts are produced from the RDKit side
      // of the backend, so only mark RDKit complete when such data exists.
      if (
        responseHas('molecular_information') ||
        (source as any).compound?.bond_count !== undefined ||
        (source as any).molecular_profile?.bond_count !== undefined ||
        (source as any).total_bonds !== undefined
      ) {
        inferredCompleted.add('RDKit molecular analysis');
      }

      if (
        responseHas('transformations', 'predictions') ||
        (source as any).ml_verified === true ||
        (source as any).prediction_source
      ) {
        inferredCompleted.add('Transformation prediction');
      }

      if (responseHas('graph', 'candidate_graph', 'nodes', 'edges')) {
        inferredCompleted.add('Candidate graph construction');
      }

      if (responseHas('kegg', 'kegg_matches', 'ncbi', 'ncbi_matches', 'enzymes')) {
        inferredCompleted.add('Biological evidence retrieval');
      }

      if (responseHas('msms', 'analytical_evidence', 'lc_hrms', 'lc_hrms_ms')) {
        inferredCompleted.add('Analytical evidence processing');
      }

      if (responseHas('temporal', 'temporal_evidence')) {
        inferredCompleted.add('Temporal evidence processing');
      }

      if (responseHas('evidence', 'evidence_score', 'xes')) {
        inferredCompleted.add('Evidence fusion');
      }

      if (responseHas('pathways', 'pathway', 'pathway_ranking')) {
        inferredCompleted.add('Pathway ranking');
      }

      if (responseHas('report', 'report_generation')) {
        inferredCompleted.add('Report generation');
      }

      const findExplicitStatus = (stepName: string) => {
        const aliases = [
          normalizePipelineName(stepName),
          ...(pipelineAliases[stepName] ?? []),
        ].map(normalizePipelineName);

        for (const alias of aliases) {
          const found = explicitPipeline.get(alias);
          if (found) return found;
        }

        return undefined;
      };

      setPipeline(
        PIPELINE_STEPS.map((name) => {
          const explicit = findExplicitStatus(name);

          if (explicit) {
            return {
              name,
              status: explicit.status ?? 'completed',
              message: explicit.message,
            };
          }

          return {
            name,
            status: inferredCompleted.has(name)
              ? 'completed'
              : 'pending',
          };
        })
      );

      setBackendPipelineNote(
        hasPipeline
          ? 'Pipeline status reflects backend stages; missing stages remain pending.'
          : 'Pipeline status is inferred from verified fields in the backend analysis response.'
      );

      // --------------------------------------------------------
      // SAVE ANALYSIS
      // --------------------------------------------------------

      setAnalysis(
        result,
        true
      );


      setValue('');


      notify(
        'Analysis response received',
        'success',
        'The FastAPI backend returned molecular and ML analysis data.'
      );


    } catch (cause) {

      console.error(
        '[XenoEvolve] Analysis error:',
        cause
      );


      const issue =
        cause instanceof Error
          ? cause.message
          : 'Analysis failed unexpectedly.';


      const cancelled =
        cause instanceof ApiError &&
        issue
          .toLowerCase()
          .includes('cancel');


      if (cancelled) {

        setError(
          'Analysis request cancelled.'
        );

      } else if (
        cause instanceof ApiError &&
        (cause.status === 400 ||
          cause.status === 422) &&
        inputType === 'smiles'
      ) {

        setError(
          `Molecular parsing error: ${issue}`
        );

      } else if (
        cause instanceof ApiError &&
        cause.status === 404 &&
        inputType === 'name' &&
        /compound|chemical|pubchem/i.test(
          issue
        )
      ) {

        setError(
          `Chemical lookup error: ${issue}`
        );

      } else if (
        cause instanceof ApiError &&
        cause.status === 404
      ) {

        setError(
          `FastAPI endpoint unavailable: ${issue}`
        );

      } else if (
        cause instanceof ApiError &&
        cause.code === 'network'
      ) {

        setError(
          `Backend unavailable: ${issue}`
        );

      } else {

        setError(issue);
      }


      setPipeline(
        PIPELINE_STEPS.map(
          (name, index) => ({

            name,

            status:
              index === 0
                ? 'completed'
                : 'pending',

          })
        )
      );


      setBackendPipelineNote(
        'The analysis request ended without backend per-stage status.'
      );


      notify(
        cancelled
          ? 'Analysis request cancelled'
          : 'Analysis could not be completed',
        cancelled
          ? 'info'
          : 'error',
        issue
      );


    } finally {

      requestController.current = null;
      setBusy(false);

    }
  };


  // ============================================================
  // CURRENT ANALYSIS
  // ============================================================

  const currentAnalysis =
    demoMode
      ? null
      : analysis;


  const evidenceScore =
    calculateXes(
      currentAnalysis?.evidence,
      getEvidenceWeights()
    );


  // ============================================================
  // CANDIDATE DISTRIBUTION
  // ============================================================

  const candidateDistribution =
    useMemo(() => {

      const groups =
        new Map<string, number>();


      candidates.forEach(
        (candidate) => {

          const label =
            candidate.reaction ??
            'Reaction not reported';


          groups.set(
            label,
            (groups.get(label) ?? 0) + 1
          );
        }
      );


      return [
        ...groups.entries(),
      ].map(
        ([name, count]) => ({
          name,
          count,
        })
      );

    }, [candidates]);


  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="page-stack">

      {demoMode && (
        <DemoNotice>
          Demo mode is active; leave it to submit real input to the configured backend.
        </DemoNotice>
      )}


      <PageHeading
        eyebrow="CHEMICAL WORKBENCH"
        title="Analyze a xenobiotic"
        description="Submit a name or structure to the configured FastAPI service. Chemical annotation confidence is shown separately from pathway confidence; no local predictor or fallback scientific results are used."
        action={
          <button
            className="button button-quiet"
            onClick={() =>
              navigate('/settings')
            }
          >
            <CircleHelp size={15} />
            API setup
          </button>
        }
      />


      <div className="analysis-layout">

        <div className="analysis-main-column">

          {/* ==================================================
              INPUT
          ================================================== */}

          <Panel
            className="input-panel"
            title="Chemical input"
            subtitle="Use a name for database lookup or a SMILES string for structure processing."
          >

            <div
              className="input-mode-tabs"
              role="tablist"
            >

              <button
                className={
                  inputType === 'name'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setInputType('name');
                  setError('');
                }}
                role="tab"
                aria-selected={
                  inputType === 'name'
                }
              >
                <Search size={15} />
                Chemical name
              </button>


              <button
                className={
                  inputType === 'smiles'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setInputType('smiles');
                  setError('');
                }}
                role="tab"
                aria-selected={
                  inputType === 'smiles'
                }
              >
                <Beaker size={15} />
                SMILES
              </button>

            </div>


            <label
              className="field-label"
              htmlFor="chemical-input"
            >
              {
                inputType === 'name'
                  ? 'Chemical name'
                  : 'SMILES string'
              }
            </label>


            <div className="chemical-input-row">

              <input
                id="chemical-input"
                value={value}
                onChange={(event) => {
                  setValue(
                    event.target.value
                  );
                  setError('');
                }}
                onKeyDown={(event) => {

                  if (
                    event.key === 'Enter' &&
                    !busy
                  ) {
                    void runAnalysis();
                  }

                }}
                placeholder={
                  inputType === 'name'
                    ? 'e.g. Aspirin'
                    : 'e.g. CC(=O)OC1=CC=CC=C1C(=O)O'
                }
                className={
                  inputType === 'smiles'
                    ? 'mono'
                    : ''
                }
                aria-describedby={
                  error
                    ? 'analysis-error'
                    : undefined
                }
              />


              <span className="input-scope">

                <span
                  className={`status-dot status-${
                    health.message ===
                    'Checking backend…'
                      ? 'checking'
                      : health.connected
                        ? 'available'
                        : health.checkedAt
                          ? 'unavailable'
                          : 'unknown'
                  }`}
                />

                {
                  health.connected
                    ? 'API reachable'
                    : health.message ===
                        'Checking backend…'
                      ? 'Checking API'
                      : health.checkedAt
                        ? 'API unavailable'
                        : 'API not verified'
                }

              </span>

            </div>


            {error && (
              <div
                id="analysis-error"
                className="inline-error"
              >
                <CircleAlert size={15} />
                {error}
              </div>
            )}


            <div className="input-actions">

              <button
                className="button button-primary"
                onClick={() =>
                  void runAnalysis()
                }
                disabled={busy}
              >

                {busy ? (
                  <>
                    <LoaderCircle
                      className="spin"
                      size={16}
                    />
                    Analyzing chemical…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Analyze chemical
                  </>
                )}

              </button>


              <button
                className="button button-secondary"
                onClick={clearForm}
                disabled={busy}
              >
                <RotateCcw size={15} />
                Clear
              </button>


              <button
                className="text-button"
                onClick={loadExample}
                disabled={busy}
              >
                Load example
              </button>

            </div>


            {!health.connected && (
              <div className="input-backend-note">
                The current API base is{' '}
                <code>/api</code> unless changed
                in Settings. Analysis requires a
                reachable FastAPI backend.
              </div>
            )}

          </Panel>


          {/* ==================================================
              PIPELINE
          ================================================== */}

          <Panel
            className="pipeline-panel"
            title="Analysis pipeline"
            subtitle="Per-stage status is populated only from actual backend progress or response data."
            action={
              <Badge
                tone={
                  busy
                    ? 'blue'
                    : error
                      ? 'red'
                      : currentAnalysis
                        ? 'green'
                        : 'neutral'
                }
              >
                {
                  busy
                    ? 'Processing request'
                    : error
                      ? 'Request ended'
                      : currentAnalysis
                        ? 'Response received'
                        : 'Waiting for input'
                }
              </Badge>
            }
          >

            <div className="pipeline-list">

              {pipeline.map(
                (step, index) => (

                  <div
                    className={`pipeline-item pipeline-${step.status}`}
                    key={step.name}
                  >

                    <div className="pipeline-step-number">

                      {step.status ===
                      'completed' ? (
                        <Check size={14} />
                      ) : step.status ===
                        'failed' ? (
                        <X size={14} />
                      ) : step.status ===
                        'processing' ? (
                        <LoaderCircle
                          size={14}
                          className="spin"
                        />
                      ) : (
                        String(index + 1)
                          .padStart(2, '0')
                      )}

                    </div>


                    <div className="pipeline-copy">

                      <strong>
                        {step.name}
                      </strong>

                      {step.message && (
                        <small>
                          {step.message}
                        </small>
                      )}

                    </div>


                    <span className="pipeline-status-label">
                      {step.status}
                    </span>

                  </div>
                )
              )}

            </div>


            <div className="pipeline-footnote">

              <Clock3 size={14} />

              {backendPipelineNote}

            </div>

          </Panel>


          {/* ==================================================
              PREDICTIONS
          ================================================== */}

          <div className="candidate-output-grid">

            <Panel
              className="candidate-table-panel"
              title="Predicted transformations"
              subtitle={
                currentAnalysis
                  ? `${candidates.length} candidate records returned by the backend.`
                  : 'Candidate table awaits a successful backend response.'
              }
              action={
                <span
                  className="icon-button info-indicator"
                  aria-label="Candidate interpretation"
                  title="Candidates are hypotheses, not confirmed metabolites."
                >
                  <CircleHelp size={15} />
                </span>
              }
            >

              {candidates.length ? (

                <div className="table-wrap">

                  <table>

                    <thead>

                      <tr>
                        <th>Candidate</th>
                        <th>Reaction</th>
                        <th>Step</th>
                        <th>Predicted probability</th>
                        <th>Enzyme class</th>
                        <th>Exact mass</th>
                        <th>Evidence status</th>
                      </tr>

                    </thead>


                    <tbody>

                      {candidates.map(
                        (candidate, index) => (

                          <tr
                            key={
                              candidate.id ??
                              `${candidate.candidate ?? 'candidate'}-${index}`
                            }
                            className="click-row"
                            onClick={() =>
                              setSelectedCandidate(
                                candidate
                              )
                            }
                          >

                            <td>

                              <button
                                className="candidate-table-link"
                                onClick={(event) => {

                                  event.stopPropagation();

                                  setSelectedCandidate(
                                    candidate
                                  );

                                }}
                              >
                                {
                                  candidate.candidate ??
                                  'Candidate unavailable'
                                }
                              </button>

                            </td>


                            <td>
                              {
                                candidate.reaction ??
                                'Unavailable'
                              }
                            </td>


                            <td>
                              {
                                candidate.step ??
                                '—'
                              }
                            </td>


                            <td>
                              {
                                formatProbability(
                                  candidate.predicted_probability
                                ) ??
                                'Unavailable'
                              }
                            </td>


                            <td>
                              {
                                candidate.enzyme_class ??
                                'Unavailable'
                              }
                            </td>


                            <td>
                              {
                                candidate.exact_mass ??
                                'Unavailable'
                              }
                            </td>


                            <td>

                              <Badge
                                tone={candidateEvidenceTone(
                                  candidate.evidence_status
                                )}
                              >
                                {
                                  candidate.evidence_status ??
                                  'Unavailable'
                                }
                              </Badge>

                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>

                </div>

              ) : (

                <EmptyState
                  title="No transformation candidates returned"
                  detail="Candidates appear only when supplied by the FastAPI backend. No local reaction-prediction fallback is used."
                />

              )}

            </Panel>


            {/* ==================================================
                DISTRIBUTION
            ================================================== */}

            <Panel
              className="candidate-distribution-panel"
              title="Candidate distribution"
              subtitle="Count by backend-reported reaction type."
            >

              {candidateDistribution.length ? (

                <>

                  <ResponsiveContainer
                    width="100%"
                    height={205}
                  >

                    <PieChart>

                      <Pie
                        data={candidateDistribution}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                      >

                        {candidateDistribution.map(
                          (entry, index) => (

                            <Cell
                              key={entry.name}
                              fill={
                                [
                                  '#54d8c8',
                                  '#75b9f2',
                                  '#e6b963',
                                  '#a88ce2',
                                  '#59d89b',
                                ][index % 5]
                              }
                            />

                          )
                        )}

                      </Pie>


                      <Tooltip
                        contentStyle={{
                          background:
                            '#0c1925',
                          border:
                            '1px solid rgba(133,171,191,.2)',
                          color:
                            '#eaf3f7',
                          borderRadius: 8,
                        }}
                      />

                    </PieChart>

                  </ResponsiveContainer>


                  <div className="distribution-legend">

                    {candidateDistribution.map(
                      (entry, index) => (

                        <span
                          key={entry.name}
                        >

                          <i
                            style={{
                              background:
                                [
                                  '#54d8c8',
                                  '#75b9f2',
                                  '#e6b963',
                                  '#a88ce2',
                                  '#59d89b',
                                ][index % 5],
                            }}
                          />

                          {entry.name}

                          <b>
                            {entry.count}
                          </b>

                        </span>

                      )
                    )}

                  </div>

                </>

              ) : (

                <EmptyState
                  title="No candidate distribution"
                  detail="A reaction-distribution chart appears only when candidate reactions are returned."
                />

              )}

            </Panel>

          </div>


          {/* ==================================================
              CANDIDATE PRODUCTS
          ================================================== */}

          <Panel
            className="candidate-products-panel"
            title="Generated candidate products"
            subtitle={
              currentAnalysis
                ? `${candidateProducts.length} hypothetical product records returned by the backend.`
                : 'Candidate products appear after a successful backend analysis.'
            }
            action={
              <span
                className="icon-button info-indicator"
                aria-label="Candidate product interpretation"
                title="These are computational hypotheses, not experimentally confirmed metabolites."
              >
                <CircleHelp size={15} />
              </span>
            }
          >
            {candidateProducts.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Product SMILES / fragments</th>
                      <th>Cleaved bond</th>
                      <th>Probability</th>
                      <th>Fragments</th>
                      <th>RDKit validation</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateProducts.map((product, index) => (
                      <tr key={product.id ?? `product-${index}`}>
                        <td>{product.id ?? `Product ${index + 1}`}</td>
                        <td className="mono">
                          {Array.isArray(product.product_smiles) && product.product_smiles.length ? (
                            <div className="product-smiles-list">
                              {product.product_smiles.map((smiles, smilesIndex) => (
                                <code key={`${product.id ?? index}-smiles-${smilesIndex}`}>
                                  {smiles}
                                </code>
                              ))}
                            </div>
                          ) : (
                            'SMILES unavailable'
                          )}
                        </td>
                        <td>
                          {typeof product.atom1_index === 'number' && typeof product.atom2_index === 'number'
                            ? `${product.atom1_element ?? 'Atom'} ${product.atom1_index} – ${product.atom2_element ?? 'Atom'} ${product.atom2_index}`
                            : typeof (product.cleaved_bond_index ?? product.bond_index) === 'number'
                              ? `Bond ${product.cleaved_bond_index ?? product.bond_index}`
                              : 'Unavailable'}
                        </td>
                        <td>{formatProbability(product.predicted_probability ?? product.transformation_probability ?? product.probability) ?? 'Unavailable'}</td>
                        <td>{typeof product.fragment_count === 'number' ? product.fragment_count : 'Unavailable'}</td>
                        <td>
                          {product.validation?.rdkit_valid === true && product.validation?.sanitized === true
                            ? 'Valid / sanitized'
                            : product.validation?.rdkit_valid === false || product.validation?.sanitized === false
                              ? 'Validation failed'
                              : 'Unavailable'}
                        </td>
                        <td>
                          <Badge tone="neutral">
                            {product.evidence_status ?? 'COMPUTATIONAL_CANDIDATE'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No candidate products returned"
                detail="The backend must include candidate_products in its analysis response. This panel does not fabricate product structures."
              />
            )}
            <p className="inspector-caveat">
              Bond-cleavage products are computational hypotheses only. RDKit sanitization checks structural consistency; it does not confirm that a product forms biologically or experimentally.
            </p>
          </Panel>


          {/* ==================================================
              MOLECULAR PROFILE
          ================================================== */}

          <Panel
            className="profile-panel"
            title="Molecular profile"
            subtitle={
              currentAnalysis
                ? 'Fields shown only when returned by the analysis service.'
                : 'Structure descriptors are unavailable until a backend analysis returns them.'
            }
            action={
              <button
                className="text-button"
                onClick={() =>
                  setShowProfile(
                    (value) => !value
                  )
                }
              >
                {
                  showProfile
                    ? 'Hide profile'
                    : 'View profile'
                }

                <ChevronDown size={14} />

              </button>
            }
          >

            {currentAnalysis ? (

              <>

                <div className="profile-summary">

                  <div className="profile-compound-mark">
                    <FlaskConical size={22} />
                  </div>


                  <div>

                    <strong>
                      {
                        currentAnalysis.compound
                          .name ??
                        'Compound name unavailable'
                      }
                    </strong>


                    <span>

                      {
                        currentAnalysis.compound
                          .formula ??
                        'Formula unavailable'
                      }

                      <i> · </i>

                      {
                        currentAnalysis.compound
                          .canonical_smiles
                          ? 'Structure provided'
                          : 'SMILES unavailable'
                      }

                    </span>

                  </div>


                  <div className="profile-confidence-label">

                    <span>
                      Chemical annotation confidence
                    </span>

                    <ConfidenceBadge
                      value={
                        currentAnalysis
                          .annotation_confidence
                      }
                    />

                  </div>

                </div>


                <div className="descriptor-grid">

                  {[
                    [
                      'Molecular weight',
                      currentAnalysis.compound
                        .molecular_weight,
                    ],
                    [
                      'InChIKey',
                      currentAnalysis.compound
                        .inchikey,
                    ],
                    [
                      'Atoms',
                      currentAnalysis.compound
                        .atom_count,
                    ],
                    [
                      'Bonds',
                      currentAnalysis.compound
                        .bond_count,
                    ],
                    [
                      'Rotatable bonds',
                      currentAnalysis.compound
                        .rotatable_bonds,
                    ],
                    [
                      'H-bond donors',
                      currentAnalysis.compound
                        .h_bond_donors,
                    ],
                    [
                      'H-bond acceptors',
                      currentAnalysis.compound
                        .h_bond_acceptors,
                    ],
                    [
                      'LogP',
                      currentAnalysis.compound
                        .logp,
                    ],
                  ].map(
                    ([label, item]) => (

                      <div
                        className="descriptor-cell"
                        key={String(label)}
                      >

                        <span>
                          {label}
                        </span>

                        <strong>
                          {
                            item === undefined ||
                            item === null
                              ? 'Unavailable'
                              : String(item)
                          }
                        </strong>

                      </div>

                    )
                  )}

                </div>


                <div className="structure-preview">

                  <div>

                    <span className="eyebrow">
                      2D STRUCTURE
                    </span>

                    <p>
                      {
                        currentAnalysis.compound
                          .canonical_smiles
                          ? 'A genuine structure render is shown only when supplied by the backend.'
                          : 'Canonical SMILES unavailable; no structure is drawn.'
                      }
                    </p>

                  </div>


                  {currentAnalysis.compound
                    .structure_svg ? (

                    <img
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                        currentAnalysis.compound
                          .structure_svg
                      )}`}
                      alt="Backend-provided molecular structure"
                    />

                  ) : (

                    <div className="structure-unavailable">

                      <FlaskConical
                        size={24}
                      />

                      <span>
                        Structure rendering unavailable
                      </span>

                    </div>

                  )}

                </div>

              </>

            ) : (

              <EmptyState
                icon="flask"
                title="No molecular profile available"
                detail="Submit an analysis and show only verified descriptors returned by the FastAPI service."
              />

            )}


            {showProfile &&
              currentAnalysis && (

                <details
                  className="profile-details"
                  open
                >

                  <summary>
                    Additional analysis metadata
                  </summary>

                  <pre>
                    {JSON.stringify(
                      {
                        id:
                          currentAnalysis.id,

                        created_at:
                          currentAnalysis.created_at,

                        status:
                          currentAnalysis.status,

                        provenance:
                          currentAnalysis.provenance,

                        ml_verified:
                          (currentAnalysis as any)
                            .ml_verified,

                        prediction_source:
                          (currentAnalysis as any)
                            .prediction_source,

                        model:
                          (currentAnalysis as any)
                            .model,

                      },
                      null,
                      2
                    )}
                  </pre>

                </details>

              )}

          </Panel>

        </div>


        {/* ======================================================
            RIGHT COLUMN
        ====================================================== */}

        <aside className="analysis-side-column">

          <Panel
            className="analysis-score-panel"
            title="XenoEvolve Evidence Score"
            subtitle="Five weighted evidence components; unavailable inputs are not imputed."
          >

            {currentAnalysis?.evidence &&
            evidenceScore !== null ? (

              <div className="score-display">

                <div
                  className="score-ring"
                  style={
                    {
                      '--score-pct':
                        `${Math.round(
                          evidenceScore * 100
                        )}%`,
                    } as CSSProperties
                  }
                >

                  <span>
                    {evidenceScore.toFixed(2)}
                  </span>

                </div>

                <p>
                  Evidence fusion score
                </p>

                <small>
                  See Evidence Engine for
                  weights and component coverage.
                </small>

              </div>

            ) : (

              <div className="score-display score-empty">

                <div className="score-ring">

                  <span>
                    —
                  </span>

                </div>

                <p>
                  Awaiting evidence
                </p>

                <small>
                  No overall score is calculated
                  from missing components.
                </small>

              </div>

            )}


            <div className="evidence-mini-list">

              {[
                [
                  'Chemical plausibility',
                  currentAnalysis?.evidence?.chemical,
                ],

                [
                  'Functional omics',
                  currentAnalysis?.evidence?.omics,
                ],

                [
                  'LC-HRMS/MS',
                  currentAnalysis?.evidence?.msms,
                ],

                [
                  'Temporal evidence',
                  currentAnalysis?.evidence?.temporal,
                ],

                [
                  'Literature knowledge',
                  currentAnalysis?.evidence?.literature,
                ],
              ].map(
                ([label, item]) => (

                  <div
                    className="mini-evidence"
                    key={String(label)}
                  >

                    <span>
                      {label}
                    </span>

                    <b>
                      {
                        typeof item ===
                        'number'
                          ? item.toFixed(2)
                          : '—'
                      }
                    </b>

                  </div>

                )
              )}

            </div>


            <button
              className="text-button full-link"
              onClick={() =>
                navigate('/evidence')
              }
            >
              Open Evidence Engine
              <ArrowRight size={14} />
            </button>

          </Panel>


          {/* ==================================================
              PATHWAYS
          ================================================== */}

          <Panel
            className="candidate-panel"
            title="Pathway workflow"
            subtitle="Explore any pathways returned by the analysis."
          >

            <button
              className="text-button full-link"
              onClick={() =>
                navigate('/pathways')
              }
            >
              Browse pathways
              <ArrowRight size={14} />
            </button>


            <button
              className="text-button full-link"
              onClick={() =>
                navigate('/graph')
              }
            >
              Open transformation graph
              <ArrowRight size={14} />
            </button>

          </Panel>


          <StatusNote kind="warning">
            Predicted and putative results are
            hypotheses unless experimentally confirmed.
          </StatusNote>

        </aside>

      </div>


      {/* ========================================================
          CANDIDATE MODAL
      ======================================================== */}

      {selectedCandidate && (

        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() =>
            setSelectedCandidate(null)
          }
        >

          <section
            className="candidate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="icon-button modal-close"
              onClick={() =>
                setSelectedCandidate(null)
              }
              aria-label="Close candidate details"
            >
              <X size={17} />
            </button>


            <span className="eyebrow">
              TRANSFORMATION CANDIDATE
            </span>


            <h2 id="candidate-title">
              {
                selectedCandidate.candidate ??
                'Candidate'
              }
            </h2>


            <div className="modal-meta">

              <Badge tone="blue">
                {
                  selectedCandidate.reaction ??
                  'Reaction unavailable'
                }
              </Badge>

              <span>
                Step{' '}
                {
                  selectedCandidate.step ??
                  '—'
                }
              </span>

            </div>


            <div className="inspector-list">

              <Detail
                label="Predicted probability"
                value={formatProbability(
                  selectedCandidate
                    .predicted_probability
                )}
              />

              <Detail
                label="Enzyme class"
                value={
                  selectedCandidate
                    .enzyme_class
                }
              />

              <Detail
                label="Exact mass"
                value={
                  selectedCandidate.exact_mass
                    ?.toString()
                }
              />

              <Detail
                label="Evidence status"
                value={
                  selectedCandidate
                    .evidence_status
                }
              />


              <div className="inspector-item">

                <span>
                  Confidence
                </span>

                <ConfidenceBadge
                  value={
                    selectedCandidate
                      .confidence
                  }
                />

              </div>

            </div>


            <p className="inspector-caveat">
              Interpret as a candidate for
              validation. Exact enzyme assignment
              and standard confirmation require
              appropriate experiments.
            </p>

          </section>

        </div>

      )}

    </div>
  );
}


// ============================================================
// HELPERS
// ============================================================

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {

  return (
    <div className="inspector-item">

      <span>
        {label}
      </span>

      <strong>
        {value ?? 'Unavailable'}
      </strong>

    </div>
  );
}


function formatProbability(
  value?: number
): string | undefined {

  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value.toFixed(2)
    : undefined;
}


function candidateEvidenceTone(
  value?: string
): 'green' | 'neutral' {

  const status =
    value
      ?.trim()
      .toUpperCase();

  return status === 'CONFIRMED' ||
    status ===
      'EXPERIMENTALLY CONFIRMED'
    ? 'green'
    : 'neutral';
}
