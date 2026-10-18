import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Filter, GitBranch, SlidersHorizontal } from 'lucide-react';
import { useWorkspace } from '../state/Workspace';
import { demoPathways } from '../demo';
import { Badge, ConfidenceBadge, DemoNotice, EmptyState, PageHeading, Panel } from '../components/ui';
import type { PathwayRecord } from '../models';

type SortKey = 'score' | 'analytical_support' | 'omics_support' | 'steps' | 'evidence_count';

export function PathwaysPage() {
  const { analysis, demoMode } = useWorkspace();
  const navigate = useNavigate();
  const source = demoMode ? demoPathways : analysis?.pathways ?? [];
  const [minScore, setMinScore] = useState('');
  const [confidence, setConfidence] = useState('all');
  const [reaction, setReaction] = useState('all');
  const [enzyme, setEnzyme] = useState('');
  const [evidenceType, setEvidenceType] = useState('all');
  const [steps, setSteps] = useState('all');
  const [sort, setSort] = useState<SortKey>('score');
  const reactions = [...new Set(source.flatMap((path) => path.reactions ?? []))];
  const filtered = useMemo(() => source.filter((path) => {
    if (minScore && (path.score ?? -1) < Number(minScore)) return false;
    if (confidence !== 'all' && path.confidence !== confidence) return false;
    if (reaction !== 'all' && !path.reactions?.includes(reaction)) return false;
    if (enzyme && !path.enzyme_classes?.some((item) => item.toLowerCase().includes(enzyme.toLowerCase()))) return false;
    if (evidenceType !== 'all' && !path.evidence_types?.includes(evidenceType)) return false;
    if (steps !== 'all' && path.steps !== Number(steps)) return false;
    return true;
  }).sort((a, b) => sort === 'steps' ? (a.steps ?? Number.POSITIVE_INFINITY) - (b.steps ?? Number.POSITIVE_INFINITY) : (b[sort] ?? -1) - (a[sort] ?? -1)), [source, minScore, confidence, reaction, enzyme, evidenceType, steps, sort]);

  return <div className="page-stack">
    {demoMode && <DemoNotice>Pathway labels and scores use sample values from the brief, not biological results.</DemoNotice>}
    <PageHeading eyebrow="RANKED CANDIDATES" title="Pathway explorer" description="Filter and compare generated pathway hypotheses by score, confidence, reaction and evidence support." action={<Badge tone="neutral">{filtered.length} shown</Badge>}/>
    <Panel className="filter-panel" title="Filters and ranking" subtitle="Sort order changes presentation only; it does not make the top pathway true." action={<SlidersHorizontal size={16}/> }>
      <div className="filter-grid">
        <label className="field-label">Minimum score<input type="number" min="0" max="1" step="0.05" value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="Any score"/></label>
        <label className="field-label">Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value)}><option value="all">All confidence</option><option>CONFIRMED</option><option>PUTATIVE</option><option>TENTATIVE</option><option>LOW CONFIDENCE</option></select></label>
        <label className="field-label">Reaction<select value={reaction} onChange={(event) => setReaction(event.target.value)}><option value="all">All reactions</option>{reactions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">Enzyme class<input value={enzyme} onChange={(event) => setEnzyme(event.target.value)} placeholder="Search returned enzyme class"/></label>
        <label className="field-label">Evidence type<select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}><option value="all">All evidence types</option>{['Chemical', 'Omics', 'LC-MS/MS', 'Temporal', 'Literature'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">Number of steps<select value={steps} onChange={(event) => setSteps(event.target.value)}><option value="all">Any length</option><option value="1">1 step</option><option value="2">2 steps</option><option value="3">3 steps</option></select></label>
        <label className="field-label sort-field">Sort by<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="score">Highest score</option><option value="analytical_support">Highest analytical support</option><option value="omics_support">Highest omics support</option><option value="steps">Shortest pathway</option><option value="evidence_count">Most evidence</option></select></label>
      </div>
    </Panel>
    <div className="pathway-explorer-head"><span><Filter size={14}/> {filtered.length} pathway hypotheses</span><span>Scores and confidence reflect returned evidence only.</span></div>
    {filtered.length ? <div className="pathway-explorer-list">{filtered.map((path, index) => <PathwayExplorerCard key={path.id} item={path} rank={index + 1} demo={demoMode} onView={() => navigate('/graph')}/>)}</div> : <Panel><EmptyState title={source.length ? 'No pathways match these filters' : 'No pathways available'} detail={source.length ? 'Adjust filters or clear the selected criteria.' : 'Run an analysis through the configured FastAPI service or open demo mode to inspect illustrative ranking UI.'}/></Panel>}
  </div>;
}

function PathwayExplorerCard({ item, rank, demo, onView }: { item: PathwayRecord; rank: number; demo: boolean; onView: () => void }) {
  return <article className="pathway-explorer-card"><div className="pathway-explorer-rank">{String(rank).padStart(2, '0')}</div><div className="pathway-explorer-main"><div className="pathway-explorer-title"><div><h3>{item.name ?? `Candidate pathway ${rank}`}</h3><span>{item.compounds?.join('  →  ') ?? 'Pathway composition unavailable'}</span></div><div className="pathway-explorer-score"><strong>{typeof item.score === 'number' ? item.score.toFixed(2) : '—'}</strong><small>pathway score</small></div></div><div className="pathway-progress"><i style={{ width: `${Math.max(0, Math.min(100, (item.score ?? 0) * 100))}%` }}/></div><div className="pathway-explorer-meta"><ConfidenceBadge value={item.confidence}/><Badge>{item.steps ?? '—'} steps</Badge><span><GitBranch size={13}/>{item.evidence_count ?? '—'} evidence types</span>{(item.reactions ?? []).map((reaction) => <Badge tone="blue" key={reaction}>{reaction}</Badge>)}{demo && <Badge tone="amber">DEMO DATA</Badge>}</div></div><button className="button button-secondary view-pathway" onClick={onView}>View pathway <ArrowRight size={14}/></button></article>;
}
