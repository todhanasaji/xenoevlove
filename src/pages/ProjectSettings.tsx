import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Check, Globe2, LockKeyhole, Moon, RefreshCw, RotateCcw, Save, ShieldCheck, Sun } from 'lucide-react';
import { useWorkspace } from '../state/Workspace';
import { getApiBase, saveApiBase } from '../services/api';
import { EVIDENCE_WEIGHTS } from '../models';
import { Badge, ConfidenceBadge, PageHeading, Panel, ServiceBadge, StatusNote } from '../components/ui';

const weightLabels = [
  ['chemical', 'Chemical plausibility', 'C'],
  ['omics', 'Functional omics', 'F'],
  ['msms', 'LC-HRMS/MS', 'A'],
  ['temporal', 'Temporal evidence', 'T'],
  ['literature', 'Literature knowledge', 'L'],
] as const;
function storedWeights(): Record<string, number> {
  if (!import.meta.env.DEV) return { ...EVIDENCE_WEIGHTS };
  try { const saved = JSON.parse(localStorage.getItem('xenoevolve.devWeights') ?? 'null'); return saved && typeof saved === 'object' ? { ...EVIDENCE_WEIGHTS, ...saved } : { ...EVIDENCE_WEIGHTS }; } catch { return { ...EVIDENCE_WEIGHTS }; }
}
function serviceState(value: unknown): 'available' | 'unavailable' | 'unknown' {
  if (value === true || value === 'available' || value === 'connected' || value === 'ready') return 'available';
  if (value === false || value === 'unavailable' || value === 'offline' || value === 'error') return 'unavailable';
  return 'unknown';
}

