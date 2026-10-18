
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  LoaderCircle,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../services/api';
import { useWorkspace } from '../state/Workspace';
import {
  Badge,
  EmptyState,
  PageHeading,
  Panel,
  StatusNote,
} from '../components/ui';

const benchmarkMetrics = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'precision', label: 'Precision' },
  { key: 'recall', label: 'Recall' },
  { key: 'f1_score', label: 'F1 score' },
  { key: 'roc_auc', label: 'ROC-AUC' },
  { key: 'top_1', label: 'Top-1' },
  { key: 'top_5', label: 'Top-5' },
  { key: 'top_10', label: 'Top-10' },
  { key: 'mrr', label: 'Mean Reciprocal Rank' },
  { key: 'candidate_reduction', label: 'Candidate reduction' },
  { key: 'pathway_recovery', label: 'Pathway recovery' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'runtime', label: 'Runtime' },
] as const;

const ablations = [
  'Full model (18 features)',
  'Without atom descriptors',
  'Without bond descriptors',
  'Without aromaticity and ring flags',
];

type Result = Record<string, unknown>;

function object(value: unknown): Result | null {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? (value as Result)
    : null;
}

function resultRows(
  value: Result | null,
  keys: readonly string[],
): Array<{ name: string; [key: string]: string | number }> {
  const raw =
    value?.systems ??
    value?.baselines ??
    value?.results ??
    value?.ablations;

  if (!Array.isArray(raw)) return [];

  return raw.flatMap((row, index) => {
    const item = object(row);
    if (!item) return [];

    const name = String(
      item.name ??
      item.system ??
      item.baseline ??
      item.variant ??
      `Result ${index + 1}`,
    );

    const parsed: {
      name: string;
      [key: string]: string | number;
    } = { name };

    keys.forEach((key) => {
      if (
        typeof item[key] === 'number' &&
        Number.isFinite(item[key])
      ) {
        parsed[key] = item[key] as number;
      }
    });

    return [parsed];
  });
}

function formatMetric(key: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  if (key === 'runtime') {
    return value.toFixed(2);
  }

  // Classification metrics are proportions between 0 and 1.
  if (
    [
      'accuracy',
      'precision',
      'recall',
      'f1_score',
      'roc_auc',
      'top_1',
      'top_5',
      'top_10',
      'mrr',
      'candidate_reduction',
      'pathway_recovery',
      'calibration',
    ].includes(key)
  ) {
    return value.toFixed(3);
  }

  return value.toFixed(3);
}

