import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useWorkspace } from '../state/Workspace';

export function ToastViewport() {
  const { toasts, dismissToast } = useWorkspace();
  return <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">{toasts.map((item) => {
    const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? AlertCircle : Info;
    return <div className={`toast toast-${item.kind}`} key={item.id} role={item.kind === 'error' ? 'alert' : 'status'}><Icon size={18}/><div><strong>{item.title}</strong>{item.message && <p>{item.message}</p>}</div><button className="icon-button" onClick={() => dismissToast(item.id)} aria-label="Dismiss notification"><X size={15}/></button></div>;
  })}</div>;
}
