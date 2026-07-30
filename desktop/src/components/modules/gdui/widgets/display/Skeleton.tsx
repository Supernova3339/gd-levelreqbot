import type {LayoutNode} from "../../../../../lib/types";

function SkeletonLine({width = "100%", height = 12}: { width?: string; height?: number }) {
    return (
        <div style={{
            width,
            height,
            borderRadius: 4,
            backgroundColor: "#1a1a1a",
            animation: "gdui-skeleton-pulse 1.5s ease-in-out infinite",
        }}/>
    );
}

export function Skeleton({node}: { node: LayoutNode }) {
    const lines = Math.max(1, Math.min(node.skeleton_lines ?? 3, 10));
    const height = node.skeleton_height ?? 12;

    return (
        <>
            <style>{`
                @keyframes gdui-skeleton-pulse {
                    0%, 100% { opacity: 0.4; }
                    50%       { opacity: 0.8; }
                }
            `}</style>
            <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                {Array.from({length: lines}, (_, i) => (
                    <SkeletonLine
                        key={i}
                        height={height}
                        width={i === lines - 1 && lines > 1 ? "60%" : "100%"}
                    />
                ))}
            </div>
        </>
    );
}
