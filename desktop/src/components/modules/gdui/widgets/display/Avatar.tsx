import {memo, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

function getInitials(name: string): string {
    return name
        .split(/\s+/)
        .map(p => p[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?";
}

const STATUS_COLORS: Record<string, string> = {
    online: "#22c55e",
    away: "#f59e0b",
    offline: "#444",
    busy: "#ef4444",
};

function AvatarInner({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data: nameD} = useEval(node.avatar_name_expr, state);
    const {data: srcD} = useEval(node.avatar_src_expr, state);
    const [imgError, setImgError] = useState(false);

    const name = String(nameD ?? node.avatar_name ?? "");
    const src = srcD ? String(srcD) : (node.avatar_src as string | undefined);
    const initials = getInitials(name);
    const size = (node.avatar_size as number | undefined) ?? 32;
    const status = node.avatar_status as string | undefined;
    const statusColor = status ? (STATUS_COLORS[status] ?? STATUS_COLORS.offline) : null;

    return (
        <div style={{position: "relative", display: "inline-flex", flexShrink: 0}}>
            <div style={{
                width: size,
                height: size,
                borderRadius: "50%",
                backgroundColor: "#1a1a1a",
                border: "1px solid #2a2a2a",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
            }}>
                {src && !imgError ? (
                    <img
                        src={src}
                        alt={name}
                        onError={() => setImgError(true)}
                        style={{width: "100%", height: "100%", objectFit: "cover"}}
                    />
                ) : (
                    <span style={{
                        fontSize: Math.round(size * 0.36),
                        color: "#888",
                        fontWeight: 600,
                        lineHeight: 1,
                    }}>
                        {initials}
                    </span>
                )}
            </div>
            {statusColor && (
                <div style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: size * 0.28,
                    height: size * 0.28,
                    borderRadius: "50%",
                    backgroundColor: statusColor,
                    border: "1.5px solid #080808",
                    boxShadow: `0 0 4px ${statusColor}88`,
                }}/>
            )}
        </div>
    );
}

export const Avatar = memo(AvatarInner);
