// Custom ReactFlow edge with draggable waypoints.
// - Double-click the edge path to add a waypoint dot.
// - Double-click a waypoint dot to remove it.
// - Drag a waypoint dot to reposition it.
// The bezier curve routes through all waypoints in order.

import {useCallback, useRef} from "react";
import {BaseEdge, type EdgeProps, getBezierPath,} from "reactflow";

export interface WaypointData {
    waypoints?: { x: number; y: number }[];
}

type Props = EdgeProps<WaypointData>;

// Build a cubic SVG path that passes through a sequence of waypoints.
// We use a polyline approximation: a series of bezier segments.
function buildPath(
    sx: number, sy: number, tx: number, ty: number,
    pts: { x: number; y: number }[],
): string {
    if (pts.length === 0) {
        // No waypoints — let ReactFlow draw the default bezier.
        const [p] = getBezierPath({sourceX: sx, sourceY: sy, targetX: tx, targetY: ty});
        return p;
    }

    // Build a polyline: M → catmull-rom through waypoints → L target
    const all = [{x: sx, y: sy}, ...pts, {x: tx, y: ty}];
    let d = `M ${all[0].x} ${all[0].y}`;
    for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1];
        const curr = all[i];
        // Cubic bezier with control points at 1/3 and 2/3 of the segment.
        const cx1 = prev.x + (curr.x - prev.x) / 2;
        const cy1 = prev.y;
        const cx2 = prev.x + (curr.x - prev.x) / 2;
        const cy2 = curr.y;
        d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }
    return d;
}

export function WaypointEdge({
                                 id, sourceX, sourceY, targetX, targetY,
                                 markerEnd, style, data, selected,
                             }: Props) {
    const waypoints: { x: number; y: number }[] = data?.waypoints ?? [];
    const draggingIdx = useRef<number | null>(null);

    const edgePath = buildPath(sourceX, sourceY, targetX, targetY, waypoints);

    // ── Dispatch waypoint update to ReactFlow ───────────────────────────────────
    const dispatch = useCallback((next: { x: number; y: number }[]) => {
        // We reach into ReactFlow's store via a custom event consumed by NodeCanvas.
        window.dispatchEvent(new CustomEvent("__rf_waypoints__", {
            detail: {edgeId: id, waypoints: next},
        }));
    }, [id]);

    // ── Add waypoint on double-click of the path ────────────────────────────────
    const onPathDblClick = useCallback((e: React.MouseEvent<SVGPathElement>) => {
        e.stopPropagation();
        const svg = (e.target as SVGPathElement).ownerSVGElement;
        if (!svg) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const {x, y} = pt.matrixTransform(svg.getScreenCTM()!.inverse());

        // Insert the waypoint at the correct position in the path.
        // Find the closest segment and insert after it.
        const all = [{x: sourceX, y: sourceY}, ...waypoints, {x: targetX, y: targetY}];
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < all.length - 1; i++) {
            const mx = (all[i].x + all[i + 1].x) / 2;
            const my = (all[i].y + all[i + 1].y) / 2;
            const d = Math.hypot(x - mx, y - my);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }
        const next = [...waypoints];
        next.splice(bestIdx, 0, {x, y});
        dispatch(next);
    }, [dispatch, sourceX, sourceY, targetX, targetY, waypoints]);

    // ── Drag waypoint ────────────────────────────────────────────────────────────
    const onDotMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        draggingIdx.current = idx;
        const svg = (e.currentTarget as SVGElement).ownerSVGElement;
        if (!svg) return;

        const onMove = (me: MouseEvent) => {
            if (draggingIdx.current === null) return;
            const pt = svg.createSVGPoint();
            pt.x = me.clientX;
            pt.y = me.clientY;
            const {x, y} = pt.matrixTransform(svg.getScreenCTM()!.inverse());
            const next = waypoints.map((w, i) => i === draggingIdx.current! ? {x, y} : w);
            dispatch(next);
        };
        const onUp = () => {
            draggingIdx.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, [dispatch, waypoints]);

    // ── Remove waypoint on double-click ─────────────────────────────────────────
    const onDotDblClick = useCallback((e: React.MouseEvent, idx: number) => {
        e.stopPropagation();
        dispatch(waypoints.filter((_, i) => i !== idx));
    }, [dispatch, waypoints]);

    return (
        <>
            {/* Invisible wide hit target so the path is easy to double-click */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={12}
                stroke="transparent"
                style={{cursor: "crosshair"}}
                onDoubleClick={onPathDblClick}
            />

            {/* Visible edge */}
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style}/>

            {/* Waypoint dots */}
            {waypoints.map((pt, i) => (
                <g key={i} transform={`translate(${pt.x},${pt.y})`}>
                    <circle r={6} fill="transparent" style={{cursor: "grab"}}
                            onMouseDown={(e) => onDotMouseDown(e, i)}
                            onDoubleClick={(e) => onDotDblClick(e, i)}/>
                    <circle r={4} fill={selected ? "#818cf8" : "#333"}
                            stroke={selected ? "#818cf888" : "#555"} strokeWidth={1.5}
                            style={{pointerEvents: "none"}}/>
                </g>
            ))}
        </>
    );
}
