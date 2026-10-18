import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, Beaker, BookOpen, ChevronRight, CircleHelp,
  GitBranch, History, Menu, Moon, Network, Search, Settings, ShieldCheck,
  Sparkles, Sun, X, Microscope, Dna, Clock3, Landmark, FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWorkspace } from '../state/Workspace';
import { ServiceBadge } from './ui';

const navItems: { label: string; path: string; icon: LucideIcon; section?: string }[] = [
  { label: 'Dashboard', path: '/dashboard', icon: Activity, section: 'WORKSPACE' },
  { label: 'Analyze Chemical', path: '/analyze', icon: Beaker },
  { label: 'Transformation Graph', path: '/graph', icon: GitBranch, section: 'EVIDENCE' },
  { label: 'Evidence Engine', path: '/evidence', icon: Sparkles },
  { label: 'Pathway Explorer', path: '/pathways', icon: Network },
  { label: 'Omics Evidence', path: '/omics', icon: Dna },
  { label: 'LC-MS/MS Evidence', path: '/msms', icon: Microscope },
  { label: 'Temporal Analysis', path: '/temporal', icon: Clock3 },
  { label: 'KEGG Context', path: '/kegg', icon: Landmark },
  { label: 'NCBI Context', path: '/ncbi', icon: BookOpen },
  { label: 'Benchmarking', path: '/benchmarking', icon: BarChart3, section: 'VALIDATION' },
  { label: 'Reports', path: '/reports', icon: FileText },
  { label: 'Analysis History', path: '/history', icon: History },
  { label: 'Project Info', path: '/project-info', icon: CircleHelp, section: 'PROJECT' },
  { label: 'Settings', path: '/settings', icon: Settings },
];

const titleMap = Object.fromEntries(navItems.map((item) => [item.path, item.label]));

export function BrandMark({ small = false }: { small?: boolean }) {
  return <div className={`brand-mark ${small ? 'brand-mark-small' : ''}`} aria-hidden="true">
    <img src="/manus-storage/async-images/268D97rFoSC9C3N0jWjjqc/image-1.webp" alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
    <svg viewBox="0 0 40 40" role="presentation"><path d="M20 4 33 12v16L20 36 7 28V12L20 4Z" /><path d="m20 20-8-6m8 6 8-6m-8 6v10" /><circle cx="20" cy="20" r="2.7"/><circle cx="12" cy="14" r="2"/><circle cx="28" cy="14" r="2"/><circle cx="20" cy="30" r="2"/></svg>
  </div>;
}

function ServiceStatus({ compact = false }: { compact?: boolean }) {
  const { health } = useWorkspace();
  const checking = health.message === 'Checking backend…';
  const backendState = checking ? 'checking' : health.connected ? 'available' : health.checkedAt ? 'unavailable' : 'unknown';
  const rdkitState = health.rdkit === true ? 'available' : health.rdkit === false ? 'unavailable' : 'unknown';
  const reportedApis = Object.values(health.services ?? {});
  const apiState = reportedApis.some((value) => value === true || value === 'available' || value === 'connected' || value === 'ready') ? 'available' : reportedApis.some((value) => value === false || value === 'unavailable' || value === 'offline' || value === 'error') ? 'unavailable' : 'unknown';
  return compact ? <div className="compact-status"><span className={`status-dot status-${backendState}`} />{health.connected ? 'Backend connected' : checking ? 'Checking backend' : health.checkedAt ? 'Backend unavailable' : 'Backend not verified'}</div> : <div className="sidebar-status">
    <div className="sidebar-status-title"><span>System status</span><span className="pulse-dot" /></div>
    <ServiceBadge name="Backend" state={backendState} detail={health.message} />
    <ServiceBadge name="RDKit" state={rdkitState} detail={health.rdkit === null ? 'RDKit capability has not been verified by the backend.' : undefined} />
    <ServiceBadge name="APIs" state={apiState} detail={apiState === 'unknown' ? 'Individual API availability has not been verified by the backend health response.' : 'This status reflects service availability explicitly reported by the backend.'} />
  </div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { health, demoMode, setDemoMode, refreshHealth } = useWorkspace();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [light, setLight] = useState(localStorage.getItem('xenoevolve.theme') === 'light');
  const current = titleMap[location.pathname] ?? 'Dashboard';

  useEffect(() => { document.documentElement.dataset.theme = light ? 'light' : 'dark'; }, [light]);

  const toggleTheme = () => {
    const next = !light;
    setLight(next);
    localStorage.setItem('xenoevolve.theme', next ? 'light' : 'dark');
    document.documentElement.dataset.theme = next ? 'light' : 'dark';
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = search.trim().toLowerCase();
    const target = navItems.find((item) => item.label.toLowerCase().includes(value));
    if (target) { navigate(target.path); setSearch(''); }
  };
  const sidebar = <>
    <div className="sidebar-brand"><BrandMark /><div><strong>XenoEvolve</strong><span>OMICS</span><small>Evidence-Fusion for Xenobiotic Transformation</small></div></div>
    <nav className="sidebar-nav" aria-label="Main navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        return <div key={item.path}>{item.section && <div className="nav-section-label">{item.section}</div>}
          <NavLink to={item.path} aria-label={item.label} onClick={() => setDrawerOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={16} strokeWidth={1.8} /><span>{item.label}</span>{item.path === '/analyze' && <span className="nav-hotkey">⌘ K</span>}</NavLink>
        </div>;
      })}
    </nav>
    <div className="sidebar-bottom"><ServiceStatus /><div className="sidebar-footnote"><ShieldCheck size={13} /> Evidence-aware · Hypothesis-first</div></div>
  </>;

  return <div className={`app-shell ${light ? 'theme-light' : ''}`}>
    <aside className="sidebar desktop-sidebar">{sidebar}</aside>
    {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)}><aside className="sidebar mobile-sidebar" onClick={(event) => event.stopPropagation()}><button className="drawer-close icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X size={18}/></button>{sidebar}</aside></div>}
    <div className="app-main">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu size={19}/></button>
        <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{current}</strong></div>
        <div className="topbar-actions">
          <form className="search-box" onSubmit={submitSearch}><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search pages" placeholder="Search workspace"/><kbd>↵</kbd></form>
          <ServiceStatus compact />
          <button className="icon-button" onClick={() => setInfoOpen((value) => !value)} aria-label="System information" title="System information"><Bell size={17}/><span className={`notification-indicator ${health.connected ? 'online' : ''}`}/></button>
          <button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle light/dark theme">{light ? <Moon size={17}/> : <Sun size={17}/>}</button>
          <div className="project-avatar" title="Current project">XE</div>
        </div>
        {infoOpen && <div className="status-popover"><div className="popover-head"><strong>Service status</strong><button className="icon-button" onClick={() => setInfoOpen(false)} aria-label="Close status"><X size={15}/></button></div><p>{health.message || (health.connected ? 'Backend health endpoint responded.' : 'Backend connection has not been established.')}</p><ServiceStatus/><button className="text-button" onClick={() => void refreshHealth()}>Re-check connection</button></div>}
      </header>
      {demoMode && <div className="demo-ribbon"><Sparkles size={14}/><span><strong>DEMO DATA</strong> · Illustrative values only. No experimental measurements or live analysis are represented.</span><button onClick={() => setDemoMode(false)}>Exit demo <X size={13}/></button></div>}
      <main className="page-content" key={location.pathname}>{children}</main>
      <footer className="app-footer"><span>XenoEvolve Omics <i>·</i> Evidence-fusion for xenobiotic transformation</span><span>Predictions are hypotheses unless experimentally confirmed.</span></footer>
    </div>
  </div>;
}
