import {useEffect, useRef, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useAction} from "../../hooks/useAction";
import {useEval} from "../../hooks/useEval";

/** Auto-resets the "confirm?" state after this many ms without a second click. */
const CONFIRM_TIMEOUT_MS = 3000;

export function ConfirmButton({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {dispatch, busy} = useAction();
    const {data: disabledD} = useEval(node.button_disabled_expr, state);
    const [confirming, setConfirming] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup on unmount
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const isBusy = busy !== null;
    const isDisabled = isBusy || Boolean(disabledD);

    const handleClick = () => {
        if (isDisabled) return;
        if (!confirming) {
            setConfirming(true);
            timerRef.current = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
        } else {
            if (timerRef.current) clearTimeout(timerRef.current);
            setConfirming(false);
            if (node.button_action) {
                void dispatch(node.button_action, node.button_args);
            }
        }
    };

    const label = node.button_label ?? "Action";
    const confirmLabel = (node.confirm_label as string | undefined) ?? "Confirm?";
    const displayLabel = isBusy ? "…" : confirming ? confirmLabel : label;

    const confirmedStyle = {
        backgroundColor: "#7a1d1d",
        color: "#fca5a5",
        border: "1px solid #9a2d2d",
        boxShadow: "0 0 6px #ef444422",
    };
    const defaultStyle = {
        backgroundColor: "#1e1e1e",
        color: "#ddd",
        border: "1px solid #333",
    };

    return (
        <button
            onClick={handleClick}
            disabled={isDisabled}
            title={confirming ? "Click again to confirm" : undefined}
            style={{
                ...(confirming ? confirmedStyle : defaultStyle),
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.5 : 1,
                transition: "all 0.15s",
                flexShrink: 0,
                lineHeight: 1.4,
            }}
            onMouseEnter={e => {
                if (!isDisabled) {
                    e.currentTarget.style.backgroundColor = confirming ? "#9a2a2a" : "#252525";
                }
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = confirming ? "#7a1d1d" : "#1e1e1e";
            }}
        >
            {displayLabel}
        </button>
    );
}
