import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, CircleHelp, FlaskConical, Info, LoaderCircle } from 'lucide-react';
import type { Confidence, ServiceState } from '../models';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function Panel({ children, className = '', title, subtitle, action }: { children: ReactNode; className?: string; title?: string; subtitle?: string; action?: ReactNode }) {
  return <section className={`panel ${className}`}>
    {(title || subtitle || action) && <header className="panel-heading"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
    {children}
  </section>;
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'teal' | 'green' | 'amber' | 'red' | 'blue'; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function ConfidenceBadge({ value }: { value?: Confidence | string | null }) {
  const normalized = value?.toUpperCase() ?? 'UNKNOWN';
  const tone = normalized === 'CONFIRMED' ? 'green' : normalized === 'PUTATIVE' ? 'teal' : normalized === 'TENTATIVE' ? 'amber' : normalized === 'LOW CONFIDENCE' ? 'red' : 'neutral';
  return <Badge tone={tone} title="Confidence reflects available evidence. CONFIRMED requires appropriate experimental or reference-standard support.">{normalized}</Badge>;
}

export function EvidenceBar({ label, value, explanation, demo = false }: { label: string; value?: number | null; explanation: string; demo?: boolean }) {
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  const bounded = valid ? Math.max(0, Math.min(1, value)) : 0;
  return <div className="evidence-row">
    <div className="evidence-row-top"><span title={explanation}>{label} <Info size={13} className="inline-info" aria-label={explanation} /></span><strong title={explanation}>{valid ? bounded.toFixed(2) : '—'}{demo && <small> DEMO</small>}</strong></div>
    <div className="evidence-track" role="meter" aria-label={`${label} score`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={valid ? bounded : 0} title={explanation}><span style={{ width: `${valid ? bounded * 100 : 0}%` }} /></div>
    {!valid && <div className="micro-note">Evidence unavailable</div>}
  </div>;
}

export function EmptyState({ title, detail, icon = 'info', action }: { title: string; detail: string; icon?: 'info' | 'alert' | 'flask' | 'loader'; action?: ReactNode }) {
  const Icon = icon === 'alert' ? AlertCircle : icon === 'flask' ? FlaskConical : icon === 'loader' ? LoaderCircle : CircleHelp;
  return <div className="empty-state"><span className={`empty-state-icon ${icon === 'loader' ? 'spin' : ''}`}><Icon size={19} /></span><div><strong>{title}</strong><p>{detail}</p>{action && <div className="empty-action">{action}</div>}</div></div>;
}

export function ServiceBadge({ name, state, detail }: { name: string; state: ServiceState; detail?: string }) {
  const label = state === 'available' ? 'Connected' : state === 'unavailable' ? 'Unavailable' : state === 'checking' ? 'Checking' : 'Not verified';
  return <span className={`service-badge service-${state}`} title={detail || `${name}: ${label}`}><i />{name}<b>{label}</b></span>;
}

export function DemoNotice({ children = 'Illustrative only — not a live analysis, measurement or experimental result.' }: { children?: ReactNode }) {
  return <div className="demo-notice"><span className="demo-dot" /> <strong>DEMO DATA</strong><span>{children}</span></div>;
}

export function MetricCard({ label, value, detail, icon, tone = 'teal', tooltip }: { label: string; value: string; detail?: string; icon?: ReactNode; tone?: 'teal' | 'blue' | 'amber' | 'green'; tooltip?: string }) {
  return <div className={`metric-card metric-${tone}`} title={tooltip}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon ?? <FlaskConical size={17} />}</span></div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function StatusNote({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warning' | 'error' | 'success' }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertCircle : Info;
  return <div className={`status-note status-${kind}`}><Icon size={16} /> <span>{children}</span></div>;
}
