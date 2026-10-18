import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, Clock3, Dna, FileUp, FlaskConical, LoaderCircle, Microscope, RefreshCw, Upload } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api';
import { useWorkspace } from '../state/Workspace';
import { Badge, DemoNotice, EmptyState, PageHeading, Panel, StatusNote } from '../components/ui';

function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function display(value: unknown): string { return value === null || value === undefined || value === '' ? 'Unavailable' : typeof value === 'string' ? value : JSON.stringify(value); }
function parseCsvRecord(line: string): string[] | null {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { fields.push(value.trim()); value = ''; }
    else value += char;
  }
  if (quoted) return null;
  fields.push(value.trim());
  return fields;
}

export function OmicsPage() {
  const { analysis, demoMode } = useWorkspace();
  const raw = asRecord(analysis?.raw);
  const omics = asRecord(raw?.omics ?? raw?.functional_omics);
  const enzymes = list(omics?.enzyme_families ?? omics?.enzymes);
  const genes = list(omics?.genes ?? omics?.gene_annotations);
  const annotations = list(omics?.functional_annotations ?? omics?.annotations);
  const hasData = !!omics && Object.keys(omics).length > 0;
  return <div className="page-stack">
    {demoMode && <DemoNotice>Demo mode contains no omics measurements or gene-abundance observations.</DemoNotice>}
    <PageHeading eyebrow="FUNCTIONAL CAPACITY" title="Functional omics" description="Inspect returned gene/enzyme-family evidence and its mapping to candidate reactions." action={<Badge tone="blue">Evidence context</Badge>}/>
    <div className="omics-metric-row"><Panel title="Functional capacity" subtitle="Gene-family presence is not proof of expressed enzyme activity."><div className="omics-flow"><div><Dna size={19}/><strong>Gene / enzyme family</strong><small>{hasData ? `${genes.length + enzymes.length} records returned` : 'No omics data'}</small></div><ArrowRight size={17}/><div><RefreshCw size={19}/><strong>Reaction mapping</strong><small>{display(omics?.reaction_mapping_status)}</small></div><ArrowRight size={17}/><div><FlaskConical size={19}/><strong>Transformation</strong><small>{display(omics?.transformation_status)}</small></div></div></Panel>
      <Panel title="Evidence coverage" subtitle="Presence, abundance and expression are kept distinct."><div className="omics-coverage">{[['Gene presence', omics?.gene_presence], ['Gene abundance', omics?.gene_abundance], ['Expression', omics?.expression]].map(([label, value]) => <div className="coverage-row" key={String(label)}><span>{String(label)}</span><strong>{display(value)}</strong></div>)}</div></Panel></div>
    {hasData ? <div className="domain-grid"><Panel title="Enzyme families" subtitle="Backend-returned records only.">{enzymes.length ? <RecordList values={enzymes}/> : <EmptyState title="No enzyme-family records" detail="The backend returned no enzyme-family records."/>}</Panel><Panel title="Gene annotations" subtitle="Abundance or expression fields are not inferred.">{genes.length ? <RecordList values={genes}/> : <EmptyState title="No gene records" detail="The backend returned no gene annotations."/>}</Panel><Panel title="Functional annotations & reaction mapping">{annotations.length ? <RecordList values={annotations}/> : <EmptyState title="No functional annotations" detail="No functional annotations were returned."/>}</Panel><Panel title="Interpretation boundary"><StatusNote kind="warning">If evidence is metagenomic-only, label it “Functional capacity evidence.” It does not directly prove activity of a specific enzyme.</StatusNote></Panel></div> : <Panel><EmptyState icon="flask" title="No functional omics data available" detail="No omics evidence was returned for the current analysis. Upload/annotation processing requires the configured FastAPI service; gene presence and abundance are not invented."/></Panel>}
  </div>;
}

function RecordList({ values }: { values: unknown[] }) { return <div className="record-list">{values.map((value, index) => { const record = asRecord(value); return <div className="record-item" key={index}><strong>{display(record?.name ?? record?.gene ?? record?.family ?? `Record ${index + 1}`)}</strong><span>{display(record?.annotation ?? record?.function ?? record?.abundance)}</span>{record?.accession !== undefined ? <code>{display(record.accession)}</code> : null}</div>; })}</div>; }

