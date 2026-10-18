import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Beaker, CircleHelp, GitBranch, Layers3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useWorkspace } from '../state/Workspace';
import { demoEvidence, demoPathways } from '../demo';
import { PageHeading, Panel, MetricCard, ConfidenceBadge, Badge, EmptyState, DemoNotice } from '../components/ui';
import type { EvidenceScores, PathwayRecord } from '../models';

const evidenceLabels = [
  { key: 'chemical', label: 'Chemical', explanation: 'Chemical plausibility inferred from structure and transformation context.' },
  { key: 'omics', label: 'Omics', explanation: 'Functional-omics support; gene-family evidence is not proof of enzyme activity.' },
  { key: 'msms', label: 'LC-MS/MS', explanation: 'Structural support from observed fragmentation, when data are supplied.' },
  { key: 'temporal', label: 'Temporal', explanation: 'Parent/product time ordering and association; not biochemical causation.' },
  { key: 'literature', label: 'Literature', explanation: 'Support from mapped literature knowledge, when available.' },
] as const;

export function Dashboard() {
  const { analysis, demoMode, history, health } = useWorkspace();
  const navigate = useNavigate();
  const pathways = demoMode ? demoPathways : analysis?.pathways ?? [];
  const scores: EvidenceScores | undefined = demoMode ? demoEvidence : analysis?.evidence;
  const chartData = evidenceLabels.map((item) => { const score = scores?.[item.key]; return { name: item.label, score: typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1 ? score : null, explanation: item.explanation }; });
  const hasChartEvidence = chartData.some((item) => item.score !== null);
  const analyses = useMemo(() => {
    if (demoMode) return [{ name: 'Aspirin', formula: 'C9H8O4', candidates: '12 candidates', score: '0.86', confidence: 'UNKNOWN', status: 'Illustrative' }];
    return history.slice(0, 4).map((item) => ({ name: item.compound?.name ?? 'Unnamed compound', formula: item.compound?.formula ?? 'Unavailable', candidates: `${item.transformations?.length ?? '—'} candidates`, score: typeof item.pathways?.[0]?.score === 'number' ? item.pathways[0].score.toFixed(2) : '—', confidence: item.pathway_confidence ?? 'UNKNOWN', status: item.status ?? 'Response received' }));
  }, [demoMode, history]);

  return <div className="page-stack">
    {demoMode && <DemoNotice/>}
    <PageHeading eyebrow="EVIDENCE-FUSION WORKSPACE" title="Xenobiotic Transformation Intelligence" description="Integrate chemical, analytical, biological and temporal evidence to prioritize transformation pathways." action={<button className="button button-primary" onClick={() => navigate('/analyze')}><Beaker size={16}/> Analyze chemical</button>}/>
    <div className="metrics-grid">
      <MetricCard label="Chemicals analyzed" value={demoMode ? '1' : history.length ? String(history.length) : '—'} detail={demoMode ? 'DEMO DATA' : 'Saved analysis records'} icon={<Beaker size={17}/>} tone="teal"/>
      <MetricCard label="Transformation candidates" value={demoMode ? '12' : analysis?.transformations ? String(analysis.transformations.length) : '—'} detail={demoMode ? 'DEMO DATA · example value' : 'Current analysis'} icon={<GitBranch size={17}/>} tone="blue"/>
      <MetricCard label="Pathways generated" value={demoMode ? '3' : analysis?.pathways ? String(analysis.pathways.length) : '—'} detail={demoMode ? 'DEMO DATA · illustrative' : 'Current analysis'} icon={<Layers3 size={17}/>} tone="amber"/>
      <MetricCard label="High-confidence candidates" value="—" detail={demoMode ? 'Not represented in this demo' : 'No standard-confirmed results inferred'} icon={<Activity size={17}/>} tone="green" tooltip="Confirmation requires appropriate experimental/reference-standard evidence."/>
    </div>
    {health.message === 'Checking backend…' ? <div className="connection-callout"><span className="connection-icon"><CircleHelp size={16}/></span><div><strong>Checking FastAPI availability</strong><p>Scientific analysis and evidence status will be shown after the backend health request completes.</p></div></div> : !health.connected && health.checkedAt ? <div className="connection-callout"><span className="connection-icon"><CircleHelp size={16}/></span><div><strong>FastAPI backend is unavailable</strong><p>The backend health request failed. Configure or check the API base in Settings; analyses and scientific evidence remain unavailable until it responds.</p></div><button className="text-button" onClick={() => navigate('/settings')}>Configure API <ArrowRight size={14}/></button></div> : null}
    <div className="dashboard-grid">
      <Panel className="recent-panel" title="Recent analyses" subtitle="Backend results and locally saved records only." action={<button className="text-button" onClick={() => navigate('/history')}>View history <ArrowRight size={14}/></button>}>
        {analyses.length ? <div className="table-wrap"><table><thead><tr><th>Chemical</th><th>Formula</th><th>Candidates</th><th>Top score</th><th>Pathway confidence</th><th>Status</th></tr></thead><tbody>{analyses.map((row, index) => <tr key={`${row.name}-${index}`} onClick={() => navigate(demoMode ? '/pathways' : '/history')} className="click-row"><td><strong>{row.name}</strong></td><td className="mono">{row.formula}</td><td>{row.candidates}</td><td className="score-cell">{row.score}</td><td><ConfidenceBadge value={row.confidence}/></td><td><Badge tone={demoMode ? 'amber' : 'green'}>{row.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No analyses yet" detail="Run an analysis through the connected FastAPI service. The dashboard will reflect returned data only." action={<button className="button button-secondary" onClick={() => navigate('/analyze')}>Analyze a chemical</button>}/>}
        {demoMode && <div className="table-demo-caption">DEMO DATA · the Aspirin row uses only example values from the project brief.</div>}
      </Panel>
      <Panel className="evidence-overview" title="Evidence overview" subtitle="Five dimensions of pathway support." action={<span className="icon-button info-indicator" title="Every component is a weighted evidence dimension; unavailable components are not imputed."><CircleHelp size={16}/></span>}>
        {hasChartEvidence ? <div className="chart-frame"><ResponsiveContainer width="100%" height={240}><BarChart data={chartData} layout="vertical" margin={{ left: 5, right: 16, top: 5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(120,150,170,.13)"/><XAxis type="number" domain={[0, 1]} tick={{ fill: '#91a6b6', fontSize: 10 }} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" width={74} tick={{ fill: '#b6c6d2', fontSize: 11 }} tickLine={false} axisLine={false}/><Tooltip cursor={{ fill: 'rgba(79, 220, 202, .07)' }} contentStyle={{ background: '#0c1925', border: '1px solid rgba(133,171,191,.2)', borderRadius: 8, color: '#eaf3f7' }} formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : 'Unavailable', 'Evidence score']}/><Bar dataKey="score" fill="#4ed5c7" radius={[0, 5, 5, 0]} barSize={12} background={{ fill: 'rgba(120,150,170,.08)', radius: 5 }}/></BarChart></ResponsiveContainer><div className="chart-caption">{demoMode ? 'DEMO DATA · example evidence values from the brief.' : 'Only evidence scores returned by the analysis service are shown.'}</div></div> : <EmptyState title="Evidence overview unavailable" detail="Evidence components will appear only after valid 0–1 backend scores are returned. Missing or out-of-range evidence is not treated as a zero score."/>}
      </Panel>
      <Panel className="pathway-preview" title="Recent transformation pathways" subtitle="Ranked hypotheses, not confirmed biological truth." action={<button className="text-button" onClick={() => navigate('/pathways')}>Explore all <ArrowRight size={14}/></button>}>
        {pathways.length ? <div className="pathway-list">{pathways.slice(0, 3).map((path, index) => <PathwayCard key={path.id} item={path} index={index} demo={demoMode}/>)}</div> : <EmptyState title="No pathways returned" detail="Pathway cards appear after a successful analysis. No candidates are generated locally."/>}
      </Panel>
      <Panel className="workflow-panel" title="Analysis pipeline" subtitle="Input to explainable pathway ranking.">
        <div className="mini-pipeline">{['Structure', 'Transformations', 'Evidence fusion', 'Ranking', 'Report'].map((step, index) => <div className="mini-step" key={step}><span className={analysis ? 'step-completed' : ''}>{String(index + 1).padStart(2, '0')}</span><b>{step}</b>{index < 4 && <i/>}</div>)}</div><div className="panel-footnote"><span className={`service-indicator ${health.connected ? 'on' : 'off'}`}/>{health.connected ? 'Backend health endpoint responded.' : health.checkedAt ? 'Backend health check failed.' : 'Backend availability has not been verified.'}</div>
      </Panel>
    </div>
  </div>;
}

function PathwayCard({ item, index, demo }: { item: PathwayRecord; index: number; demo: boolean }) {
  const navigate = useNavigate();
  return <button className="pathway-card" onClick={() => navigate('/graph')}><span className="pathway-rank">0{index + 1}</span><span className="pathway-body"><strong>{item.name ?? `Pathway ${index + 1}`}</strong><span className="pathway-chain">{(item.compounds ?? []).join('  →  ') || 'Pathway composition unavailable'}</span><span className="pathway-meta"><ConfidenceBadge value={item.confidence}/><small>{item.evidence_count ?? '—'} evidence types</small>{demo && <small>DEMO DATA</small>}</span></span><span className="pathway-score"><b>{typeof item.score === 'number' ? item.score.toFixed(2) : '—'}</b><small>pathway score</small></span></button>;
}
