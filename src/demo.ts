import type { AnalysisResult, EvidenceScores, PathwayRecord } from './models';

export const demoEvidence: EvidenceScores = {
  chemical: 0.82,
  omics: 0.74,
  msms: 0.91,
  temporal: 0.79,
  literature: 0.6,
};

export const demoPathways: PathwayRecord[] = [
  { id: 'demo-a', name: 'Pathway A', compounds: ['Parent', 'Intermediate', 'Product'], score: 0.86, confidence: 'UNKNOWN', rationale: ['Illustrative prioritization rationale; no experimental evidence.'], missing_evidence: ['No authentic standard confirmation', 'Exact enzyme not experimentally assigned'] },
  { id: 'demo-b', name: 'Pathway B', compounds: ['Parent', 'Intermediate', 'Product'], score: 0.74, confidence: 'UNKNOWN' },
  { id: 'demo-c', name: 'Pathway C', compounds: ['Parent', 'Intermediate', 'Product'], score: 0.61, confidence: 'UNKNOWN' },
];

export const demoAnalysis: AnalysisResult = {
  id: 'illustrative-aspirin-demo',
  created_at: 'DEMO DATA',
  status: 'illustrative',
  compound: { name: 'Aspirin', formula: 'C9H8O4', canonical_smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
  graph: {
    nodes: [
      { id: 'demo-parent', compound_name: 'Parent', level: 0, confidence: 'UNKNOWN' },
      { id: 'demo-intermediate', compound_name: 'Intermediate A', level: 1, confidence: 'UNKNOWN' },
      { id: 'demo-product', compound_name: 'Product A', level: 2, confidence: 'UNKNOWN' },
      { id: 'demo-branch', compound_name: 'Intermediate B', level: 1, confidence: 'UNKNOWN' },
    ],
    edges: [
      { id: 'demo-edge-1', source: 'demo-parent', target: 'demo-intermediate', reaction_type: 'Illustrative transformation' },
      { id: 'demo-edge-2', source: 'demo-intermediate', target: 'demo-product', reaction_type: 'Illustrative transformation' },
      { id: 'demo-edge-3', source: 'demo-parent', target: 'demo-branch', reaction_type: 'Illustrative transformation' },
    ],
  },
  evidence: demoEvidence,
  pathways: demoPathways,
  annotation_confidence: 'UNKNOWN',
  pathway_confidence: 'UNKNOWN',
  provenance: ['User-brief example values only; demonstration mode, not analysis output.'],
  limitations: ['No experimental, omics, MS/MS, temporal, KEGG, NCBI or benchmark data are represented.'],
};
