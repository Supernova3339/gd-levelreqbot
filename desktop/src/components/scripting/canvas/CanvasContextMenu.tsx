import {createPortal} from "react-dom";
import {PalettePanel} from "../PalettePanel";
import type {Block} from "../visual/block-types";

interface Props {
    x: number;
    y: number;
    onAdd: (b: Block) => void;
    onClose: () => void;
}

export function CanvasContextMenu({x, y, onAdd, onClose}: Props) {
    const W = 280, H = 420;
    const cx = Math.min(x, window.innerWidth - W - 8);
    const cy = Math.min(y, window.innerHeight - H - 8);

    return createPortal(
        <>
            <div
                style={{position: "fixed", inset: 0, zIndex: 9998}}
                onClick={onClose}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onClose();
                }}
            />
            <PalettePanel
                onAdd={onAdd}
                onClose={onClose}
                autoFocus
                style={{position: "fixed", top: cy, left: cx, width: W, maxHeight: H, zIndex: 9999}}
            />
        </>,
        document.body
    );
}
