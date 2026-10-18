import { useMemo, type CSSProperties } from 'react';
import { ArrowRight, CircleHelp, LockKeyhole, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calculateXes, getEvidenceWeights } from '../models';
import { demoEvidence, demoPathways } from '../demo';
import { useWorkspace } from '../state/Workspace';
import { Badge, ConfidenceBadge, DemoNotice, EmptyState, EvidenceBar, PageHeading, Panel, StatusNote } from '../components/ui';

const componentInfo = [
  { key: 'chemical' as const, label: 'Chemical plausibility', letter: 'C', text: 'Structure and reaction plausibility based on returned chemical analysis. Does not establish a biological transformation.' },
  { key: 'omics' as const, label: 'Functional omics', letter: 'F', text: 'Gene/enzyme-family capacity evidence. Gene presence or abundance does not prove enzyme expression or activity.' },
  { key: 'msms' as const, label: 'LC-HRMS/MS', letter: 'A', text: 'Structural support from observed fragmentation. Exact mass alone is insufficient for structural confirmation.' },
  { key: 'temporal' as const, label: 'Temporal evidence', letter: 'T', text: 'Parent depletion, product appearance and time-course support. Temporal correlation does not establish biochemical causation.' },
  { key: 'literature' as const, label: 'Literature knowledge', letter: 'L', text: 'Database or literature context returned by the configured service; not experimental confirmation.' },
];

export function EvidencePage() {
  const { analysis, demoMode } = useWorkspace();
  const navigate = useNavigate();
  const scores = demoMode ? demoEvidence : analysis?.evidence;
  const weights = useMemo(() => getEvidenceWeights(), []);
  const score = useMemo(() => calculateXes(scores, weights), [scores, weights]);
  const pathways = demoMode ? demoPathways : analysis?.pathways ?? [];
  const ranked = pathways.slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const development = import.meta.env.DEV;
  return <div className="page-stack">
    {demoMode && <DemoNotice>Example component values supplied in the brief; the displayed calculation is illustrative only.</DemoNotice>}
    <PageHeading eyebrow="EVIDENCE FUSION" title="XenoEvolve Evidence Engine" description="Inspect how chemical, omics, analytical, temporal and literature support contribute to a prioritized pathway hypothesis." action={<button className="button button-secondary" onClick={() => navigate('/settings')}><LockKeyhole size={15}/> Weight settings</button>}/>
    <div className="evidence-engine-grid">
      <Panel className="xes-panel" title="XenoEvolve Evidence Score" subtitle="An evidence-fusion prioritization score; not an experimental validation measure." action={<Badge tone={development ? 'amber' : 'teal'}><LockKeyhole size={12}/> {development ? 'Development weights' : 'Frozen evaluation weights'}</Badge>}>
        {scores ? <div className="xes-layout"><div className="xes-ring-wrap"><div className="score-ring score-ring-large" title="Weighted evidence-fusion score; not a probability of truth." style={{ '--score-pct': `${Math.round((score ?? 0) * 100)}%` } as CSSProperties}><span>{score === null ? '—' : score.toFixed(2)}</span></div><strong>Evidence-fusion score</strong><small>Not a probability of truth.</small></div><div className="xes-breakdown">{componentInfo.map((item) => <EvidenceBar key={item.key} label={`${item.letter} · ${item.label}`} value={scores[item.key]} explanation={item.text} demo={demoMode}/>)}</div></div> : <EmptyState title="Evidence fusion unavailable" detail="A score is shown only when the analysis service returns the necessary components. Missing dimensions are not imputed."/>}
        <div className="formula-box" title="Predefined XES edge weights are a prioritization methodology; they are not asserted as experimentally validated."><div><span className="eyebrow">PREDEFINED EDGE FORMULA</span><p><code>XES_edge = {(weights.chemical).toFixed(2)}C + {(weights.omics).toFixed(2)}F + {(weights.msms).toFixed(2)}A + {(weights.temporal).toFixed(2)}T + {(weights.literature).toFixed(2)}L</code></p></div><CircleHelp size={17}/></div>
      </Panel>
      <Panel className="weights-panel" title="Evaluation weights" subtitle="Production analysis uses locked weights."><div className="weight-list">{componentInfo.map((item) => <div key={item.key} className="weight-row"><span><i>{item.letter}</i>{item.label}</span><strong>{(weights[item.key] * 100).toFixed(0)}%</strong><div className="weight-track"><i style={{ width: `${weights[item.key] * 100}%` }}/></div></div>)}</div><p className="muted-note"><LockKeyhole size={14}/> Weights are configurable only in a development/settings environment.</p></Panel>
    </div>
    <div className="evidence-lower-grid">
      <Panel title="Pathway ranking" subtitle="Average edge evidence minus a pathway-length penalty." action={<button className="text-button" onClick={() => navigate('/pathways')}>Pathway explorer <ArrowRight size={14}/></button>}>
        {ranked.length ? <div className="ranked-pathway-list">{ranked.map((path, index) => <div key={path.id} className={`ranked-pathway ${index === 0 ? 'ranked-top' : ''}`}><div className="rank-number">{String(index + 1).padStart(2, '0')}</div><div className="rank-main"><div className="rank-title"><strong>{path.name ?? `Candidate pathway ${index + 1}`}</strong>{index === 0 && <Badge tone="teal">Highest-ranked pathway</Badge>}<span className="confidence-caption">Pathway confidence</span><ConfidenceBadge value={path.confidence}/></div><div className="rank-chain">{path.compounds?.join(' → ') ?? 'Path composition unavailable'}</div><div className="rank-rationale">{path.rationale?.[0] ?? (demoMode ? 'Illustrative ranking example; no evidence was measured.' : 'No ranking rationale was returned.')}</div></div><div className="rank-score" title="Pathway score uses backend-returned pathway evidence and ranking; scores are not truth classifications.">{typeof path.score === 'number' ? path.score.toFixed(2) : '—'}<small>pathway score</small></div></div>)}</div> : <EmptyState title="No ranked pathways" detail="Ranked pathways appear when the analysis service returns pathway evidence and scores."/>}
      </Panel>
      <Panel title="Why was this candidate prioritized?" subtitle="Evidence-specific reasons and missing evidence stay visible." className="explain-panel">
        {ranked[0] ? <><div className="explain-title"><Sparkles size={17}/><strong>{ranked[0].name ?? 'Top-ranked pathway'}</strong><ConfidenceBadge value={ranked[0].confidence}/></div><div className="why-checks">{(ranked[0].rationale ?? (demoMode ? ['Illustrative pathway ranking shown for interface demonstration.'] : [])).map((reason) => <div key={reason}><span className="check-dot">✓</span>{reason}</div>)}{!demoMode && !ranked[0].rationale?.length && <p className="muted-note">The backend did not return specific prioritization reasons.</p>}</div><div className="missing-box"><strong>Missing evidence</strong>{(ranked[0].missing_evidence?.length ? ranked[0].missing_evidence : ['No missing-evidence details returned']).map((item) => <div key={item}><span>!</span>{item}</div>)}</div><div className="interpretation-box"><span className="eyebrow">INTERPRETATION</span><p>Prioritized hypothesis for targeted validation.</p></div></> : <EmptyState title="Prioritization explanation unavailable" detail="An explanation appears only for a pathway returned by the analysis service."/>}
      </Panel>
    </div>
    <StatusNote kind="warning">Predicted and putative results are hypotheses unless experimentally confirmed. An evidence score is not proof that a metabolite exists.</StatusNote>
  </div>;
}
