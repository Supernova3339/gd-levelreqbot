import {memo, useEffect, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

function ImageInner({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.img_src_expr, state);
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const src = data ? String(data) : (node.img_src as string | undefined);
    const height = node.img_height ?? 120;
    const radius = node.img_border_radius ?? 0;
    const fit = (node.img_fit ?? "cover") as "cover" | "contain" | "fill";

    useEffect(() => {
        setError(false);
        setLoaded(false);
    }, [src]);

    if (!src) return null;

    return (
        <div style={{
            position: "relative",
            width: "100%",
            height,
            flexShrink: 0,
            overflow: "hidden",
            borderRadius: radius,
            backgroundColor: "#0f0f0f",
        }}>
            {error ? (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#2a2a2a",
                    fontSize: 11,
                    letterSpacing: "0.04em",
                }}>
                    No thumbnail
                </div>
            ) : (
                <img
                    src={src}
                    alt=""
                    onLoad={() => setLoaded(true)}
                    onError={() => setError(true)}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: fit,
                        display: "block",
                        opacity: loaded ? 1 : 0,
                        transition: "opacity 0.25s",
                    }}
                />
            )}
        </div>
    );
}

export const Image = memo(ImageInner);
