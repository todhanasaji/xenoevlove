import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileJson, FileText, LoaderCircle, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useWorkspace } from '../state/Workspace';
import { Badge, ConfidenceBadge, DemoNotice, EmptyState, PageHeading, Panel, StatusNote } from '../components/ui';
import { calculateXes, getEvidenceWeights } from '../models';
import type { AnalysisResult } from '../models';

const disclaimer = 'Predicted and putative results are hypotheses unless experimentally confirmed.';
function saveDownload(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}
function safeFilePart(value: string) { return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'analysis'; }
function reportObject(result: AnalysisResult, demo: boolean) {
  const weights = getEvidenceWeights();
  const evidenceScores = result.evidence ? { ...result.evidence, xes: calculateXes(result.evidence, weights), xes_weights: weights } : null;
  const raw = result.raw && typeof result.raw === 'object' && !Array.isArray(result.raw) ? result.raw as Record<string, unknown> : {};
  return { title: 'XenoEvolve Omics Analysis Report', generated_at: new Date().toISOString(), software: 'XenoEvolve Omics · 1.0.0', mode: demo ? 'DEMO DATA — illustrative only' : 'Backend analysis response', input_compound: result.compound, molecular_profile: result.compound, predicted_transformations: result.transformations ?? [], transformation_graph: result.graph ?? null, ranked_pathways: result.pathways ?? [], evidence_scores: evidenceScores, omics_evidence: raw.omics ?? raw.functional_omics ?? null, lc_hrms_ms_evidence: raw.msms ?? null, temporal_evidence: raw.temporal ?? null, confidence: { chemical_annotation: result.annotation_confidence ?? 'UNKNOWN', pathway: result.pathway_confidence ?? 'UNKNOWN' }, benchmark_results: raw.benchmark_results ?? raw.benchmark ?? null, limitations: result.limitations ?? ['Benchmark results, orthogonal evidence and reference-standard confirmation are not inferred.'], provenance: result.provenance ?? [], disclaimer };
}

