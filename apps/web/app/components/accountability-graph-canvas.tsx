"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import type { AccountabilityForceGraphHandle, AccountabilityForceGraphProps } from "./accountability-force-graph";
import type { AccountabilityGraph, AccountabilityGraphLink, AccountabilityGraphNode } from "../lib/accountability-graph";

const ForceGraph = dynamic(
  () => import("./accountability-force-graph").then((module) => module.AccountabilityForceGraph),
  {
    ssr: false,
    loading: () => <div className="accountability-graph-loading">Warming up WebGL graph…</div>,
  },
) as ComponentType<AccountabilityForceGraphProps>;

type AccountabilityGraphCanvasProps = {
  graph: AccountabilityGraph;
  selectedNodeId: string | null;
  resetSignal: number;
  unpinSelectedSignal: number;
  unpinAllSignal: number;
  onPinnedNodeIdsChange: (nodeIds: string[]) => void;
  onNodeSelect: (node: AccountabilityGraphNode, anchor: GraphNodeScreenPosition | null) => void;
  onNodeHover: (node: AccountabilityGraphNode | null) => void;
  onBackgroundClick: () => void;
  onSelectionAnchorChange: (position: GraphNodeScreenPosition | null) => void;
};

export type GraphNodeScreenPosition = {
  nodeId: string;
  x: number;
  y: number;
  visible: boolean;
  viewportWidth: number;
  viewportHeight: number;
};

type HighlightState = { nodeIds: Set<string>; linkIds: Set<string> } | null;
type PositionedGraphNode = AccountabilityGraphNode & {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};
type PinnedPosition = { x: number; y: number; z: number };
type GraphControls = {
  target?: { x: number; y: number; z: number };
  enableDamping?: boolean;
  dampingFactor?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  update?: () => void;
  _onPointerUp?: (event: PointerEvent) => void;
  _pointerPositions?: Record<string, PointerPosition | undefined>;
  _pointers?: number[];
  __accountabilityPointerGuard?: boolean;
};
type PointerPosition = {
  x: number;
  y: number;
  set: (x: number, y: number) => PointerPosition;
};

function endpointId(endpoint: unknown) {
  if (typeof endpoint === "string" || typeof endpoint === "number") {
    return String(endpoint);
  }
  if (endpoint && typeof endpoint === "object" && "id" in endpoint) {
    const id = endpoint.id;
    return typeof id === "string" || typeof id === "number" ? String(id) : "";
  }
  return "";
}

function nodeColor(node: AccountabilityGraphNode, selectedNodeId: string | null, highlight: HighlightState) {
  if (highlight && !highlight.nodeIds.has(node.id)) {
    return node.nodeType === "assertion" ? "#23262f" : "#2d3340";
  }
  if (node.id === selectedNodeId) {
    return "#ffffff";
  }
  if (node.nodeType === "assertion") {
    if (node.reviewStatus === "needs_review") {
      return node.kind === "action" ? "#ffba0d" : "#58d68d";
    }
    return node.kind === "action" ? "#8b6d22" : "#2f7d50";
  }
  if (!node.resolved) {
    return "#ff6b7a";
  }
  if (node.role === "owner") {
    return node.pendingCount > 0 ? "#7c5cff" : "#7dd3fc";
  }
  return node.role === "associated" ? "#c084fc" : "#64748b";
}

function nodeValue(node: AccountabilityGraphNode) {
  if (node.nodeType === "assertion") {
    return node.kind === "action" ? 4.8 : 5.4;
  }
  return 5.5 + Math.sqrt(Math.max(1, node.actionCount + node.decisionCount + node.pendingCount)) * 3;
}

function linkColor(link: AccountabilityGraphLink, highlight: HighlightState) {
  if (highlight && !highlight.linkIds.has(link.id)) {
    return "rgba(84, 92, 112, 0.12)";
  }
  if (link.type === "assigned_action") {
    return highlight ? "rgba(255, 216, 112, 0.96)" : "rgba(255, 186, 13, 0.72)";
  }
  if (link.type === "owns_decision") {
    return highlight ? "rgba(145, 245, 185, 0.96)" : "rgba(88, 214, 141, 0.72)";
  }
  if (link.type === "associated_identity") {
    return highlight ? "rgba(216, 180, 254, 0.92)" : "rgba(192, 132, 252, 0.55)";
  }
  if (link.type === "same_meeting") {
    return highlight ? "rgba(203, 213, 225, 0.58)" : "rgba(148, 163, 184, 0.24)";
  }
  return highlight ? "rgba(125, 211, 252, 0.76)" : "rgba(125, 211, 252, 0.34)";
}

