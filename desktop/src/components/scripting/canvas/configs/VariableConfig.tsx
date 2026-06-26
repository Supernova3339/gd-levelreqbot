import type {ScriptNodeData} from "../NodeDefinitions";

const MONO = '"JetBrains Mono","Fira Code",monospace';
const INPUT: React.CSSProperties = {
    backgroundColor: "#0a0a0a", color: "#c0c0c0",
    border: "1px solid #252525", borderRadius: 3,
    padding: "3px 7px", fontSize: 11, fontFamily: MONO,
    width: "100%", outline: "none",
};
const LABEL: React.CSSProperties = {
    fontSize: 9, color: "#444", margin: "0 0 4px",
    textTransform: "uppercase", letterSpacing: "0.05em",
};

// Common value presets — things users frequently assign to variables.
const VALUE_PRESETS = [
    {label: "args[0].to_string()", desc: "First argument as string"},
    {label: "user.name", desc: "Viewer display name"},
    {label: "queue.size()", desc: "Current queue length"},
    {label: "queue.position(args[0])", desc: "Position of args[0] in queue"},
    {label: "store.get(\"key\")", desc: "Value from persistent store"},
    {label: "time.now()", desc: "Unix timestamp (seconds)"},
    {label: "gd.fetch(args[0])", desc: "GD level data map"},
];

interface Props {
    data: ScriptNodeData;
    onChange: (patch: Partial<ScriptNodeData>) => void;
}

export function VariableConfig({data, onChange}: Props) {
    return (
        <div className="flex flex-col gap-2">
            <div>
                <p style={LABEL}>name</p>
                <input value={data.varName ?? ""} onChange={(e) => onChange({varName: e.target.value})}
                       className="nodrag" placeholder="my_var" style={INPUT}/>
            </div>

            <div>
                <p style={LABEL}>value / expression</p>
                <input value={data.varValue ?? ""} onChange={(e) => onChange({varValue: e.target.value})}
                       className="nodrag" placeholder="args[0].to_string()" style={INPUT}/>
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {VALUE_PRESETS.map((p) => (
                        <button key={p.label} className="nodrag" onClick={() => onChange({varValue: p.label})}
                                title={p.desc}
                                style={{
                                    fontSize: 10, padding: "1px 6px", borderRadius: 3,
                                    cursor: "pointer", fontFamily: MONO,
                                    backgroundColor: data.varValue === p.label ? "#c792ea22" : "#111",
                                    color: data.varValue === p.label ? "#c792ea" : "#555",
                                    border: `1px solid ${data.varValue === p.label ? "#c792ea44" : "#252525"}`,
                                }}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview */}
            {(data.varName || data.varValue) && (
                <div style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    backgroundColor: "#0a0a0a",
                    border: "1px solid #1e1e1e"
                }}>
                    <code style={{fontSize: 10, color: "#c792ea", fontFamily: MONO}}>
                        {`let ${data.varName || "value"} = ${data.varValue || "()"};`}
                    </code>
                </div>
            )}
        </div>
    );
}