export function BenchmarkPage() {
  const { analysis, demoMode, notify } = useWorkspace();

  const [benchmark, setBenchmark] = useState<Result | null>(null);
  const [ablation, setAblation] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'benchmark' | 'ablation' | null>(null);
  const [error, setError] = useState('');

  const metricRows = useMemo(
    () =>
      resultRows(
        benchmark,
        benchmarkMetrics.map((metric) => metric.key),
      ),
    [benchmark],
  );

  const ablationRows = useMemo(
    () =>
      resultRows(ablation, [
        'feature_count',
        'accuracy',
        'precision',
        'recall',
        'f1_score',
        'roc_auc',
      ]),
    [ablation],
  );

  const run = async (kind: 'benchmark' | 'ablation') => {
    if (!analysis?.id) {
      setError(
        'Run a chemical analysis before requesting benchmark or ablation results.',
      );
      return;
    }

    setError('');
    setBusy(kind);

    try {
      const response =
        kind === 'benchmark'
          ? await api.runBenchmark({ analysis_id: analysis.id })
          : await api.runAblation({ analysis_id: analysis.id });

      if (kind === 'benchmark') {
        setBenchmark(response);
      } else {
        setAblation(response);
      }

      notify(
        `${kind === 'benchmark' ? 'Benchmark' : 'Ablation'} response received`,
        'success',
        'Only backend-returned metrics are displayed.',
      );
    } catch (issue) {
      const message =
        issue instanceof Error
          ? issue.message
          : `${kind} request failed.`;

      setError(message);

      notify(
        `${kind === 'benchmark' ? 'Benchmark' : 'Ablation'} unavailable`,
        'error',
        message,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-stack">
      {demoMode && (
        <div className="demo-notice">
          <span className="demo-dot" />
          <strong>DEMO DATA</strong>
          <span>
            Benchmark and ablation metrics are intentionally absent
            in demo mode.
          </span>
        </div>
      )}

      <PageHeading
        eyebrow="VALIDATION WORKSPACE"
        title="Benchmark & validation"
        description="Evaluate the bond-transformation classifier on held-out reaction data. Only measured metrics are displayed."
        action={
          <Badge tone="neutral">
            No fabricated metrics
          </Badge>
        }
      />

      <Panel
        title="Benchmark evaluation"
        subtitle="Held-out bond-level classification metrics. Ranking and pathway metrics appear only when measured by the backend."
        action={
          <button
            className="button button-primary"
            onClick={() => void run('benchmark')}
            disabled={!analysis || !!busy}
          >
            {busy === 'benchmark' ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Play size={15} />
            )}
            Run benchmark
          </button>
        }
      >
        <div className="baseline-grid">
          <div className="baseline-card baseline-full">
            <span className="baseline-id">01</span>
            <strong>
              Random Forest — held-out bond evaluation
            </strong>
            <p>
              Single measured evaluation on the held-out reaction dataset.
            </p>
            <span className="baseline-state">
              {benchmark
                ? 'Evaluation results loaded'
                : 'Awaiting benchmark execution'}
            </span>
          </div>
        </div>

        {!metricRows.length && (
          <EmptyState
            icon="flask"
            title="Awaiting benchmark execution"
            detail="Run a chemical analysis, then run the benchmark to load measured evaluation results."
          />
        )}

        {metricRows.length > 0 && (
          <div className="benchmark-results">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Evaluation</th>
                    {benchmarkMetrics.map((metric) => (
                      <th key={metric.key}>{metric.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metricRows.map((row) => (
                    <tr key={row.name}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      {benchmarkMetrics.map((metric) => (
                        <td key={metric.key}>
                          {formatMetric(
                            metric.key,
                            row[metric.key],
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={metricRows}
                margin={{ top: 12, right: 16, bottom: 16, left: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,150,170,.14)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#91a6b6', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: '#91a6b6', fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value) =>
                    typeof value === 'number'
                      ? value.toFixed(3)
                      : value
                  }
                  contentStyle={{
                    background: '#0c1925',
                    border: '1px solid rgba(133,171,191,.2)',
                    color: '#eaf3f7',
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="accuracy"
                  name="Accuracy"
                  fill="#a78bfa"
                />
                <Bar
                  dataKey="precision"
                  name="Precision"
                  fill="#54d9c8"
                />
                <Bar
                  dataKey="recall"
                  name="Recall"
                  fill="#5799e2"
                />
                <Bar
                  dataKey="f1_score"
                  name="F1 score"
                  fill="#f0b35a"
                />
                <Bar
                  dataKey="roc_auc"
                  name="ROC-AUC"
                  fill="#e879a9"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {error && (
          <div className="inline-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
      </Panel>

      <Panel
        title="Ablation study"
        subtitle="Measured bond-feature experiments on held-out reaction data."
        action={
          <button
            className="button button-secondary"
            onClick={() => void run('ablation')}
            disabled={!analysis || !!busy}
          >
            {busy === 'ablation' ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Run ablation
          </button>
        }
      >
        <div className="ablation-grid">
          {ablations.map((item, index) => (
            <div
              className={`ablation-item ${
                index === 0 ? 'ablation-full' : ''
              }`}
              key={item}
            >
              <span>
                {index === 0
                  ? 'REFERENCE MODEL'
                  : `FEATURE TEST 0${index}`}
              </span>
              <strong>{item}</strong>
              <small>
                {index === 0
                  ? 'All 18 molecular bond features'
                  : 'Evaluated on held-out reaction data'}
              </small>
            </div>
          ))}
        </div>

        {!ablationRows.length ? (
          <EmptyState
            title="No ablation results available"
            detail="Run the ablation evaluation to load measured accuracy, precision, recall, F1 score and ROC-AUC."
          />
        ) : (
          <div className="ablation-results">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Experiment</th>
                    <th>Features</th>
                    <th>Accuracy</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1 score</th>
                    <th>ROC-AUC</th>
                  </tr>
                </thead>
                <tbody>
                  {ablationRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      {[
                        'feature_count',
                        'accuracy',
                        'precision',
                        'recall',
                        'f1_score',
                        'roc_auc',
                      ].map((key) => (
                        <td key={key}>
                          {typeof row[key] === 'number'
                            ? key === 'feature_count'
                              ? row[key]
                              : `${(
                                  (row[key] as number) * 100
                                ).toFixed(2)}%`
                            : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={ablationRows}
                margin={{ top: 12, right: 16, bottom: 45, left: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,150,170,.14)"
                />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={70}
                  tick={{ fill: '#91a6b6', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(value) =>
                    `${(value * 100).toFixed(0)}%`
                  }
                  tick={{ fill: '#91a6b6', fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value) =>
                    typeof value === 'number'
                      ? `${(value * 100).toFixed(2)}%`
                      : value
                  }
                  contentStyle={{
                    background: '#0c1925',
                    border: '1px solid rgba(133,171,191,.2)',
                    color: '#eaf3f7',
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="accuracy"
                  name="Accuracy"
                  fill="#54d9c8"
                />
                <Bar
                  dataKey="f1_score"
                  name="F1 score"
                  fill="#5799e2"
                />
                <Bar
                  dataKey="roc_auc"
                  name="ROC-AUC"
                  fill="#a78bfa"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {error && (
          <div className="inline-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
      </Panel>

      {!analysis && (
        <StatusNote kind="info">
          No analysis is loaded. Run a chemical analysis before requesting
          benchmark or ablation results.
        </StatusNote>
      )}
    </div>
  );
}
