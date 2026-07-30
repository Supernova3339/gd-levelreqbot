import {useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useAction} from "../../hooks/useAction";
import {resolveLucideIcon} from "../lucide";

const INPUT_STYLE = {
    backgroundColor: "#111",
    color: "#ccc",
    border: "1px solid #2a2a2a",
    borderRadius: 5,
    padding: "5px 8px",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
};

/**
 * Self-contained two-input row + submit button. Deliberately does NOT read or
 * write the shared page-state bag — both fields live in this component's own
 * useState, and submit sends them as a single JSON-object arg
 * (`io.parse_json(args[0])` on the script side). That sidesteps the whole
 * class of bugs the old Input+Input+Button/argState wiring had: comma-split
 * multi-key resolution skipping unset fields (shifting arg indices), the
 * shared state bag getting raced by unrelated re-renders, and afterState
 * clearing on any non-throwing dispatch (including a script that "succeeded"
 * by silently no-op'ing) instead of only on genuine success.
 */
export function TwoFieldForm({node}: { node: LayoutNode }) {
    const {dispatch, busy} = useAction();
    const [val1, setVal1] = useState("");
    const [val2, setVal2] = useState("");

    const isBusy = busy !== null;
    const key1 = node.twoform_field1_key ?? "field1";
    const key2 = node.twoform_field2_key ?? "field2";

    const iconName = node.twoform_button_icon;
    let iconEl: React.ReactNode = null;
    if (iconName) {
        const Ic = resolveLucideIcon(iconName);
        if (Ic) iconEl = <Ic size={13}/>;
    }

    const submit = async () => {
        if (isBusy || !node.twoform_action_key) return;
        const v1 = val1.trim();
        const v2 = val2.trim();
        const payload = JSON.stringify({[key1]: v1, [key2]: v2});
        const ok = await dispatch(node.twoform_action_key, [payload]);
        if (ok) {
            setVal1("");
            setVal2("");
        }
    };

    return (
        <div style={{display: "flex", gap: 6, alignItems: "center"}}>
            <input
                value={val1}
                placeholder={node.twoform_field1_placeholder}
                onChange={e => setVal1(e.target.value)}
                onKeyDown={e => {
                    if (e.key === "Enter") submit();
                }}
                style={INPUT_STYLE}
                onFocus={e => {
                    e.target.style.borderColor = "var(--color-accent, #7c3aed)";
                }}
                onBlur={e => {
                    e.target.style.borderColor = "#2a2a2a";
                }}
            />
            <input
                value={val2}
                placeholder={node.twoform_field2_placeholder}
                onChange={e => setVal2(e.target.value)}
                onKeyDown={e => {
                    if (e.key === "Enter") submit();
                }}
                style={INPUT_STYLE}
                onFocus={e => {
                    e.target.style.borderColor = "var(--color-accent, #7c3aed)";
                }}
                onBlur={e => {
                    e.target.style.borderColor = "#2a2a2a";
                }}
            />
            <button
                onClick={submit}
                disabled={isBusy}
                style={{
                    backgroundColor: "var(--color-accent, #7c3aed)",
                    color: "#fff",
                    border: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: iconEl ? 5 : 0,
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: isBusy ? "not-allowed" : "pointer",
                    opacity: isBusy ? 0.5 : 1,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                }}
            >
                {isBusy ? "…" : (<>{iconEl}{node.twoform_button_label ?? "Add"}</>)}
            </button>
        </div>
    );
}