export function MsmsPage() {
  const { analysis, demoMode, notify, setAnalysis } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const allowed = ['.mzml', '.mzxml', '.mgf', '.msp', '.txt', '.csv'];
  const onFile = (candidate?: File) => {
    setError(''); setResult(null);
    if (!candidate) { setFile(null); return; }
    const ext = candidate.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    if (!allowed.includes(ext)) { setFile(null); setError('Unsupported file type. Select a common open format: .mzML, .mzXML, .mgf, .msp, .txt or .csv.'); return; }
    if (candidate.size > 50 * 1024 * 1024) { setFile(null); setError('File exceeds the 50 MB upload limit.'); return; }
    setFile(candidate);
  };
  const processFile = async () => {
    if (!file) { setError('Choose an MS/MS file before processing.'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file); if (analysis?.id && !demoMode) form.append('analysis_id', analysis.id);
      const response = await api.analyzeMsms(form);
      setResult(response); if (analysis && !demoMode) setAnalysis({ ...analysis, raw: { ...(asRecord(analysis.raw) ?? {}), msms: response } }, true); notify('MS/MS processing response received', 'success', 'Review the returned feature and candidate-match evidence.');
    } catch (issue) { const message = issue instanceof Error ? issue.message : 'MS/MS upload failed.'; setError(message); notify('MS/MS processing failed', 'error', message); }
    finally { setBusy(false); }
  };
  const features = list(result?.features);
  const spectrum = list(result?.mass_spectrum ?? result?.spectrum);
  const chromatogram = list(result?.chromatogram);
  return <div className="page-stack">
    {demoMode && <DemoNotice>Demo mode includes no observed LC-MS/MS measurements.</DemoNotice>}
    <PageHeading eyebrow="ANALYTICAL EVIDENCE" title="LC-HRMS/MS evidence" description="Upload supported open-format analytical data for backend processing. Features and matches appear only when returned by the service." action={<Badge tone="blue"><Microscope size={13}/> Mass spectrometry</Badge>}/>
    <div className="msms-overview-grid"><Panel title="Upload MS/MS file" subtitle="Supported formats depend on the configured backend; maximum file size 50 MB.">
      <input ref={inputRef} type="file" accept={allowed.join(',')} className="visually-hidden" onChange={(event) => onFile(event.target.files?.[0])}/>
      <button className={`upload-zone ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFile(event.dataTransfer.files?.[0]); }}><span className="upload-icon"><Upload size={21}/></span><strong>{file ? file.name : 'Choose or drop an MS/MS file'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type || 'file type inferred from extension'}` : '.mzML · .mzXML · .mgf · .msp · .txt · .csv'}</span><small>File is sent to the configured FastAPI endpoint; the browser does not infer spectra.</small></button>
      {error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}
      <div className="upload-actions"><button className="button button-primary" onClick={() => void processFile()} disabled={!file || busy}>{busy ? <><LoaderCircle size={15} className="spin"/> Processing file…</> : <><FileUp size={15}/> Upload & analyze</>}</button>{file && <button className="text-button" onClick={() => onFile(undefined)}>Remove file</button>}</div>
      {analysis?.id && <p className="micro-note">Associated with analysis <code>{analysis.id}</code></p>}
    </Panel><Panel title="Candidate match" subtitle="Observed feature → predicted metabolite; available only if returned by analysis.">{result?.candidate_match ? <RecordList values={Array.isArray(result.candidate_match) ? result.candidate_match : [result.candidate_match]}/> : <EmptyState title="No candidate match available" detail="Mass accuracy, isotope support, retention-time support and MS/MS support will appear only from actual observed data."/>}</Panel></div>
    {result ? <div className="domain-grid"><Panel title="Feature table" subtitle={`${features.length} backend-returned features`} className="wide-domain-panel">{features.length ? <div className="table-wrap"><table><thead><tr>{['Feature', 'm/z', 'Retention time', 'Intensity', 'Isotope pattern', 'MS/MS match', 'Candidate metabolite'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{features.map((entry, index) => { const item = asRecord(entry); return <tr key={String(item?.id ?? index)}>{['feature', 'mz', 'retention_time', 'intensity', 'isotope_pattern', 'msms_match', 'candidate_metabolite'].map((key) => <td key={key}>{display(item?.[key])}</td>)}</tr>; })}</tbody></table></div> : <EmptyState title="No features returned" detail="The backend accepted the file but returned no feature records."/>}</Panel>
        <Panel title="Chromatogram">{chromatogram.length ? <DataChart values={chromatogram} xKey="retention_time" yKey="intensity" label="Chromatogram"/> : <EmptyState title="No chromatogram data" detail="A chromatogram is shown only if the backend returns measured points."/>}</Panel>
        <Panel title="Mass spectrum">{spectrum.length ? <DataChart values={spectrum} xKey="mz" yKey="intensity" label="Mass spectrum"/> : <EmptyState title="No spectrum data" detail="A spectrum is shown only if the backend returns observed fragments."/>}</Panel>
        <Panel title="Processing response"><pre className="json-preview">{JSON.stringify(result, null, 2)}</pre></Panel></div> : <Panel><EmptyState icon="flask" title="No analytical evidence uploaded." detail="Feature tables, chromatograms, spectra and candidate matching stay empty until real file data are processed."/></Panel>}
    <StatusNote kind="warning">Exact mass alone is insufficient for structural confirmation; standard confirmation and orthogonal evidence may be required.</StatusNote>
  </div>;
}

function DataChart({ values, xKey, yKey, label }: { values: unknown[]; xKey: string; yKey: string; label: string }) {
  const preference = localStorage.getItem('xenoevolve.chartPreference') ?? 'balanced';
  const chartHeight = preference === 'compact' ? 175 : preference === 'detailed' ? 265 : 220;
  const tickSize = preference === 'compact' ? 8 : 10;
  const data = values.map(asRecord).filter((item): item is Record<string, unknown> => !!item && typeof item[xKey] === 'number' && typeof item[yKey] === 'number') as unknown as Array<Record<string, number>>;
  return data.length ? <ResponsiveContainer width="100%" height={chartHeight}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="rgba(120,150,170,.14)"/><XAxis dataKey={xKey} tick={{ fill: '#91a6b6', fontSize: tickSize }} tickLine={false}/><YAxis dataKey={yKey} tick={{ fill: '#91a6b6', fontSize: tickSize }} tickLine={false}/><Tooltip contentStyle={{ background: '#0c1925', border: '1px solid rgba(133,171,191,.2)', color: '#eaf3f7', borderRadius: 8 }}/><Line type="monotone" dataKey={yKey} name={label} stroke="#55d9c8" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer> : <EmptyState title={`No ${label.toLowerCase()} points`} detail="The response contained no numeric points for these axes."/>;
}

export function TemporalPage() {
  const { analysis, demoMode, notify, setAnalysis } = useWorkspace();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calculated, setCalculated] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setCalculated(false); setResult(null);
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { setError('Add a header row and at least one observation.'); return; }
    const headers = parseCsvRecord(lines[0]);
    if (!headers) { setError('The CSV header contains invalid quoting. Use one observation per line with balanced quotes.'); return; }
    const required = ['time_point', 'compound', 'abundance'];
    if (required.some((key) => !headers.includes(key))) { setError('Required CSV columns: time_point, compound, abundance. Optional columns: replicate, sample_id.'); return; }
    const rows: Array<Record<string, string | number>> = [];
    for (const [index, line] of lines.slice(1).entries()) {
      const parts = parseCsvRecord(line);
      if (!parts) { setError(`CSV row ${index + 2} contains invalid quoting. Use balanced double quotes and one observation per line.`); return; }
      const row = Object.fromEntries(headers.map((key, i) => [key, parts[i] ?? ''])) as Record<string, string>;
      const abundanceText = row.abundance?.trim() ?? '';
      rows.push({ ...row, time_point: row.time_point ?? '', compound: row.compound ?? '', abundance: abundanceText ? Number(abundanceText) : Number.NaN, _row: index + 2 });
    }
    if (rows.some((row) => typeof row.time_point !== 'string' || !row.time_point || typeof row.compound !== 'string' || !row.compound || typeof row.abundance !== 'number' || !Number.isFinite(row.abundance) || row.abundance < 0)) { setError('Each row needs a time_point, compound and non-negative numeric abundance.'); return; }
    setBusy(true);
    try { const response = await api.analyzeTemporal({ analysis_id: analysis?.id && !demoMode ? analysis.id : undefined, observations: rows }); setResult(response); if (analysis && !demoMode) setAnalysis({ ...analysis, raw: { ...(asRecord(analysis.raw) ?? {}), temporal: response } }, true); setCalculated(true); notify('Temporal response received', 'success', 'Temporal association is not biochemical causation.'); }
    catch (issue) { const message = issue instanceof Error ? issue.message : 'Temporal analysis failed.'; setError(`Temporal evidence unavailable: ${message}`); setResult(null); }
    finally { setBusy(false); }
  };
  const timeSeries = list(result?.time_series ?? result?.series);
  const chartRows = timeSeries.map(asRecord).filter((item): item is Record<string, unknown> => !!item && typeof item.parent_abundance === 'number' && typeof item.product_abundance === 'number');
  return <div className="page-stack">
    {demoMode && <DemoNotice>Demo mode contains no temporal measurements or time-course findings.</DemoNotice>}
    <PageHeading eyebrow="TIME-COURSE SUPPORT" title="Temporal analysis" description="Evaluate parent depletion, product appearance order, association and replicate consistency from supplied observations." action={<Badge tone="blue"><Clock3 size={13}/> Time-series</Badge>}/>
    <div className="temporal-top-grid"><Panel title="Add time-course observations" subtitle="Paste actual measured values as CSV; columns: time_point, compound, abundance; optional replicate, sample_id."><form onSubmit={(event) => void submit(event)}><label className="field-label" htmlFor="temporal-csv">Observation CSV</label><textarea id="temporal-csv" className="csv-input mono" rows={8} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={'time_point,compound,abundance,replicate\nT0,parent,0,1\nT1,"candidate, product",2.5,1'}/><div className="temporal-form-footer"><span className="micro-note">Quote fields that contain commas. Use one observation per line; values must come from your dataset.</span><button className="button button-primary" disabled={busy}>{busy ? <><LoaderCircle size={15} className="spin"/> Analyzing…</> : <><ActivityIcon/> Analyze temporal data</>}</button></div>{error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}</form></Panel><Panel title="Temporal evidence score" subtitle="Returned by the analysis service; association does not prove causation.">{calculated && typeof result?.temporal_evidence_score === 'number' ? <div className="temporal-score"><strong>{result.temporal_evidence_score.toFixed(2)}</strong><span>Temporal Evidence Score</span></div> : <EmptyState title="Temporal evidence unavailable." detail="A score and interpretation appear only after actual observations are processed by the FastAPI service."/>}</Panel></div>
    <Panel title="Parent and product abundance" subtitle="Measured values returned by the temporal analysis service.">{chartRows.length ? <ResponsiveContainer width="100%" height={300}><LineChart data={chartRows}><CartesianGrid strokeDasharray="3 3" stroke="rgba(120,150,170,.14)"/><XAxis dataKey="time_point" tick={{ fill: '#91a6b6', fontSize: 11 }}/><YAxis tick={{ fill: '#91a6b6', fontSize: 11 }}/><Tooltip contentStyle={{ background: '#0c1925', border: '1px solid rgba(133,171,191,.2)', color: '#eaf3f7', borderRadius: 8 }}/><Line type="monotone" dataKey="parent_abundance" name="Parent" stroke="#62a6ed" strokeWidth={2.2}/><Line type="monotone" dataKey="product_abundance" name="Candidate product" stroke="#54d9c8" strokeWidth={2.2}/></LineChart></ResponsiveContainer> : <EmptyState title="No temporal evidence uploaded." detail="Parent depletion and product appearance charts require real time-course measurements; no sample series is fabricated."/>}</Panel>
    {result && <div className="temporal-metrics">{[['Parent depletion evidence', result.parent_depletion_evidence], ['Product appearance order', result.product_appearance_order], ['Parent–product correlation', result.parent_product_correlation], ['Replicate consistency', result.replicate_consistency]].map(([label, item]) => <Panel title={String(label)} key={String(label)}><strong className="returned-value">{display(item)}</strong></Panel>)}</div>}
    <StatusNote kind="warning">Temporal association supports prioritization but does not establish biochemical causation.</StatusNote>
  </div>;
}

