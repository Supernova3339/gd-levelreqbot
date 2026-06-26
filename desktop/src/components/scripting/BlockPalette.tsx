// Portal-based drill-down block picker.
// Palette entries come from the registry in lib/scripting/palette-registry.ts.

import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, type Placement, shift} from "@floating-ui/dom";
import type {Block} from "./visual/block-types";
import {PalettePanel} from "./PalettePanel";

interface PortalProps {
    anchor: Element;
    onAdd: (b: Block) => void;
    onClose: () => void;
}

function FloatingPalettePanel({anchor, onAdd, onClose}: PortalProps) {
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const panelRef = useRef<HTMLDivElement>(null);
    const cancelPos = useRef(false);

    useEffect(() => {
        if (!panelRef.current) return;
        cancelPos.current = false;

        const update = () => {
            computePosition(anchor, panelRef.current!, {
                placement: "bottom-start" as Placement,
                middleware: [offset(4), flip(), shift({padding: 8})],
            }).then(({x, y}) => {
                if (!cancelPos.current) setPos({top: y, left: x});
            });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            cancelPos.current = true;
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [anchor]);

    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node) && !anchor.contains(e.target as Node))
                onClose();
        };
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [anchor, onClose]);

    return (
        <PalettePanel
            divRef={panelRef}
            onAdd={onAdd}
            onClose={onClose}
            autoFocus
            style={{position: "fixed", top: pos.top, left: pos.left, width: 280, maxHeight: 400, zIndex: 9999}}
        />
    );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface Props {
    onAdd: (b: Block) => void;
    label?: string;
}

export function AddBlockButton({onAdd, label = "Add block"}: Props) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    return (
        <>
            <button ref={btnRef} onClick={() => setOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                    style={{color: "#333", border: "1px dashed #1e1e1e"}}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-accent)";
                        e.currentTarget.style.borderColor = "var(--color-accent)44";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#333";
                        e.currentTarget.style.borderColor = "#1e1e1e";
                    }}>
                + {label}
            </button>
            {open && btnRef.current && createPortal(
                <FloatingPalettePanel anchor={btnRef.current} onAdd={onAdd} onClose={() => setOpen(false)}/>,
                document.body
            )}
        </>
    );
}
