import { ArrowDownRight, ArrowRight, ArrowUpRight, Beaker, ChevronRight, Dna, FlaskConical, GitBranch, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/Shell';
import { useWorkspace } from '../state/Workspace';

const stages = [
  { n: '01', title: 'Chemical intelligence', desc: 'Normalize structure and inspect molecular features.', icon: FlaskConical },
  { n: '02', title: 'Transformation prediction', desc: 'Request reaction candidates from the configured backend.', icon: Beaker },
  { n: '03', title: 'Evidence integration', desc: 'Bring chemical, omics, analytical and temporal support together.', icon: Dna },
  { n: '04', title: 'Pathway ranking', desc: 'Compare pathway hypotheses using explicit evidence weights.', icon: GitBranch },
  { n: '05', title: 'Explainable results', desc: 'Inspect supporting and missing evidence before prioritizing.', icon: ShieldCheck },
];

export function Landing() {
  const navigate = useNavigate();
  const { setDemoMode } = useWorkspace();
  const openDemo = () => { setDemoMode(true); navigate('/dashboard'); };
  return <div className="landing-page">
    <header className="landing-nav"><Link to="/" className="landing-brand"><BrandMark/><span><strong>XenoEvolve</strong><small>OMICS</small></span></Link><div className="landing-nav-links"><a href="#workflow">Methodology</a><a href="#why">Why XenoEvolve?</a><Link to="/project-info">Project</Link></div><Link className="button button-quiet" to="/dashboard">Open workspace <ArrowUpRight size={15}/></Link></header>
    <main>
      <section className="landing-hero">
        <div className="hero-copy"><div className="hero-kicker"><span className="kicker-line"/> COMPUTATIONAL XENOBIOTIC SCIENCE</div><h1>From xenobiotic structure to <em>evidence-ranked</em> pathways.</h1><p className="hero-subtitle">An explainable computational framework integrating chemical prediction, functional-omics evidence, LC-HRMS/MS, temporal behavior, and biological knowledge.</p><div className="hero-actions"><Link to="/analyze" className="button button-primary">Start analysis <ArrowRight size={16}/></Link><a href="#workflow" className="button button-quiet">Explore methodology <ChevronRight size={15}/></a></div><button className="demo-link" onClick={openDemo}><Sparkles size={14}/> View illustrative demo data</button><p className="hero-disclaimer"><ShieldCheck size={14}/> Predictions are hypotheses unless experimentally confirmed.</p></div>
        <div className="hero-visual-wrap"><div className="visual-label"><span className="live-dot"/> CHEMISTRY <ArrowRight size={12}/> PATHWAY</div><div className="hero-visual"><img src="/manus-storage/async-images/268D97rFoSC9C3N0jWjjqc/image-2.webp" alt="Abstract molecular network branching into transformation pathways"/><svg className="hero-overlay" viewBox="0 0 760 470" aria-hidden="true"><defs><linearGradient id="trace" x1="0" x2="1"><stop offset="0" stopColor="#53dbc9" stopOpacity=".18"/><stop offset=".55" stopColor="#62e3d2" stopOpacity=".8"/><stop offset="1" stopColor="#68adff" stopOpacity=".55"/></linearGradient></defs><path className="hero-trace" d="M160 260 C260 240 310 160 402 198 S530 130 635 134M160 260 C260 280 310 338 402 300 S530 353 635 350"/><circle className="hero-node hero-node-a" cx="160" cy="260" r="9"/><circle className="hero-node" cx="402" cy="198" r="7"/><circle className="hero-node" cx="402" cy="300" r="7"/><circle className="hero-node" cx="635" cy="134" r="7"/><circle className="hero-node" cx="635" cy="350" r="7"/></svg><div className="visual-caption"><span><i/> Evidence flow</span><span>Illustrative visualization</span></div></div><div className="hero-visual-glow"/></div>
      </section>
      <section className="landing-proof-strip"><div><strong>01</strong><span>Structure-aware</span></div><div><strong>02</strong><span>Evidence-fused</span></div><div><strong>03</strong><span>Confidence-aware</span></div><div><strong>04</strong><span>Explainable by design</span></div></section>
      <section className="landing-section" id="workflow"><div className="section-intro"><span className="eyebrow">A TRANSPARENT PIPELINE</span><h2>One connected scientific workflow.</h2><p>Each stage keeps its provenance and uncertainty visible, so pathway ranking remains interpretable from input to report.</p></div><div className="workflow-row">{stages.map((item) => { const Icon = item.icon; return <article className="workflow-step" key={item.n}><div className="workflow-step-top"><span>{item.n}</span><Icon size={17}/></div><h3>{item.title}</h3><p>{item.desc}</p><div className="step-bottom"><span/>{item.n !== '05' && <ArrowDownRight size={13}/>}</div></article>; })}</div></section>
      <section className="landing-section why-section" id="why"><div className="section-intro"><span className="eyebrow">WHY XENOEvolve?</span><h2>Prioritize the hypothesis.<br/><em>Expose the evidence.</em></h2><p>Combine evidence without confusing a computational prediction with an experimentally confirmed metabolite.</p></div><div className="why-grid">{[
        ['Chemical intelligence', 'Structure-derived plausibility, described with its limits.'],
        ['Functional evidence', 'Gene and enzyme-family context, not a claim of enzyme activity.'],
        ['Analytical evidence', 'LC-HRMS/MS support only when real features are supplied.'],
        ['Temporal evidence', 'Formation-order signals without causal overstatement.'],
        ['Explainable ranking', 'Visible component weights, missing evidence and provenance.'],
      ].map(([title, desc], index) => <article className="why-card" key={title}><span className="why-number">0{index + 1}</span><h3>{title}</h3><p>{desc}</p><ArrowUpRight size={15}/></article>)}</div></section>
      <section className="landing-cta"><div><span className="eyebrow">START WITH A CHEMICAL</span><h2>Make the reasoning inspectable.</h2><p>Connect your FastAPI service or explore the clearly marked illustrative walkthrough.</p></div><div><Link to="/analyze" className="button button-primary">Analyze a xenobiotic <ArrowRight size={16}/></Link><button className="button button-quiet" onClick={openDemo}>View demo data</button></div></section>
    </main>
    <footer className="landing-footer"><Link to="/" className="landing-brand"><BrandMark small/><span><strong>XenoEvolve</strong><small>OMICS</small></span></Link><span>Evidence-fusion for xenobiotic transformation</span><span>Predictions are hypotheses unless experimentally confirmed.</span></footer>
  </div>;
}