function linkWidth(link: AccountabilityGraphLink, highlight: HighlightState) {
  if (highlight && !highlight.linkIds.has(link.id)) {
    return 0.28;
  }
  const base = link.type === "assigned_action" || link.type === "owns_decision" ? 1.45 : Math.min(2.2, 0.55 + link.weight * 0.25);
  return highlight ? base + 1.15 : base;
}

function nodeLabel(node: AccountabilityGraphNode) {
  if (node.nodeType === "person") {
    const total = node.actionCount + node.decisionCount;
    return `${node.displayName}\n${total} owned · ${node.pendingCount} pending${node.email ? `\n${node.email}` : ""}`;
  }
  return `${node.kind === "action" ? "Action" : "Decision"}: ${node.summary}\n${node.meetingTitle}\n${node.reviewStatus === "needs_review" ? "Needs review" : "Accepted"}`;
}

function linkLabel(link: AccountabilityGraphLink) {
  return `${link.label}\n${link.weight} relationship${link.weight === 1 ? "" : "s"}${link.pendingCount ? ` · ${link.pendingCount} pending` : ""}`;
}

function linkDistance(link: AccountabilityGraphLink) {
  if (link.type === "assigned_action" || link.type === "owns_decision") {
    return 72;
  }
  if (link.type === "same_meeting") {
    return 38;
  }
  if (link.type === "associated_identity") {
    return 96;
  }
  return 128;
}

function linkStrength(link: AccountabilityGraphLink) {
  if (link.type === "same_meeting") {
    return 0.08;
  }
  if (link.type === "participant_context") {
    return 0.18;
  }
  return 0.34;
}

function createTypeSeparationForce() {
  let nodes: PositionedGraphNode[] = [];
  const force = (alpha: number) => {
    for (const node of nodes) {
      const targetY = node.nodeType === "assertion" ? (node.kind === "action" ? -58 : 58) : 0;
      node.vy = (node.vy ?? 0) + (targetY - (node.y ?? 0)) * 0.018 * alpha;
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const left = nodes[index];
      for (let next = index + 1; next < nodes.length; next += 1) {
        const right = nodes[next];
        const dx = (right.x ?? 0) - (left.x ?? 0);
        const dy = (right.y ?? 0) - (left.y ?? 0);
        const dz = (right.z ?? 0) - (left.z ?? 0);
        const distance = Math.hypot(dx, dy, dz) || 1;
        const minDistance = left.nodeType === "person" && right.nodeType === "person" ? 40 : 32;
        if (distance >= minDistance) {
          continue;
        }
        const push = ((minDistance - distance) / distance) * alpha * 0.22;
        const x = dx * push;
        const y = dy * push;
        const z = dz * push;
        left.vx = (left.vx ?? 0) - x;
        left.vy = (left.vy ?? 0) - y;
        left.vz = (left.vz ?? 0) - z;
        right.vx = (right.vx ?? 0) + x;
        right.vy = (right.vy ?? 0) + y;
        right.vz = (right.vz ?? 0) + z;
      }
    }
  };
  force.initialize = (nextNodes: PositionedGraphNode[]) => {
    nodes = nextNodes;
  };
  return force;
}

