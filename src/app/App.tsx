import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { ToastViewport } from '../components/ToastViewport';

const Landing = lazy(() => import('../pages/Landing').then((module) => ({ default: module.Landing })));
const Dashboard = lazy(() => import('../pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const AnalyzeChemical = lazy(() => import('../pages/AnalyzeChemical').then((module) => ({ default: module.AnalyzeChemical })));
const GraphPage = lazy(() => import('../pages/GraphPage').then((module) => ({ default: module.GraphPage })));
const EvidencePage = lazy(() => import('../pages/EvidencePage').then((module) => ({ default: module.EvidencePage })));
const PathwaysPage = lazy(() => import('../pages/PathwaysPage').then((module) => ({ default: module.PathwaysPage })));
const OmicsPage = lazy(() => import('../pages/EvidencePages').then((module) => ({ default: module.OmicsPage })));
const MsmsPage = lazy(() => import('../pages/EvidencePages').then((module) => ({ default: module.MsmsPage })));
const TemporalPage = lazy(() => import('../pages/EvidencePages').then((module) => ({ default: module.TemporalPage })));
const ContextPage = lazy(() => import('../pages/EvidencePages').then((module) => ({ default: module.ContextPage })));
const BenchmarkPage = lazy(() => import('../pages/BenchmarkPage').then((module) => ({ default: module.BenchmarkPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPages').then((module) => ({ default: module.ReportsPage })));
const HistoryPage = lazy(() => import('../pages/ReportsPages').then((module) => ({ default: module.HistoryPage })));
const ProjectInfoPage = lazy(() => import('../pages/ProjectSettings').then((module) => ({ default: module.ProjectInfoPage })));
const SettingsPage = lazy(() => import('../pages/ProjectSettings').then((module) => ({ default: module.SettingsPage })));

function LoadingPage() {
  return <div className="app-loading"><span className="pulse-dot"/><span>Loading XenoEvolve workspace…</span></div>;
}

export function App() {
  return <Suspense fallback={<LoadingPage/>}>
    <Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/dashboard" element={<Shell><Dashboard/></Shell>}/>
      <Route path="/analyze" element={<Shell><AnalyzeChemical/></Shell>}/>
      <Route path="/graph" element={<Shell><GraphPage/></Shell>}/>
      <Route path="/evidence" element={<Shell><EvidencePage/></Shell>}/>
      <Route path="/pathways" element={<Shell><PathwaysPage/></Shell>}/>
      <Route path="/omics" element={<Shell><OmicsPage/></Shell>}/>
      <Route path="/msms" element={<Shell><MsmsPage/></Shell>}/>
      <Route path="/temporal" element={<Shell><TemporalPage/></Shell>}/>
      <Route path="/kegg" element={<Shell><ContextPage kind="kegg"/></Shell>}/>
      <Route path="/ncbi" element={<Shell><ContextPage kind="ncbi"/></Shell>}/>
      <Route path="/benchmarking" element={<Shell><BenchmarkPage/></Shell>}/>
      <Route path="/reports" element={<Shell><ReportsPage/></Shell>}/>
      <Route path="/history" element={<Shell><HistoryPage/></Shell>}/>
      <Route path="/project-info" element={<Shell><ProjectInfoPage/></Shell>}/>
      <Route path="/settings" element={<Shell><SettingsPage/></Shell>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
    <ToastViewport/>
  </Suspense>;
}
