import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { AnalysisResult, ApiHealth } from '../models';
import { api } from '../services/api';
import { demoAnalysis } from '../demo';

const HISTORY_KEY = 'xenoevolve.analysisHistory';
type Toast = { id: number; title: string; message?: string; kind: 'success' | 'error' | 'info' };
type WorkspaceValue = {
  analysis: AnalysisResult | null;
  history: AnalysisResult[];
  demoMode: boolean;
  health: ApiHealth;
  toasts: Toast[];
  setAnalysis: (value: AnalysisResult | null, save?: boolean) => void;
  setDemoMode: (value: boolean) => void;
  refreshHealth: () => Promise<void>;
  notify: (title: string, kind?: Toast['kind'], message?: string) => void;
  dismissToast: (id: number) => void;
  deleteHistory: (id: string) => void;
  openHistory: (value: AnalysisResult) => void;
  refreshHistory: () => Promise<{ success: boolean; message?: string }>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function readHistory(): AnalysisResult[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string') : [];
  } catch { return []; }
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [history, setHistory] = useState<AnalysisResult[]>(readHistory);
  const [analysis, setAnalysisState] = useState<AnalysisResult | null>(() => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(HISTORY_KEY) ?? '[]'
    );

    if (Array.isArray(saved) && saved.length > 0) {
      return saved[0] as AnalysisResult;
    }

    return null;
  } catch {
    return null;
  }
});
  const [demoMode, setDemoModeState] = useState(false);
  const [health, setHealth] = useState<ApiHealth>({ connected: false, rdkit: null, message: 'Backend availability has not been verified.' });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refreshHealth = useCallback(async () => {
    setHealth((current) => ({ ...current, message: 'Checking backend…' }));
    try {
      const result = await api.health();
      setHealth(result);
    } catch (error) {
      setHealth({ connected: false, checkedAt: new Date().toISOString(), rdkit: null, message: error instanceof Error ? error.message : 'Backend unavailable.' });
    }
  }, []);

  const refreshHistory = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const remote = await api.analysisHistory();
      if (!Array.isArray(remote.analyses)) return { success: false, message: 'Backend history response did not contain an analyses list.' };
      const validRemote = remote.analyses.filter((item) => item && typeof item.id === 'string');
      setHistory((current) => {
        const merged = new Map(validRemote.map((item) => [item.id, item]));
        current.forEach((item) => { if (!merged.has(item.id)) merged.set(item.id, item); });
        return [...merged.values()];
      });
      return { success: true };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Backend history could not be refreshed.' };
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const notify = useCallback((title: string, kind: Toast['kind'] = 'info', message?: string) => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, title, kind, message }].slice(-4));
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5200);
  }, []);

  const setAnalysis = useCallback((value: AnalysisResult | null, save = false) => {
    setAnalysisState(value);
    setDemoModeState(false);
    if (value && save) setHistory((items) => [value, ...items.filter((item) => item.id !== value.id)].slice(0, 100));
  }, []);

  const setDemoMode = useCallback((value: boolean) => {
    setDemoModeState(value);
    setAnalysisState(value ? demoAnalysis : null);
  }, []);

  const value = useMemo<WorkspaceValue>(() => ({
    analysis, history, demoMode, health, toasts, setAnalysis, setDemoMode, refreshHealth, notify,
    dismissToast: (id) => setToasts((items) => items.filter((item) => item.id !== id)),
    deleteHistory: (id) => setHistory((items) => items.filter((item) => item.id !== id)),
    openHistory: (item) => { setAnalysisState(item); setDemoModeState(false); },
    refreshHistory,
  }), [analysis, history, demoMode, health, toasts, setAnalysis, setDemoMode, refreshHealth, notify, refreshHistory]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return value;
}