export function ReportsPage() {
  const { analysis, demoMode, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [printable, setPrintable] = useState(false);
  const [error, setError] = useState('');
  const [reportLink, setReportLink] = useState('');
  const result = analysis;
  const report = result ? reportObject(result, demoMode) : null;
  const baseName = safeFilePart(result?.compound?.name ?? 'analysis');
  const exportJson = () => { if (!report) return; saveDownload(`xenoevolve-${baseName}-report.json`, JSON.stringify(report, null, 2), 'application/json'); notify('JSON report exported', 'success'); };
  const exportCsv = () => {
    if (!result) return;
    const raw = result.raw && typeof result.raw === 'object' && !Array.isArray(result.raw) ? result.raw as Record<string, unknown> : {};
    const fields: Array<[string, unknown]> = [
      ['data_mode', demoMode ? 'DEMO DATA — illustrative only' : 'Backend analysis response'], ['generated_at', new Date().toISOString()], ['software_version', 'XenoEvolve Omics 1.0.0'], ['compound_name', result.compound.name], ['formula', result.compound.formula], ['molecular_weight', result.compound.molecular_weight], ['canonical_smiles', result.compound.canonical_smiles], ['chemical_annotation_confidence', result.annotation_confidence ?? 'UNKNOWN'], ['pathway_confidence', result.pathway_confidence ?? 'UNKNOWN'], ['xes_client_recomputed', calculateXes(result.evidence, getEvidenceWeights())], ['xes_weights', getEvidenceWeights()], ['backend_reported_xes_unvalidated', result.evidence?.xes], ['chemical_score', result.evidence?.chemical], ['omics_score', result.evidence?.omics], ['msms_score', result.evidence?.msms], ['temporal_score', result.evidence?.temporal], ['literature_score', result.evidence?.literature], ['omics_evidence', raw.omics ?? raw.functional_omics], ['lc_hrms_ms_evidence', raw.msms], ['temporal_evidence', raw.temporal], ['benchmark_results', raw.benchmark_results ?? raw.benchmark], ['provenance', result.provenance ?? []], ['limitations', result.limitations ?? ['Benchmark results and orthogonal evidence are not inferred.']], ['disclaimer', disclaimer],
    ];
    const rows = [['field', 'value'], ...fields.map(([key, value]) => [key, csvCell(value)])];
    (result.pathways ?? []).forEach((path, index) => rows.push([`pathway_${index + 1}`, csvCell({ name: path.name, score: path.score, confidence: path.confidence, compounds: path.compounds })]));
    saveDownload(`xenoevolve-${baseName}-report.csv`, rows.map((row) => row.join(',')).join('\n'), 'text/csv;charset=utf-8'); notify('CSV report exported', 'success');
  };
  const generatePdf = async () => {
    if (!result) return;
    setBusy(true); setError(''); setReportLink('');
    try {
      const response = await api.generateReport({ analysis_id: result.id, format: 'pdf', disclaimer });
      const candidate = response.download_url ?? response.file_url ?? response.url;
      if (typeof candidate === 'string' && (/^https?:\/\//.test(candidate) || candidate.startsWith('/'))) { setReportLink(candidate); notify('Report generated', 'success', 'Download the PDF returned by the backend.'); }
      else { setPrintable(true); window.setTimeout(() => window.print(), 150); notify('Printable report ready', 'info', 'Choose “Save as PDF” in the browser print dialog.'); }
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : 'PDF report generation failed.';
      setError(`Backend PDF generation unavailable: ${message} A print-ready report from the current analysis is available instead.`);
      setPrintable(true); window.setTimeout(() => window.print(), 200);
    } finally { setBusy(false); }
  };
  useEffect(() => { const onAfterPrint = () => setPrintable(false); window.addEventListener('afterprint', onAfterPrint); return () => window.removeEventListener('afterprint', onAfterPrint); }, []);

  return <div className="page-stack">
    {demoMode && <DemoNotice>The downloadable example report is marked DEMO DATA and contains no experimental observations.</DemoNotice>}
    <PageHeading eyebrow="EXPORT & PROVENANCE" title="Analysis reports" description="Generate a report or export actual analysis records with their evidence limitations and provenance." action={<Badge tone={result ? 'green' : 'neutral'}>{result ? 'Analysis loaded' : 'No analysis loaded'}</Badge>}/>
    <div className="report-grid"><Panel title="Generate report" subtitle="PDF includes available fields, limitations and provenance.">
      <div className="report-action-grid"><button className="report-action-card" onClick={() => void generatePdf()} disabled={!result || busy}><span className="report-icon"><Printer size={18}/></span><strong>{busy ? 'Preparing PDF…' : 'Generate PDF'}</strong><small>{busy ? <LoaderCircle size={13} className="spin"/> : 'Backend PDF or browser Save as PDF'}</small></button><button className="report-action-card" onClick={exportCsv} disabled={!result}><span className="report-icon"><Download size={18}/></span><strong>Export CSV</strong><small>Compound, scores and pathway rows</small></button><button className="report-action-card" onClick={exportJson} disabled={!result}><span className="report-icon"><FileJson size={18}/></span><strong>Export JSON</strong><small>Structured analysis and provenance</small></button><button className="report-action-card" onClick={() => { void api.generateReport({ analysis_id: result?.id, format: 'download', disclaimer }).then((response) => { const url = response.download_url ?? response.file_url ?? response.url; if (typeof url === 'string' && (/^https?:\/\//.test(url) || url.startsWith('/'))) { setReportLink(url); notify('Download ready', 'success'); } else exportJson(); }).catch((issue) => { const message = issue instanceof Error ? issue.message : 'Report download unavailable.'; exportJson(); setError(`Backend report download unavailable: ${message} Exported the structured JSON report instead.`); }); }} disabled={!result}><span className="report-icon"><FileText size={18}/></span><strong>Download report</strong><small>Request backend report or use JSON export</small></button></div>
      {!result && <EmptyState title="No analysis to export" detail="Export actions are enabled after actual analysis data are returned or the explicit demo mode is active."/>}
      {error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}{reportLink && <a className="download-ready" href={reportLink} target={reportLink.startsWith('http') ? '_blank' : undefined} rel="noreferrer"><CheckCircle2 size={16}/> Download generated file <ArrowRight size={14}/></a>}
    </Panel><Panel title="Report contents" subtitle="Fields are included when available; missing evidence remains explicit."><ol className="report-contents">{['Input compound', 'Molecular profile', 'Predicted transformations', 'Transformation graph', 'Ranked pathways', 'Evidence scores', 'Omics evidence', 'LC-MS/MS evidence', 'Temporal evidence', 'Confidence classification', 'Benchmark results', 'Limitations', 'Provenance', 'Timestamp', 'Software/version'].map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}<b>{result ? 'Included if returned' : 'Awaiting analysis'}</b></li>)}</ol></Panel></div>
    <StatusNote kind="warning">{disclaimer}</StatusNote>
    {printable && report && <section className="print-report"><div className="print-report-brand"><strong>XenoEvolve Omics</strong><span>Evidence-Fusion for Xenobiotic Transformation</span></div><h1>Analysis Report</h1><p className="print-demo">{demoMode ? 'DEMO DATA — illustrative only; not an analysis result.' : 'Backend analysis response'}</p><p><b>Generated:</b> {new Date().toISOString()}</p><h2>Input compound</h2><pre>{JSON.stringify(report.input_compound, null, 2)}</pre><h2>Molecular profile</h2><pre>{JSON.stringify(report.molecular_profile, null, 2)}</pre><h2>Predicted transformations</h2><pre>{JSON.stringify(report.predicted_transformations, null, 2)}</pre><h2>Transformation graph</h2><pre>{JSON.stringify(report.transformation_graph, null, 2)}</pre><h2>Ranked pathways</h2><pre>{JSON.stringify(report.ranked_pathways, null, 2)}</pre><h2>Evidence scores</h2><pre>{JSON.stringify(report.evidence_scores, null, 2)}</pre><h2>Omics evidence</h2><pre>{JSON.stringify(report.omics_evidence, null, 2)}</pre><h2>LC-HRMS/MS evidence</h2><pre>{JSON.stringify(report.lc_hrms_ms_evidence, null, 2)}</pre><h2>Temporal evidence</h2><pre>{JSON.stringify(report.temporal_evidence, null, 2)}</pre><h2>Benchmark results</h2><pre>{JSON.stringify(report.benchmark_results, null, 2)}</pre><h2>Confidence and limitations</h2><pre>{JSON.stringify({ confidence: report.confidence, limitations: report.limitations }, null, 2)}</pre><h2>Provenance</h2><pre>{JSON.stringify(report.provenance, null, 2)}</pre><p className="print-disclaimer">{disclaimer}</p></section>}
  </div>;
}

function csvCell(value: unknown): string { const raw = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value); return `"${raw.replaceAll('"', '""')}"`; }

export function HistoryPage() {
  const { history, openHistory, deleteHistory, refreshHistory, health, notify } = useWorkspace();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const sync = async () => { setSyncing(true); const outcome = await refreshHistory(); setSyncing(false); if (outcome.success) notify('History refreshed', 'success', 'Backend history checked; browser-local records were preserved.'); else notify('History refresh failed', 'error', outcome.message ?? (health.connected ? 'Backend history could not be retrieved.' : 'Backend history is unavailable; existing browser-local records remain visible.')); };
  const exportRecord = (item: AnalysisResult) => saveDownload(`xenoevolve-${safeFilePart(item.compound.name ?? item.id)}.json`, JSON.stringify(reportObject(item, false), null, 2), 'application/json');
  const deleteRecord = (item: AnalysisResult) => { if (!window.confirm(`Delete the local history record for “${item.compound.name ?? item.id}”? This cannot be undone.`)) return; deleteHistory(item.id); notify('History record deleted', 'success'); };
  return <div className="page-stack"><PageHeading eyebrow="SAVED ANALYSES" title="Analysis history" description="Browse backend-saved or browser-local analysis records. Local records are stored only in this browser." action={<button className="button button-secondary" onClick={() => void sync()} disabled={syncing}>{syncing ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>} Refresh history</button>}/>
    <Panel title="Analysis records" subtitle={health.connected ? 'Backend history is checked when available; local records may also be present.' : 'Browser-local storage only; backend history is currently unavailable.'}>
      {history.length ? <div className="table-wrap"><table><thead><tr>{['Date', 'Chemical', 'Candidates', 'Top pathway', 'Score', 'Pathway confidence', 'Status', 'Actions'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td><td><strong>{item.compound?.name ?? 'Unnamed compound'}</strong></td><td>{item.transformations?.length ?? '—'}</td><td>{item.pathways?.[0]?.name ?? '—'}</td><td>{typeof item.pathways?.[0]?.score === 'number' ? item.pathways[0].score.toFixed(2) : '—'}</td><td><ConfidenceBadge value={item.pathway_confidence}/></td><td><Badge>{item.status ?? 'Response received'}</Badge></td><td><div className="row-actions"><button className="icon-button" title="Open analysis" onClick={() => { openHistory(item); navigate('/analyze'); }}><ArrowRight size={15}/></button><button className="icon-button" title="Export JSON" onClick={() => exportRecord(item)}><Download size={15}/></button><button className="icon-button danger-icon" title="Delete analysis" onClick={() => deleteRecord(item)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon="flask" title="No analysis history" detail="Completed backend results may be saved locally or retrieved from the FastAPI history endpoint. Demo data is not stored as an analysis record." action={<button className="button button-primary" onClick={() => navigate('/analyze')}>Analyze a chemical <ArrowRight size={14}/></button>}/>}
    </Panel><StatusNote kind="info">Delete removes a browser-local record. Persistent backend records require a corresponding supported backend delete operation.</StatusNote></div>;
}
