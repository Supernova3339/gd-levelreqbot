import {useState} from "react";
import type {Condition} from "./block-types";

const PRESETS: { label: string; method: string }[] = [
    {label: "user.isMod()", method: "user.isMod()"},
    {label: "user.isSub()", method: "user.isSub()"},
    {label: "user.isStaff()", method: "user.isStaff()"},
    {label: "user.isBroadcaster()", method: "user.isBroadcaster()"},
    {label: "args.len() > 0", method: "args.len() > 0"},
    {label: "args.len() == 0", method: "args.len() == 0"},
    {label: "queue.size() == 0", method: "queue.size() == 0"},
    {label: "queue.has(args[0])", method: "queue.has(args[0])"},
    {label: "custom…", method: ""},
];

interface Props {
    value: Condition;
    onChange: (c: Condition) => void;
}

export function ConditionSlot({value, onChange}: Props) {
    const currentMethod = value.kind === "call" ? value.method : "";
    const isCustom = !PRESETS.slice(0, -1).some((p) => p.method === currentMethod);
    const [custom, setCustom] = useState(isCustom ? currentMethod : "");

    const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const method = e.target.value;
        if (method === "") {
            // custom mode — keep existing custom value
            return;
        }
        onChange({kind: "call", method});
    };

    const selectValue = isCustom ? "" : currentMethod;

    return (
        <span className="inline-flex items-center gap-1">
      <select
          value={selectValue}
          onChange={handleSelect}
          style={{
              backgroundColor: "#1a1a1a", color: "#d0d0d0", border: "1px solid #333",
              borderRadius: 4, fontSize: 11, padding: "1px 4px", cursor: "pointer",
              fontFamily: "monospace",
          }}
      >
        {PRESETS.map((p) => (
            <option key={p.label} value={p.method}>{p.label}</option>
        ))}
      </select>

            {(isCustom || selectValue === "") && (
                <input
                    value={custom}
                    onChange={(e) => {
                        setCustom(e.target.value);
                        onChange({kind: "call", method: e.target.value});
                    }}
                    placeholder="custom condition"
                    style={{
                        backgroundColor: "#111", color: "#d0d0d0", border: "1px solid #333",
                        borderRadius: 4, fontSize: 11, padding: "1px 6px", width: 160,
                        fontFamily: "monospace",
                    }}
                />
            )}
    </span>
    );
}