function patchOrbitPointerUp(controls: GraphControls) {
  if (controls.__accountabilityPointerGuard || !controls._onPointerUp) {
    return;
  }
  const originalPointerUp = controls._onPointerUp;
  controls._onPointerUp = (event: PointerEvent) => {
    const pointers = controls._pointers;
    const pointerPositions = controls._pointerPositions;
    if (Array.isArray(pointers) && event.pointerId == null && pointers.length === 1) {
      const pointerId = pointers[0];
      const position = pointerPositions?.[String(pointerId)];
      originalPointerUp({
        pointerId,
        pageX: position?.x ?? 0,
        pageY: position?.y ?? 0,
      } as PointerEvent);
      return;
    }
    if (Array.isArray(pointers) && pointerPositions) {
      const remainingPointers = pointers.filter((pointerId) => pointerId !== event.pointerId);
      if (remainingPointers.length === 1) {
        const remainingPointerKey = String(remainingPointers[0]);
        const existingPosition = pointerPositions[remainingPointerKey];
        if (existingPosition && typeof existingPosition.set !== "function") {
          existingPosition.set = function set(x: number, y: number) {
            this.x = x;
            this.y = y;
            return this;
          };
        }
        if (!existingPosition) {
          pointerPositions[remainingPointerKey] = {
            x: Number.isFinite(event.pageX) ? event.pageX : 0,
            y: Number.isFinite(event.pageY) ? event.pageY : 0,
            set(x: number, y: number) {
              this.x = x;
              this.y = y;
              return this;
            },
          };
        }
      }
    }
    originalPointerUp(event);
  };
  controls.__accountabilityPointerGuard = true;
}

function graphNodeAnchorChanged(previous: GraphNodeScreenPosition | null, next: GraphNodeScreenPosition | null) {
  if (previous === next) {
    return false;
  }
  if (!previous || !next) {
    return true;
  }
  return (
    previous.nodeId !== next.nodeId ||
    previous.visible !== next.visible ||
    previous.viewportWidth !== next.viewportWidth ||
    previous.viewportHeight !== next.viewportHeight ||
    Math.abs(previous.x - next.x) > 1 ||
    Math.abs(previous.y - next.y) > 1
  );
}

function projectGraphNodeToScreen(
  graphHandle: AccountabilityForceGraphHandle | undefined,
  node: PositionedGraphNode | null | undefined,
  size: { width: number; height: number },
): GraphNodeScreenPosition | null {
  if (!graphHandle || !node || typeof node.x !== "number" || typeof node.y !== "number" || typeof node.z !== "number") {
    return null;
  }

  const projected = graphHandle.graph2ScreenCoords(node.x, node.y, node.z);
  const visible =
    Number.isFinite(projected.x) &&
    Number.isFinite(projected.y) &&
    projected.x >= 0 &&
    projected.x <= size.width &&
    projected.y >= 0 &&
    projected.y <= size.height;

  return {
    nodeId: node.id,
    x: projected.x,
    y: projected.y,
    visible,
    viewportWidth: size.width,
    viewportHeight: size.height,
  };
}