export function ProjectInfoPage() {
  const navigate = useNavigate();
  return <div className="page-stack"><PageHeading eyebrow="PROJECT OVERVIEW" title="About XenoEvolve Omics" description="An explainable computational framework for prioritizing xenobiotic transformation pathways by integrating multiple evidence types." action={<button className="button button-primary" onClick={() => navigate('/analyze')}>Start analysis <ArrowRight size={15}/></button>}/>
    <div className="info-hero"><div className="info-hero-mark"><div className="molecular-emblem"><i/><i/><i/><i/><i/></div></div><div><span className="eyebrow">BIOINFORMATICS RESEARCH WORKBENCH</span><h2>From chemical structure to evidence-ranked pathway hypotheses.</h2><p>XenoEvolve Omics organizes chemical, biological, analytical and temporal evidence to make candidate ranking more inspectable—not to replace experimental validation.</p></div></div>
    <div className="project-info-grid">
      <Panel title="The problem"><p className="body-copy">Xenobiotic transformation analyses can generate many candidate metabolites and possible biological routes. Without careful evidence integration, the most plausible-looking candidate can be confused with a confirmed observation.</p></Panel>
      <Panel title="The proposed solution"><p className="body-copy">XenoEvolve integrates chemical transformation hypotheses with functional-omics capacity, LC-HRMS/MS, temporal evidence and biological knowledge to prioritize pathway hypotheses and show why evidence supports—or fails to support—each candidate.</p></Panel>
      <Panel title="Methodology" className="wide-domain-panel"><div className="method-flow">{['Chemical', 'Transformation', 'Graph', 'Omics', 'LC-MS/MS', 'Temporal', 'Evidence fusion', 'Ranking'].map((step, index) => <div className="method-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>{index < 7 && <ArrowRight size={13}/>}</div>)}</div><div className="method-score"><strong>XES_edge</strong><code>0.20C + 0.25F + 0.30A + 0.15T + 0.10L</code><small>Predefined evidence-fusion weighting; not asserted as experimentally validated.</small></div></Panel>
      <Panel title="Novelty"><div className="novelty-grid">{['Evidence fusion', 'Transformation graph', 'Functional-omics-aware ranking', 'Temporal support', 'Confidence-aware annotation', 'Explainable prioritization', 'Benchmarking & ablation'].map((item) => <div key={item}><span>↗</span>{item}</div>)}</div></Panel>
      <Panel title="Confidence classification" subtitle="Chemical annotation confidence and pathway confidence are separate judgments."><div className="confidence-definition-list">{[['CONFIRMED', 'Requires appropriate experimental or reference-standard evidence.'], ['PUTATIVE', 'Strong analytical/biological support, but not standard-confirmed.'], ['TENTATIVE', 'Plausible candidate with incomplete structural evidence.'], ['LOW CONFIDENCE', 'Weak or inconsistent evidence.']].map(([level, description]) => <div key={level}><ConfidenceBadge value={level}/><span>{description}</span></div>)}</div></Panel>
      <Panel title="Limitations" className="limitations-panel"><ul className="limitations-list"><li>Predictions are not automatically experimental confirmation.</li><li>Enzyme-family evidence does not prove a specific enzyme reaction.</li><li>Temporal correlation does not establish causation.</li><li>Exact mass alone is insufficient for structural confirmation.</li><li>Confirmed status requires appropriate experimental/reference-standard evidence.</li></ul></Panel>
    </div>
    <StatusNote kind="warning">Predicted and putative results are hypotheses unless experimentally confirmed.</StatusNote>
  </div>;
}

export function SettingsPage() {
  const { health, refreshHealth, notify } = useWorkspace();
  const [apiBase, setApiBase] = useState(getApiBase());
  const [depth, setDepth] = useState(localStorage.getItem('xenoevolve.depth') ?? '2');
  const [weights, setWeights] = useState<Record<string, number>>(storedWeights);
  const [graphLayout, setGraphLayout] = useState(localStorage.getItem('xenoevolve.graphLayout') ?? 'hierarchical');
  const [chartPreference, setChartPreference] = useState(localStorage.getItem('xenoevolve.chartPreference') ?? 'balanced');
  const [theme, setTheme] = useState(localStorage.getItem('xenoevolve.theme') ?? 'dark');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const development = import.meta.env.DEV;
  const services = health.services ?? {};
  const weightTotal = weightLabels.reduce((total, [key]) => total + (weights[key] ?? EVIDENCE_WEIGHTS[key]), 0);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const saveSettings = () => {
    setError(''); setSaved(false);
    if (development && Math.abs(weightTotal - 1) > 0.011) { setError('Development evidence weights must total 100% before saving.'); return; }
    try {
      saveApiBase(apiBase);
      localStorage.setItem('xenoevolve.depth', depth);
      localStorage.setItem('xenoevolve.graphLayout', graphLayout);
      localStorage.setItem('xenoevolve.chartPreference', chartPreference);
      localStorage.setItem('xenoevolve.theme', theme);
      document.documentElement.dataset.theme = theme;
      if (development) localStorage.setItem('xenoevolve.devWeights', JSON.stringify(weights));
      setSaved(true); void refreshHealth(); notify('Settings saved', 'success', 'The backend connection will be checked.');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Settings could not be saved.'); }
  };
  const reset = () => {
    if (!window.confirm('Reset API base, depth, evidence weights and display settings to defaults? Analysis history will not be deleted.')) return;
    ['xenoevolve.apiBase', 'xenoevolve.depth', 'xenoevolve.graphLayout', 'xenoevolve.chartPreference', 'xenoevolve.theme', 'xenoevolve.devWeights'].forEach((key) => localStorage.removeItem(key));
    setApiBase('/api'); setDepth('2'); setWeights({ ...EVIDENCE_WEIGHTS }); setGraphLayout('hierarchical'); setChartPreference('balanced'); setTheme('dark'); setSaved(false); setError('');
    document.documentElement.dataset.theme = 'dark'; void refreshHealth(); notify('Settings reset', 'success', 'Analysis history was preserved.');
  };
  return <div className="page-stack"><PageHeading eyebrow="APPLICATION CONFIGURATION" title="Settings" description="Configure the FastAPI connection, analysis depth and display preferences. API keys are never entered or stored in browser code." action={<button className="button button-primary" onClick={saveSettings}><Save size={15}/> Save settings</button>}/>
    <div className="settings-grid">
      <Panel title="API configuration" subtitle="The browser talks to FastAPI; scientific-service credentials belong on the backend.">
        <label className="field-label" htmlFor="api-base">FastAPI base path or URL<input id="api-base" value={apiBase} onChange={(event) => { setApiBase(event.target.value); setSaved(false); }} placeholder="/api or https://api.example.org"/></label>
        <p className="micro-note">Same-origin default: <code>/api</code>. Configure any external service keys server-side; none are exposed in this interface.</p>
        <div className="service-config-list">{[['PubChem', services.pubchem], ['KEGG', services.kegg], ['NCBI', services.ncbi], ['RDKit', health.rdkit]].map(([name, value]) => <div className="service-config-row" key={String(name)}><Globe2 size={15}/><span>{name}</span><ServiceBadge name="Status" state={serviceState(value)} detail="Availability is reported by the backend health response only."/></div>)}</div>
        <button className="text-button" onClick={() => void refreshHealth()}><RefreshCw size={14}/> Check backend status</button>
      </Panel>
      <Panel title="Analysis settings" subtitle="Controls are sent only when supported by the backend contract."><label className="field-label">Transformation depth<select value={depth} onChange={(event) => { setDepth(event.target.value); setSaved(false); }}><option value="1">1 step</option><option value="2">2 steps</option><option value="3">3 steps</option></select></label><p className="micro-note">Current depth preference: {depth} step{depth === '1' ? '' : 's'}.</p><div className="settings-note"><Activity size={15}/><span>Analysis calls can take time. The application remains responsive and displays only backend-reported progress.</span></div></Panel>
      <Panel title="Evidence settings" subtitle="The production weights stay locked to the predefined evaluation formula." action={<Badge tone={development ? 'amber' : 'neutral'}>{development ? 'Development environment' : 'Frozen evaluation weights'}</Badge>}>
        <div className="settings-weight-list">{weightLabels.map(([key, label, letter]) => <label className="settings-weight-row" key={key}><span><i>{letter}</i>{label}</span><strong>{Math.round((weights[key] ?? EVIDENCE_WEIGHTS[key]) * 100)}%</strong><input type="range" min="0" max="1" step="0.01" value={weights[key] ?? EVIDENCE_WEIGHTS[key]} disabled={!development} onChange={(event) => { setWeights((current) => ({ ...current, [key]: Number(event.target.value) })); setSaved(false); }}/></label>)}</div>
        {!development && <p className="muted-note"><LockKeyhole size={14}/> Weight editing is disabled in production; default formula: 0.20C + 0.25F + 0.30A + 0.15T + 0.10L.</p>}{development && <p className={`muted-note ${Math.abs(weightTotal - 1) > 0.011 ? 'text-warning' : ''}`}>Development-only total: {(weightTotal * 100).toFixed(0)}% {Math.abs(weightTotal - 1) > 0.011 ? '— adjust to 100% before applying.' : '— weights total 100%.'}</p>}
      </Panel>
      <Panel title="Display settings" subtitle="Preferences are stored in this browser."><div className="setting-control-row"><div><strong>Theme</strong><small>Dark / light mode</small></div><div className="segmented-control"><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={14}/> Dark</button><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={14}/> Light</button></div></div><label className="field-label">Graph layout<select value={graphLayout} onChange={(event) => setGraphLayout(event.target.value)}><option value="hierarchical">Hierarchical</option><option value="radial">Radial</option></select></label><label className="field-label">Chart preferences<select value={chartPreference} onChange={(event) => setChartPreference(event.target.value)}><option value="balanced">Balanced density</option><option value="compact">Compact labels</option><option value="detailed">Detailed labels</option></select></label></Panel>
    </div>
    {error && <div className="inline-error"><Activity size={15}/>{error}</div>}{saved && <StatusNote kind="success"><Check size={15}/> Settings saved. Backend availability is determined by the most recent health check.</StatusNote>}
    <div className="settings-footer"><div><ShieldCheck size={16}/><span>API keys are not stored or exposed by the frontend.</span></div><button className="button button-secondary" onClick={reset}><RotateCcw size={15}/> Reset to default</button></div>
  </div>;
}
