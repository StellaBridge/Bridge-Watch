import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BridgeEdge, ChainNode, SupplyChainGraph, ViewTransform } from "./types";
import ChainNodeComponent from "./ChainNode";
import BridgeEdgeComponent from "./BridgeEdge";
import MiniMap from "./MiniMap";
import Legend from "./Legend";
import SupplyBreakdown from "./SupplyBreakdown";
import FilterBar from "./FilterBar";
import ExportButton from "./ExportButton";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAPH_W = 800;
const GRAPH_H = 640;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3.0;
const ZOOM_STEP = 0.15;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  data: SupplyChainGraph;
  isLoading?: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SupplyChainViz({ data, isLoading, error }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [activeAssets, setActiveAssets] = useState<Set<string>>(new Set());
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredNodes = useMemo<ChainNode[]>(() => {
    if (activeAssets.size === 0) return data.nodes;
    return data.nodes.filter((node) =>
      node.assets.some((a) => activeAssets.has(a.symbol))
    );
  }, [data.nodes, activeAssets]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo<BridgeEdge[]>(() => {
    if (activeAssets.size === 0) return data.edges;
    return data.edges.filter(
      (edge) =>
        filteredNodeIds.has(edge.source) &&
        filteredNodeIds.has(edge.target) &&
        edge.assets.some((a) => activeAssets.has(a))
    );
  }, [data.edges, filteredNodeIds, activeAssets]);

  const selectedNode = useMemo(
    () => filteredNodes.find((n) => n.id === selectedNodeId),
    [filteredNodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => filteredEdges.find((e) => e.id === selectedEdgeId),
    [filteredEdges, selectedEdgeId]
  );

  // Connected nodes to the selected node (for dimming unrelated nodes)
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const ids = new Set<string>([selectedNodeId]);
    filteredEdges.forEach((e) => {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    });
    return ids;
  }, [selectedNodeId, filteredEdges]);

  // ---------------------------------------------------------------------------
  // Zoom / pan handlers
  // ---------------------------------------------------------------------------

  const clampScale = useCallback(
    (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)),
    []
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setTransform((prev) => {
        const newScale = clampScale(prev.scale + delta);
        // Zoom toward cursor position
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { ...prev, scale: newScale };
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const nx = cx - (cx - prev.x) * (newScale / prev.scale);
        const ny = cy - (cy - prev.y) * (newScale / prev.scale);
        return { x: nx, y: ny, scale: newScale };
      });
    },
    [clampScale]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTransform((prev) => ({ ...prev, x: panStart.current.tx + dx, y: panStart.current.ty + dy }));
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const STEP = 30;
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
      if (e.key === "+" || e.key === "=") {
        setTransform((p) => ({ ...p, scale: clampScale(p.scale + ZOOM_STEP) }));
      }
      if (e.key === "-") {
        setTransform((p) => ({ ...p, scale: clampScale(p.scale - ZOOM_STEP) }));
      }
      if (e.key === "ArrowLeft")  setTransform((p) => ({ ...p, x: p.x + STEP }));
      if (e.key === "ArrowRight") setTransform((p) => ({ ...p, x: p.x - STEP }));
      if (e.key === "ArrowUp")    setTransform((p) => ({ ...p, y: p.y + STEP }));
      if (e.key === "ArrowDown")  setTransform((p) => ({ ...p, y: p.y - STEP }));
      if (e.key === "0")          setTransform({ x: 0, y: 0, scale: 1 });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clampScale]);

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  function handleSelectNode(id: string) {
    setSelectedNodeId((prev) => (prev === id ? null : id));
    setSelectedEdgeId(null);
  }

  function handleSelectEdge(id: string) {
    setSelectedEdgeId((prev) => (prev === id ? null : id));
    setSelectedNodeId(null);
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).id === "canvas-bg") {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------

  function toggleAsset(asset: string) {
    setActiveAssets((prev) => {
      const next = new Set(prev);
      if (next.has(asset)) {
        next.delete(asset);
      } else {
        next.add(asset);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Zoom controls
  // ---------------------------------------------------------------------------

  function zoomIn() {
    setTransform((p) => ({ ...p, scale: clampScale(p.scale + ZOOM_STEP) }));
  }
  function zoomOut() {
    setTransform((p) => ({ ...p, scale: clampScale(p.scale - ZOOM_STEP) }));
  }
  function resetView() {
    setTransform({ x: 0, y: 0, scale: 1 });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 rounded-xl">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading supply chain data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 rounded-xl">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  const svgTransform = `translate(${transform.x},${transform.y}) scale(${transform.scale})`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden select-none"
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      role="img"
      aria-label="Supply chain visualization"
    >
      {/* Inline CSS for flow animation */}
      <style>{`
        @keyframes supply-flow {
          from { stroke-dashoffset: 100; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>

      {/* Main SVG */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        style={{ display: "block" }}
        onClick={handleCanvasClick}
        aria-hidden="true"
      >
        {/* Background */}
        <rect
          id="canvas-bg"
          width={GRAPH_W}
          height={GRAPH_H}
          fill="transparent"
        />

        <g transform={svgTransform}>
          {/* Grid dots */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="0" cy="0" r="0.8" fill="#334155" />
            </pattern>
          </defs>
          <rect width={GRAPH_W} height={GRAPH_H} fill="url(#grid)" />

          {/* Edges (rendered below nodes) */}
          {filteredEdges.map((edge) => {
            const isEdgeDimmed =
              !!connectedNodeIds &&
              !connectedNodeIds.has(edge.source) &&
              !connectedNodeIds.has(edge.target);

            return (
              <BridgeEdgeComponent
                key={edge.id}
                edge={edge}
                nodes={filteredNodes}
                isSelected={selectedEdgeId === edge.id}
                isHovered={hoveredEdgeId === edge.id}
                isDimmed={isEdgeDimmed}
                onSelect={handleSelectEdge}
                onHover={setHoveredEdgeId}
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const isNodeDimmed =
              !!connectedNodeIds && !connectedNodeIds.has(node.id);

            return (
              <ChainNodeComponent
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                isHovered={hoveredNodeId === node.id}
                isDimmed={isNodeDimmed}
                onSelect={handleSelectNode}
                onHover={setHoveredNodeId}
              />
            );
          })}
        </g>
      </svg>

      {/* Overlay controls */}
      <Legend />
      <FilterBar
        activeAssets={activeAssets}
        onToggleAsset={toggleAsset}
        onClearFilters={() => setActiveAssets(new Set())}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={resetView}
        zoomLevel={transform.scale}
      />

      {/* Detail panel */}
      <SupplyBreakdown
        node={selectedNode}
        edge={selectedEdge}
        allNodes={filteredNodes}
        onClose={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
      />

      {/* Mini-map */}
      <MiniMap
        nodes={filteredNodes}
        edges={filteredEdges}
        transform={transform}
        viewportWidth={containerRef.current?.clientWidth ?? GRAPH_W}
        viewportHeight={containerRef.current?.clientHeight ?? GRAPH_H}
        graphWidth={GRAPH_W}
        graphHeight={GRAPH_H}
        onPan={(x, y) => setTransform((p) => ({ ...p, x, y }))}
      />

      {/* Export */}
      <ExportButton svgRef={svgRef} filename="bridge-watch-supply-chain" />

      {/* Stats footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-500 pointer-events-none">
        {filteredNodes.length} chains · {filteredEdges.length} bridges ·
        Updated {new Date(data.lastUpdated).toLocaleTimeString()} ·
        Press <kbd className="bg-slate-800 px-1 rounded">Esc</kbd> to deselect ·
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}
