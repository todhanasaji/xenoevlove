export type Confidence = 'CONFIRMED' | 'PUTATIVE' | 'TENTATIVE' | 'LOW CONFIDENCE' | 'UNKNOWN';
export type ServiceState = 'checking' | 'available' | 'unavailable' | 'unknown';
export type PipelineStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CompoundProfile {
  name?: string;
  formula?: string;
  molecular_weight?: number | string;
  canonical_smiles?: string;
  inchikey?: string;
  atom_count?: number;
  bond_count?: number;
  rotatable_bonds?: number;
  h_bond_donors?: number;
  h_bond_acceptors?: number;
  logp?: number;
  structure_svg?: string;
}

export interface TransformationCandidate {
  id: string;
  candidate?: string;
  reaction?: string;
  step?: number;
  predicted_probability?: number;
  enzyme_class?: string;
  exact_mass?: number;
  evidence_status?: string;
  confidence?: Confidence;
  evidence?: Record<string, unknown>;
}

export interface EvidenceScores {
  chemical?: number;
  omics?: number;
  msms?: number;
  temporal?: number;
  literature?: number;
  xes?: number;
}

export interface GraphNode {
  id: string;
  compound_name?: string;
  formula?: string;
  mz?: number;
  confidence?: Confidence;
  score?: number;
  level?: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  reaction_type?: string;
  enzyme_class?: string;
  edge_score?: number;
  predicted_probability?: number;
  bond_index?: number;
  bond_type?: string;
  aromatic?: boolean;
  in_ring?: boolean;
  conjugated?: boolean;
  source_element?: string;
  target_element?: string;
  transformation?: string;
  supporting_evidence?: string[];
}

export interface PathwayRecord {
  id: string;
  name?: string;
  compounds?: string[];
  score?: number;
  confidence?: Confidence;
  evidence_count?: number;
  analytical_support?: number;
  omics_support?: number;
  steps?: number;
  reactions?: string[];
  enzyme_classes?: string[];
  evidence_types?: string[];
  rationale?: string[];
  missing_evidence?: string[];
}
export interface CandidateProduct {
  id: string;
  candidate_type?: string;
  source_smiles?: string;
  product_smiles?: string[];
  fragment_count?: number;
  cleaved_bond_index?: number;
  atom1_index?: number;
  atom2_index?: number;
  atom1_element?: string;
  atom2_element?: string;
  bond_type?: string;
  predicted_probability?: number;
  validation?: {
    rdkit_valid?: boolean;
    sanitized?: boolean;
  };
  confidence?: string;
  evidence_status?: string;
  experimental_validation_required?: boolean;
}
export interface AnalysisResult {
  id: string;
  created_at?: string;
  status?: string;
  compound: CompoundProfile;
  transformations?: TransformationCandidate[];
  candidate_products?: CandidateProduct[];
  graph?: { nodes?: GraphNode[]; edges?: GraphEdge[] };
  evidence?: EvidenceScores;
  pathways?: PathwayRecord[];
  annotation_confidence?: Confidence;
  pathway_confidence?: Confidence;
  provenance?: string[];
  limitations?: string[];
  raw?: unknown;
}

export interface PipelineStep {
  name: string;
  status: PipelineStatus;
  message?: string;
}

export interface ApiHealth {
  connected: boolean;
  checkedAt?: string;
  rdkit?: boolean | null;
  services?: Record<string, boolean | string | null>;
  message?: string;
}

export const EVIDENCE_WEIGHTS = {
  chemical: 0.2,
  omics: 0.25,
  msms: 0.3,
  temporal: 0.15,
  literature: 0.1,
} as const;

export function getEvidenceWeights(): Record<keyof typeof EVIDENCE_WEIGHTS, number> {
  if (!import.meta.env.DEV || typeof window === 'undefined') return { ...EVIDENCE_WEIGHTS };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem('xenoevolve.devWeights') ?? 'null');
    if (!parsed || typeof parsed !== 'object') return { ...EVIDENCE_WEIGHTS };
    const candidate = { ...EVIDENCE_WEIGHTS, ...parsed as Record<string, number> };
    const keys = Object.keys(EVIDENCE_WEIGHTS) as Array<keyof typeof EVIDENCE_WEIGHTS>;
    if (keys.some((key) => typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key]) || candidate[key] < 0 || candidate[key] > 1)) return { ...EVIDENCE_WEIGHTS };
    if (Math.abs(keys.reduce((sum, key) => sum + candidate[key], 0) - 1) > 0.011) return { ...EVIDENCE_WEIGHTS };
    return candidate;
  } catch { return { ...EVIDENCE_WEIGHTS }; }
}

export function calculateXes(scores?: EvidenceScores, weights: Record<keyof typeof EVIDENCE_WEIGHTS, number> = EVIDENCE_WEIGHTS): number | null {
  if (!scores) return null;
  const keys = ['chemical', 'omics', 'msms', 'temporal', 'literature'] as const;
  if (keys.some((key) => typeof scores[key] !== 'number' || !Number.isFinite(scores[key]) || scores[key]! < 0 || scores[key]! > 1)) return null;
  const result = keys.reduce((total, key) => total + scores[key]! * weights[key], 0);
  return Number.isFinite(result) && result >= 0 && result <= 1 ? result : null;
}

export const PIPELINE_STEPS = [
  'Input received', 'PubChem lookup', 'Structure normalization', 'RDKit molecular analysis',
  'Transformation prediction', 'Candidate graph construction', 'Biological evidence retrieval',
  'Analytical evidence processing', 'Temporal evidence processing', 'Evidence fusion',
  'Pathway ranking', 'Report generation',
] as const;

