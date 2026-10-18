import {
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import {
  FlaskConical,
  GitBranch,
  Minus,
  Plus,
  RotateCcw,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from 'lucide-react';

import type { GraphEdge, GraphNode } from '../models';
import { ConfidenceBadge, EmptyState } from './ui';

type Point = {
  x: number;
  y: number;
};

/*
 * Some backend versions may return additional graph metadata
 * that is not yet included in the GraphNode TypeScript interface.
 *
 * These optional fields are read defensively.
 * We NEVER invent chemical structures.
 */
type ExtendedGraphNode = GraphNode & {
  smiles?: string;
  canonical_smiles?: string;
  structure?: string;
  molecular_formula?: string;
  molecular_weight?: number;
  molecularWeight?: number;
};

function getFormula(node: ExtendedGraphNode): string | undefined {
  return (
    node.formula ??
    node.molecular_formula ??
    undefined
  );
}

function getSmiles(node: ExtendedGraphNode): string | undefined {
  return (
    node.smiles ??
    node.canonical_smiles ??
    undefined
  );
}

function getMolecularWeight(
  node: ExtendedGraphNode,
): number | undefined {
  if (typeof node.molecular_weight === 'number') {
    return node.molecular_weight;
  }

  if (typeof node.molecularWeight === 'number') {
    return node.molecularWeight;
  }

  return undefined;
}

function getNodeSubtitle(node: ExtendedGraphNode): string {
  const formula = getFormula(node);
  const smiles = getSmiles(node);

  if (formula) {
    return formula;
  }

  if (smiles) {
    return smiles.length > 22
      ? `${smiles.slice(0, 22)}…`
      : smiles;
  }

  if (node.mz !== undefined) {
    return `m/z ${node.mz}`;
  }

  if (typeof node.score === 'number') {
    return `Score ${node.score.toFixed(2)}`;
  }

  return 'Metadata unavailable';
}

export function GraphView({
  nodes,
  edges,
  demo = false,
  height = 470,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  demo?: boolean;
  height?: number;
}) {
  const [scale, setScale] = useState(1);

  const [offset, setOffset] = useState<Point>({
    x: 0,
    y: 0,
  });

  const [selectedNode, setSelectedNode] =
    useState<string | null>(null);

  const [selectedEdge, setSelectedEdge] =
    useState<string | null>(null);

  const [collapsed, setCollapsed] = useState(false);

  const [highlight, setHighlight] = useState(false);

  const [inspectorOpen, setInspectorOpen] = useState(true);

  const [dragging, setDragging] = useState(false);

  const [dragOrigin, setDragOrigin] = useState<Point>({
    x: 0,
    y: 0,
  });

  /*
   * Arrange graph nodes by backend-provided level.
   *
   * If level is unavailable, fall back to groups of three.
   */
  const positioned = useMemo(() => {
    const levels = new Map<number, GraphNode[]>();

    nodes.forEach((node, index) => {
      const level = Math.max(
        0,
        node.level ?? Math.floor(index / 3),
      );

      levels.set(level, [
        ...(levels.get(level) ?? []),
        node,
      ]);
    });

    const map = new Map<string, Point>();

    const ordered = [...levels.entries()].sort(
      ([a], [b]) => a - b,
    );

    /*
     * Radial layout is kept compatible with the
     * existing project setting.
     */
    let radial = false;

    try {
      radial =
        typeof window !== 'undefined' &&
        localStorage.getItem(
          'xenoevolve.graphLayout',
        ) === 'radial';
    } catch {
      radial = false;
    }

    if (radial) {
      ordered.forEach(([, items], levelIndex) => {
        items.forEach((node, index) => {
          const radius =
            levelIndex === 0 && ordered.length > 1
              ? 0
              : Math.min(
                  315,
                  105 + levelIndex * 105,
                );

          const angle =
            -Math.PI / 2 +
            (2 * Math.PI * index) /
              Math.max(items.length, 1);

          map.set(node.id, {
            x:
              450 +
              Math.cos(angle) * radius,

            y:
              250 +
              Math.sin(angle) *
                radius *
                0.72,
          });
        });
      });
    } else {
      ordered.forEach(([level, items]) => {
        items.forEach((node, index) => {
          map.set(node.id, {
            x: 90 + level * 235,

            y:
              105 +
              index *
                (Math.min(
                  280,
                  350 /
                    Math.max(
                      items.length,
                      1,
                    ),
                )),
          });
        });
      });
    }

    return map;
  }, [nodes]);

  /*
   * Collapse only hides deeper pathway levels.
   * It does not modify backend data.
   */
  const visibleNodes = collapsed
    ? nodes.filter(
        (node) => (node.level ?? 0) <= 1,
      )
    : nodes;

  const visibleIds = new Set(
    visibleNodes.map((node) => node.id),
  );

  const selected = nodes.find(
    (node) => node.id === selectedNode,
  );

  const edge = edges.find(
    (item) => item.id === selectedEdge,
  );

  /*
   * Highlight all connected edges when a node
   * or edge is selected.
   */
  const highlightedEdges = useMemo(() => {
    if (!highlight) {
      return new Set<string>();
    }

    const selectedEdgeRecord = edges.find(
      (item) => item.id === selectedEdge,
    );

    const queue = selectedNode
      ? [selectedNode]
      : selectedEdgeRecord
        ? [
            selectedEdgeRecord.source,
            selectedEdgeRecord.target,
          ]
        : [];

    const visited = new Set(queue);

    const connected = new Set<string>();

    for (
      let index = 0;
      index < queue.length;
      index += 1
    ) {
      const nodeId = queue[index];

      edges.forEach((item) => {
        if (
          item.source === nodeId ||
          item.target === nodeId
        ) {
          connected.add(item.id);

          const neighbor =
            item.source === nodeId
              ? item.target
              : item.source;

          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      });
    }

    return connected;
  }, [
    edges,
    highlight,
    selectedEdge,
    selectedNode,
  ]);

  const nodeCount = visibleNodes.length;

  const reset = () => {
    setScale(1);

    setOffset({
      x: 0,
      y: 0,
    });

    setSelectedNode(null);
    setSelectedEdge(null);

    setCollapsed(false);
    setHighlight(false);

    setInspectorOpen(true);
    setDragging(false);
  };

  const activateWithKeyboard = (
    event: KeyboardEvent<SVGGElement>,
    activate: () => void,
  ) => {
    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      activate();
    }
  };

  const onPointerDown = (
    event: PointerEvent<SVGSVGElement>,
  ) => {
    const target = event.target as HTMLElement;

    if (
      target.closest(
        '[data-node], [data-edge]',
      )
    ) {
      return;
    }

    setDragging(true);

    setDragOrigin({
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
    });

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  };

  const onPointerMove = (
    event: PointerEvent<SVGSVGElement>,
  ) => {
    if (!dragging) {
      return;
    }

    setOffset({
      x: event.clientX - dragOrigin.x,
      y: event.clientY - dragOrigin.y,
    });
  };

  return (
    <div
      className={`graph-workspace ${
        inspectorOpen
          ? ''
          : 'inspector-closed'
      }`}
    >
      <div className="graph-area">

        {/* =========================
            GRAPH TOOLBAR
           ========================= */}

        <div className="graph-toolbar">
          <div className="graph-toolbar-left">
            <span className="graph-mode">
              <span className="pulse-dot" />

              {demo
                ? 'Illustrative graph'
                : 'Analysis graph'}
            </span>

            <span className="graph-count">
              {nodeCount} node
              {nodeCount === 1
                ? ''
                : 's'}
              {' · '}
              {edges.length} edge
              {edges.length === 1
                ? ''
                : 's'}
            </span>
          </div>

          <div className="graph-controls">

            <button
              className={`tool-button ${
                highlight
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                setHighlight(
                  (value) => !value,
                )
              }
              disabled={
                !selectedNode &&
                !selectedEdge
              }
              aria-pressed={highlight}
              title="Select a node or edge before highlighting its connected pathway"
            >
              <Sparkles size={15} />
              <span>
                Highlight
              </span>
            </button>

            <button
              className="tool-button"
              onClick={() =>
                setCollapsed(
                  (value) => !value,
                )
              }
              title={
                collapsed
                  ? 'Expand graph'
                  : 'Collapse graph'
              }
            >
              {collapsed ? (
                <PanelRightOpen
                  size={15}
                />
              ) : (
                <PanelRightClose
                  size={15}
                />
              )}

              <span>
                {collapsed
                  ? 'Expand'
                  : 'Collapse'}
              </span>
            </button>

            <span className="tool-separator" />

            <button
              className="icon-button graph-icon"
              onClick={() =>
                setScale(
                  (value) =>
                    Math.max(
                      0.55,
                      value - 0.15,
                    ),
                )
              }
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus size={16} />
            </button>

            <span className="zoom-label">
              {Math.round(
                scale * 100,
              )}
              %
            </span>

            <button
              className="icon-button graph-icon"
              onClick={() =>
                setScale(
                  (value) =>
                    Math.min(
                      1.9,
                      value + 0.15,
                    ),
                )
              }
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus size={16} />
            </button>

            <button
              className="icon-button graph-icon"
              onClick={reset}
              title="Reset graph"
              aria-label="Reset graph"
            >
              <RotateCcw size={15} />
            </button>

            <button
              className="icon-button graph-icon inspector-toggle"
              onClick={() =>
                setInspectorOpen(
                  (value) => !value,
                )
              }
              title="Toggle evidence inspector"
              aria-label="Toggle evidence inspector"
            >
              <PanelRightOpen
                size={15}
              />
            </button>
          </div>
        </div>

        {/* =========================
            EMPTY GRAPH
           ========================= */}

        {!nodes.length ? (
          <div className="graph-empty">
            <EmptyState
              icon="flask"
              title="No transformation graph yet"
              detail="Run a chemical analysis to request a graph from the configured FastAPI backend. No candidate structures or pathways are fabricated."
            />
          </div>
        ) : (
          <svg
            className="graph-svg"
            viewBox="0 0 900 500"
            style={{ height }}
            onPointerDown={
              onPointerDown
            }
            onPointerMove={
              onPointerMove
            }
            onPointerUp={() =>
              setDragging(false)
            }
            onPointerCancel={() =>
              setDragging(false)
            }
            aria-label="Interactive transformation pathway graph"
          >
            <defs>

              <pattern
                id="graphGrid"
                width="28"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M28 0H0V28"
                  fill="none"
                  stroke="rgba(112,152,175,.075)"
                  strokeWidth=".6"
                />
              </pattern>

              <marker
                id="arrowHead"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path
                  d="M0 0 8 4 0 8Z"
                  fill="#4f7884"
                />
              </marker>

            </defs>

            <rect
              width="900"
              height="500"
              fill="url(#graphGrid)"
            />

            <g
              transform={`translate(${offset.x} ${offset.y}) translate(450 250) scale(${scale}) translate(-450 -250)`}
            >

              {/* =========================
                  EDGES
                 ========================= */}

              {edges.map((item) => {
                if (
                  !visibleIds.has(
                    item.source,
                  ) ||
                  !visibleIds.has(
                    item.target,
                  )
                ) {
                  return null;
                }

                const start =
                  positioned.get(
                    item.source,
                  );

                const end =
                  positioned.get(
                    item.target,
                  );

                if (!start || !end) {
                  return null;
                }

                const active =
                  selectedEdge ===
                    item.id ||
                  selectedNode ===
                    item.source ||
                  selectedNode ===
                    item.target ||
                  highlightedEdges.has(
                    item.id,
                  );

                const selectEdge =
                  () => {
                    setSelectedEdge(
                      item.id,
                    );

                    setSelectedNode(
                      null,
                    );
                  };

                const path = `M${
                  start.x + 70
                } ${
                  start.y + 19
                } C${
                  start.x + 135
                } ${
                  start.y + 19
                }, ${
                  end.x - 70
                } ${
                  end.y + 19
                }, ${
                  end.x
                } ${
                  end.y + 19
                }`;

                return (
                  <g
                    key={item.id}
                    data-edge="true"
                    className={`graph-edge-group ${
                      active
                        ? 'edge-highlight'
                        : ''
                    }`}
                    onClick={(
                      event,
                    ) => {
                      event.stopPropagation();
                      selectEdge();
                    }}
                    onKeyDown={(
                      event,
                    ) =>
                      activateWithKeyboard(
                        event,
                        selectEdge,
                      )
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${
                      item.reaction_type ??
                      'Transformation'
                    } edge`}
                  >
                    <path
                      className="graph-edge-hit"
                      d={path}
                    />

                    <path
                      className="graph-edge-line"
                      d={path}
                      markerEnd="url(#arrowHead)"
                    />

                    <text
                      className="graph-edge-label"
                      x={
                        (start.x +
                          end.x) /
                        2
                      }
                      y={
                        (start.y +
                          end.y) /
                          2 -
                        6
                      }
                    >
                      {item.reaction_type ??
                        'Transformation'}
                    </text>
                  </g>
                );
              })}

              {/* =========================
                  NODES
                 ========================= */}

              {visibleNodes.map(
                (rawNode) => {
                  const node =
                    rawNode as ExtendedGraphNode;

                  const point =
                    positioned.get(
                      node.id,
                    ) ?? {
                      x: 60,
                      y: 70,
                    };

                  const active =
                    selectedNode ===
                    node.id;

                  const selectNode =
                    () => {
                      setSelectedNode(
                        node.id,
                      );

                      setSelectedEdge(
                        null,
                      );
                    };

                  const subtitle =
                    getNodeSubtitle(
                      node,
                    );

                  const confidence =
                    String(
                      node.confidence ??
                        'UNKNOWN',
                    )
                      .toLowerCase()
                      .replaceAll(
                        ' ',
                        '-',
                      );

                  return (
                    <g
                      key={node.id}
                      data-node="true"
                      className={`graph-node ${
                        active
                          ? 'node-selected'
                          : ''
                      }`}
                      transform={`translate(${point.x},${point.y})`}
                      onClick={(
                        event,
                      ) => {
                        event.stopPropagation();
                        selectNode();
                      }}
                      onKeyDown={(
                        event,
                      ) =>
                        activateWithKeyboard(
                          event,
                          selectNode,
                        )
                      }
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${
                        node.compound_name ??
                        'candidate node'
                      }`}
                    >
                      <rect
                        width="142"
                        height="40"
                        rx="10"
                        className="graph-node-card"
                      />

                      <circle
                        cx="14"
                        cy="20"
                        r="4"
                        className={`graph-node-dot conf-${confidence}`}
                      />

                      <text
                        x="25"
                        y="17"
                        className="graph-node-title"
                      >
                        {node.compound_name ??
                          'Candidate'}
                      </text>

                      <text
                        x="25"
                        y="30"
                        className="graph-node-sub"
                      >
                        {subtitle}
                      </text>
                    </g>
                  );
                },
              )}

            </g>
          </svg>
        )}

        {/* =========================
            LEGEND
           ========================= */}

        <div className="graph-legend">
          <span>
            <i className="legend-dot high" />
            High confidence
          </span>

          <span>
            <i className="legend-dot moderate" />
            Moderate
          </span>

          <span>
            <i className="legend-dot low" />
            Low
          </span>

          <span>
            <i className="legend-dot unknown" />
            Unknown / unavailable
          </span>
        </div>
      </div>

      {/* =========================
          EVIDENCE INSPECTOR
         ========================= */}

      {inspectorOpen && (
        <aside className="graph-inspector">

          <div className="inspector-title">
            <div>
              <span className="eyebrow">
                EVIDENCE INSPECTOR
              </span>

              <h3>
                {selected
                  ? 'Selected node'
                  : edge
                    ? 'Selected edge'
                    : 'Pathway context'}
              </h3>
            </div>

            <button
              className="icon-button graph-icon"
              onClick={() =>
                setInspectorOpen(
                  false,
                )
              }
              aria-label="Close inspector"
            >
              <PanelRightClose
                size={15}
              />
            </button>
          </div>

          {/* =========================
              SELECTED NODE
             ========================= */}

          {selected ? (
            (() => {
              const node =
                selected as ExtendedGraphNode;

              const formula =
                getFormula(node);

              const smiles =
                getSmiles(node);

              const molecularWeight =
                getMolecularWeight(
                  node,
                );

              return (
                <>
                  <div className="selected-compound">
                    <div className="compound-symbol">
                      <FlaskConical
                        size={20}
                      />
                    </div>

                    <div>
                      <strong>
                        {node.compound_name ??
                          'Candidate'}
                      </strong>

                      <span>
                        {formula ??
                          (smiles
                            ? 'SMILES available'
                            : 'Formula unavailable')}
                      </span>
                    </div>
                  </div>

                  <div className="inspector-list">

                    <InspectorRow
                      label="Formula"
                      value={formula}
                    />

                    <InspectorRow
                      label="SMILES"
                      value={smiles}
                    />

                    <InspectorRow
                      label="Molecular weight"
                      value={
                        typeof molecularWeight ===
                        'number'
                          ? molecularWeight.toFixed(
                              2,
                            )
                          : undefined
                      }
                    />

                    <InspectorRow
                      label="m/z"
                      value={
                        node.mz !==
                        undefined
                          ? node.mz.toString()
                          : undefined
                      }
                    />

                    <InspectorRow
                      label="Node score"
                      value={
                        typeof node.score ===
                        'number'
                          ? node.score.toFixed(
                              2,
                            )
                          : undefined
                      }
                    />

                    <div className="inspector-item">
                      <span>
                        Confidence
                      </span>

                      <ConfidenceBadge
                        value={
                          node.confidence
                        }
                      />
                    </div>

                  </div>

                  <p className="inspector-caveat">
                    Only metadata returned by
                    the analysis service is shown.
                    Missing values are not inferred
                    or fabricated.
                  </p>
                </>
              );
            })()
          ) : edge ? (

            /* =========================
               SELECTED EDGE
               ========================= */

            <>
              <div className="selected-compound">
                <div className="compound-symbol">
                  <GitBranch
                    size={20}
                  />
                </div>

                <div>
                  <strong>
                    {edge.reaction_type ??
                      'Transformation edge'}
                  </strong>

                  <span>
                    {edge.source}
                    {' → '}
                    {edge.target}
                  </span>
                </div>
              </div>

              <div className="inspector-list">

                <InspectorRow
                  label="Enzyme class"
                  value={
                    edge.enzyme_class
                  }
                />

                <InspectorRow
                  label="Predicted probability"
                  value={
                    typeof edge.predicted_probability ===
                    'number'
                      ? edge.predicted_probability.toFixed(2)
                      : typeof edge.edge_score ===
                        'number'
                        ? edge.edge_score.toFixed(2)
                        : undefined
                  }
                />

                <InspectorRow
                  label="Bond type"
                  value={edge.bond_type}
                />

                <InspectorRow
                  label="Transformation"
                  value={edge.transformation}
                />

                <InspectorRow
                  label="Atoms"
                  value={
                    edge.source_element &&
                    edge.target_element
                      ? `${edge.source_element} → ${edge.target_element}`
                      : undefined
                  }
                />

                <InspectorRow
                  label="Supporting evidence"
                  value={
                    edge.supporting_evidence?.join(
                      ', ',
                    )
                  }
                />

              </div>

              <p className="inspector-caveat">
                An enzyme-family annotation does
                not establish a specific enzyme
                reaction.
              </p>
            </>

          ) : (

            /* =========================
               NOTHING SELECTED
               ========================= */

            <EmptyState
              title={
                nodes.length
                  ? 'Select a node or edge'
                  : 'Awaiting analysis data'
              }
              detail={
                nodes.length
                  ? 'Choose a graph element to inspect its metadata and available evidence.'
                  : 'The graph displays only pathways returned by the FastAPI service.'
              }
            />

          )}
        </aside>
      )}
    </div>
  );
}

/* =========================
   INSPECTOR ROW
   ========================= */

function InspectorRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="inspector-item">
      <span>
        {label}
      </span>

      <strong>
        {value ?? 'Unavailable'}
      </strong>
    </div>
  );
}