function ActivityIcon() { return <ArrowDown size={15}/>; }

export function ContextPage({ kind }: { kind: 'kegg' | 'ncbi' }) {
  const isKegg = kind === 'kegg';
  const { analysis, demoMode, notify } = useWorkspace();
  const [id, setId] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fetchContext = async () => {
    if (!id.trim()) { setError(`Enter a ${isKegg ? 'pathway/reaction' : 'gene/protein/accession'} ID.`); return; }
    setBusy(true); setError(''); setData(null);
    try { const result = isKegg ? await api.keggContext(id.trim()) : await api.ncbiContext(id.trim()); setData(result); notify(`${isKegg ? 'KEGG' : 'NCBI'} context received`, 'success'); }
    catch (issue) { const message = issue instanceof Error ? issue.message : 'Context lookup failed.'; setError(isKegg ? 'KEGG service unavailable. Chemical analysis can continue without KEGG context.' : message); }
    finally { setBusy(false); }
  };
  const actualId = id || analysis?.compound?.name || '';
  const title = isKegg ? 'Biological pathway context' : 'Sequence & organism context';
  const description = isKegg ? 'Explore database-supported reaction and pathway context, not experimental confirmation.' : 'Inspect organism, gene, protein, accession and sequence availability through the FastAPI backend.';
  const resultItems = data ? Object.entries(data).filter(([key]) => !['source_url', 'url', 'sequence'].includes(key)) : [];
  const link = data?.source_url ?? data?.url ?? data?.record_url;
  return <div className="page-stack">
    {demoMode && <DemoNotice>Demo mode contains no KEGG hits, sequence records or biological database findings.</DemoNotice>}
    <PageHeading eyebrow={isKegg ? 'DATABASE-SUPPORTED CONTEXT' : 'BIOLOGICAL SEQUENCE CONTEXT'} title={title} description={description} action={<Badge tone="blue">{isKegg ? 'KEGG' : 'NCBI'} via backend</Badge>}/>
    <div className="context-request-grid"><Panel title={isKegg ? 'Look up pathway or reaction' : 'Look up gene, protein or accession'} subtitle="Requests go through the configured FastAPI service; browser calls to NCBI are not made."><div className="chemical-input-row"><input value={id} onChange={(event) => setId(event.target.value)} placeholder={isKegg ? 'Pathway or reaction ID' : 'Gene, protein or accession'} onKeyDown={(event) => event.key === 'Enter' && void fetchContext()}/><button className="button button-primary" onClick={() => void fetchContext()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <ArrowRight size={15}/>} Look up</button></div>{error && <div className="inline-error"><AlertCircle size={15}/>{error}</div>}{actualId && analysis?.compound && <p className="micro-note">Current analyzed compound: {analysis.compound.name ?? analysis.id}</p>}</Panel>
      <Panel title="Biological interpretation" subtitle="Database context is not an experimental assignment."><div className="context-flow"><div><span>01</span><strong>Predicted reaction</strong></div><ArrowDown size={15}/><div><span>02</span><strong>Possible enzyme class</strong></div><ArrowDown size={15}/><div><span>03</span><strong>{isKegg ? 'KEGG reaction/pathway' : 'Sequence record'}</strong></div></div></Panel></div>
    {data ? <div className="context-result-grid"><Panel title="Returned record" subtitle={`${isKegg ? 'KEGG' : 'NCBI'} response fields`} className="wide-domain-panel">{resultItems.length ? <div className="context-record-list">{resultItems.map(([key, value]) => <div className="context-field" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{display(value)}</strong></div>)}</div> : <EmptyState title="No context fields returned" detail="The endpoint returned an empty record."/>}{typeof link === 'string' && /^https?:\/\//.test(link) && <a className="button button-secondary" href={link} target="_blank" rel="noreferrer">{isKegg ? 'View KEGG record' : 'View NCBI record'} <ArrowRight size={14}/></a>}{!isKegg && typeof data.sequence === 'string' && <details className="sequence-details"><summary>View sequence</summary><pre>{data.sequence}</pre></details>}</Panel><Panel title="Provenance boundary"><StatusNote kind="warning">“Database-supported context” is not experimental confirmation. The service response and source record should be reviewed independently.</StatusNote></Panel></div> : <Panel><EmptyState icon="flask" title={isKegg ? 'KEGG context unavailable' : 'NCBI record unavailable'} detail={isKegg ? 'Chemical analysis can continue without KEGG context. Returned database records will appear here.' : 'NCBI lookup is sent through FastAPI. No sequence, accession or organism information is fabricated.'}/></Panel>}
  </div>;
}