export function AccountabilityGraphCanvas({
  graph,
  selectedNodeId,
  resetSignal,
  unpinSelectedSignal,
  unpinAllSignal,
  onPinnedNodeIdsChange,
  onNodeSelect,
  onNodeHover,
  onBackgroundClick,
  onSelectionAnchorChange,
}: AccountabilityGraphCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<AccountabilityForceGraphHandle | undefined>(undefined);
  const previousUnpinSelectedSignal = useRef(unpinSelectedSignal);
  const previousUnpinAllSignal = useRef(unpinAllSignal);
  const previousSelectionAnchor = useRef<GraphNodeScreenPosition | null>(null);
  const [size, setSize] = useState({ width: 960, height: 620 });
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, PinnedPosition>>({});

  useEffect(() => {
    const element = shellRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(320, Math.floor(rect.width)), height: Math.max(460, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => {
        const pin = pinnedPositions[node.id];
        return pin ? ({ ...node, fx: pin.x, fy: pin.y, fz: pin.z } satisfies PositionedGraphNode) : ({ ...node } satisfies PositionedGraphNode);
      }),
      links: graph.links.map((link) => ({ ...link })),
    }),
    [graph, pinnedPositions],
  );

  const highlight = useMemo<HighlightState>(() => {
    if (!selectedNodeId) {
      return null;
    }
    const nodeIds = new Set([selectedNodeId]);
    const linkIds = new Set<string>();
    const relatedAssertionIds = new Set<string>();
    for (const link of graph.links) {
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      if (source === selectedNodeId || target === selectedNodeId) {
        linkIds.add(link.id);
        nodeIds.add(source);
        nodeIds.add(target);
        if (source.startsWith("assertion:")) {
          relatedAssertionIds.add(source);
        }
        if (target.startsWith("assertion:")) {
          relatedAssertionIds.add(target);
        }
      }
    }
    for (const link of graph.links) {
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      if (relatedAssertionIds.has(source) || relatedAssertionIds.has(target)) {
        linkIds.add(link.id);
        nodeIds.add(source);
        nodeIds.add(target);
      }
    }
    return { nodeIds, linkIds };
  }, [graph.links, selectedNodeId]);

  useEffect(() => {
    onPinnedNodeIdsChange(Object.keys(pinnedPositions).filter((nodeId) => graph.nodes.some((node) => node.id === nodeId)));
  }, [graph.nodes, onPinnedNodeIdsChange, pinnedPositions]);

  useEffect(() => {
    setPinnedPositions((current) => {
      const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
      const next = Object.fromEntries(Object.entries(current).filter(([nodeId]) => graphNodeIds.has(nodeId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [graph.nodes]);

  useEffect(() => {
    if (unpinSelectedSignal === previousUnpinSelectedSignal.current) {
      return;
    }
    previousUnpinSelectedSignal.current = unpinSelectedSignal;
    if (!selectedNodeId) {
      return;
    }
    setPinnedPositions((current) => {
      if (!current[selectedNodeId]) {
        return current;
      }
      const next = { ...current };
      delete next[selectedNodeId];
      return next;
    });
  }, [selectedNodeId, unpinSelectedSignal]);

  useEffect(() => {
    if (unpinAllSignal === previousUnpinAllSignal.current) {
      return;
    }
    previousUnpinAllSignal.current = unpinAllSignal;
    setPinnedPositions({});
  }, [unpinAllSignal]);

  function configureGraphRuntime() {
    const handle = graphRef.current as (AccountabilityForceGraphHandle & {
      d3Force?: (name: string, force?: unknown) => unknown;
      d3ReheatSimulation?: () => void;
      controls?: () => object;
    }) | undefined;
    if (!handle?.d3Force) {
      return false;
    }
    const linkForce = handle.d3Force("link") as { distance?: (value: (link: AccountabilityGraphLink) => number) => unknown; strength?: (value: (link: AccountabilityGraphLink) => number) => unknown } | undefined;
    linkForce?.distance?.(linkDistance);
    linkForce?.strength?.(linkStrength);
    const chargeForce = handle.d3Force("charge") as { strength?: (value: number) => unknown; distanceMax?: (value: number) => unknown } | undefined;
    chargeForce?.strength?.(-185);
    chargeForce?.distanceMax?.(460);
    handle.d3Force("typeSeparation", createTypeSeparationForce());
    const controls = handle.controls?.() as GraphControls | undefined;
    if (controls) {
      patchOrbitPointerUp(controls);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.rotateSpeed = 1.55;
      controls.zoomSpeed = 1.65;
      controls.panSpeed = 1.1;
      controls.update?.();
    }
    handle.d3ReheatSimulation?.();
    return true;
  }

  useEffect(() => {
    configureGraphRuntime();
    const retry = window.setTimeout(configureGraphRuntime, 250);
    return () => window.clearTimeout(retry);
  }, [graphData]);

  function resetCamera(duration = 320) {
    graphRef.current?.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, duration);
    graphRef.current?.zoomToFit(duration, 58);
  }

  function moveCamera({ rotate = 0, tilt = 0, zoom = 1 }: { rotate?: number; tilt?: number; zoom?: number }) {
    const handle = graphRef.current as (AccountabilityForceGraphHandle & {
      camera?: () => { position: { x: number; y: number; z: number } };
      controls?: () => object;
    }) | undefined;
    const camera = handle?.camera?.();
    if (!handle || !camera) {
      return;
    }
    const controls = handle.controls?.() as GraphControls | undefined;
    const target = controls?.target ?? { x: 0, y: 0, z: 0 };
    const dx = camera.position.x - target.x;
    const dy = camera.position.y - target.y;
    const dz = camera.position.z - target.z;
    const radius = Math.max(90, Math.hypot(dx, dy, dz) * zoom);
    const theta = Math.atan2(dx, dz) + rotate;
    const currentPhi = Math.acos(Math.min(1, Math.max(-1, dy / Math.max(1, Math.hypot(dx, dy, dz)))));
    const phi = Math.min(Math.PI - 0.12, Math.max(0.12, currentPhi + tilt));
    const sinPhiRadius = Math.sin(phi) * radius;
    handle.cameraPosition(
      {
        x: target.x + sinPhiRadius * Math.sin(theta),
        y: target.y + Math.cos(phi) * radius,
        z: target.z + sinPhiRadius * Math.cos(theta),
      },
      target,
      120,
    );
  }

  function onCanvasKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "0") {
      event.preventDefault();
      resetCamera();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      moveCamera({ zoom: 0.82 });
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      moveCamera({ zoom: 1.18 });
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      moveCamera(event.key === "ArrowLeft" || event.key === "ArrowRight" ? { rotate: direction * 0.18 } : { tilt: direction * 0.14 });
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (graph.nodes.length > 0) {
        resetCamera();
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [graph.nodes.length, graph.links.length, resetSignal]);

  useEffect(() => {
    if (!selectedNodeId) {
      previousSelectionAnchor.current = null;
      onSelectionAnchorChange(null);
      return;
    }

    let frameId = 0;
    const updateSelectionAnchor = () => {
      const selectedNode = graphData.nodes.find((node) => node.id === selectedNodeId) as PositionedGraphNode | undefined;
      const nextAnchor = projectGraphNodeToScreen(graphRef.current, selectedNode, size);

      if (graphNodeAnchorChanged(previousSelectionAnchor.current, nextAnchor)) {
        previousSelectionAnchor.current = nextAnchor;
        onSelectionAnchorChange(nextAnchor);
      }

      frameId = window.requestAnimationFrame(updateSelectionAnchor);
    };

    updateSelectionAnchor();
    return () => window.cancelAnimationFrame(frameId);
  }, [graphData.nodes, onSelectionAnchorChange, selectedNodeId, size.height, size.width]);

  return (
    <div className="accountability-graph-canvas" ref={shellRef} tabIndex={0} aria-label="3D accountability graph canvas" onKeyDown={onCanvasKeyDown}>
      <ForceGraph
        graphRef={graphRef}
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(4, 6, 13, 0)"
        nodeId="id"
        nodeLabel={nodeLabel}
        nodeColor={(node) => nodeColor(node, selectedNodeId, highlight)}
        nodeVal={nodeValue}
        nodeOpacity={0.94}
        nodeResolution={16}
        linkSource="source"
        linkTarget="target"
        linkLabel={linkLabel}
        linkColor={(link) => linkColor(link, highlight)}
        linkWidth={(link) => linkWidth(link, highlight)}
        linkOpacity={0.72}
        linkDirectionalArrowLength={(link) => (link.type === "assigned_action" || link.type === "owns_decision" ? 3.2 : 0)}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(link) => (link.pendingCount > 0 ? 1 : 0)}
        linkDirectionalParticleWidth={1.4}
        linkDirectionalParticleSpeed={0.004}
        cooldownTicks={120}
        warmupTicks={65}
        d3AlphaDecay={0.026}
        d3VelocityDecay={0.34}
        controlType="orbit"
        enableNavigationControls
        enableNodeDrag
        showNavInfo={false}
        onNodeClick={(node) => {
          const nextAnchor = projectGraphNodeToScreen(graphRef.current, node as PositionedGraphNode, size);
          if (graphNodeAnchorChanged(previousSelectionAnchor.current, nextAnchor)) {
            previousSelectionAnchor.current = nextAnchor;
            onSelectionAnchorChange(nextAnchor);
          }
          onNodeSelect(node, nextAnchor);
        }}
        onNodeHover={(node) => onNodeHover(node)}
        onNodeDragEnd={(node) => {
          const positioned = node as PositionedGraphNode;
          if (typeof positioned.x !== "number" || typeof positioned.y !== "number" || typeof positioned.z !== "number") {
            return;
          }
          setPinnedPositions((current) => ({ ...current, [positioned.id]: { x: positioned.x as number, y: positioned.y as number, z: positioned.z as number } }));
        }}
        onBackgroundClick={() => {
          onNodeHover(null);
          onBackgroundClick();
        }}
      />
      {graph.nodes.length === 0 ? (
        <div className="accountability-graph-empty">No graphable accountability assertions in this view.</div>
      ) : null}
    </div>
  );
}
