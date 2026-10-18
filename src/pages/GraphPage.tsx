import { Link } from 'react-router-dom';
import { ArrowRight, CircleHelp, GitBranch } from 'lucide-react';
import { useWorkspace } from '../state/Workspace';
import { PageHeading, Panel, DemoNotice, EmptyState } from '../components/ui';
import { GraphView } from '../components/GraphView';

export function GraphPage() {
  const { analysis, demoMode } = useWorkspace();
  const graph = demoMode ? analysis?.graph : analysis?.graph;
  return <div className="page-stack">
    {demoMode && <DemoNotice>Illustrative node labels only; formulas, m/z values and supporting evidence are intentionally absent.</DemoNotice>}
    <PageHeading eyebrow="PATHWAY TOPOLOGY" title="Transformation graph" description="Inspect candidate nodes, reaction edges and available evidence without treating a ranked route as confirmed truth." action={<Link className="button button-secondary" to="/analyze"><GitBranch size={15}/> New analysis <ArrowRight size={14}/></Link>}/>
    <div className="graph-summary-strip"><div><span className="summary-icon"><GitBranch size={17}/></span><div><strong>{graph?.nodes?.length ?? '—'}</strong><small>Graph nodes</small></div></div><div><span className="summary-icon"><ArrowRight size={17}/></span><div><strong>{graph?.edges?.length ?? '—'}</strong><small>Transformation edges</small></div></div><div><span className="summary-icon"><CircleHelp size={17}/></span><div><strong>{analysis?.pathways?.length ?? '—'}</strong><small>Pathway hypotheses</small></div></div><div className="summary-disclaimer">Graph elements reflect the backend response. Missing formula, m/z, enzyme or score data are not inferred.</div></div>
    <Panel className="graph-panel" title={demoMode ? 'Illustrative pathway topology' : 'Analysis pathway topology'} subtitle={demoMode ? 'DEMO DATA · the graph demonstrates interaction only.' : 'Select nodes and edges to inspect returned metadata.'}>
      <GraphView nodes={graph?.nodes ?? []} edges={graph?.edges ?? []} demo={demoMode}/>
    </Panel>
    {!analysis && <Panel title="How to populate the graph" className="graph-empty-cta"><EmptyState icon="flask" title="No analysis loaded" detail="Run a chemical analysis with a reachable FastAPI service or open the clearly labelled demo to explore graph controls." action={<Link to="/analyze" className="button button-primary">Analyze a chemical <ArrowRight size={15}/></Link>}/></Panel>}
    <div className="graph-footnote"><CircleHelp size={14}/> Confidence categories and edge scores are displayed only when returned by an analysis. An enzyme-family annotation does not prove a specific enzyme reaction.</div>
  </div>;
}
