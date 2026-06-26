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

const ACTION_PRESETS = [
    {label: "queue.add", group: "Queue"},
    {label: "queue.next", group: "Queue"},
    {label: "queue.remove", group: "Queue"},
    {label: "queue.clear", group: "Queue"},
    {label: "store.get", group: "Store"},
    {label: "store.set", group: "Store"},
    {label: "store.delete", group: "Store"},
    {label: "store.incr", group: "Store"},
    {label: "counter.inc", group: "Counter"},
    {label: "counter.reset", group: "Counter"},
    {label: "gd.fetch", group: "GD API"},
    {label: "gd.search", group: "GD API"},
    {label: "data.insert", group: "Data"},
    {label: "data.find", group: "Data"},
    {label: "event.emit", group: "Event"},
    {label: "chat.announce", group: "Chat"},
];

const QUICK_ARGS = [
    {label: 'args[0].to_string()', desc: "First arg (string)"},
    {label: 'args[0]', desc: "First arg (raw)"},
    {label: '"key"', desc: "A key string"},
];

interface Props {
    data: ScriptNodeData;
    onChange: (patch: Partial<ScriptNodeData>) => void;
}

export function ActionConfig({data, onChange}: Props) {
    const action = data.action ?? "";
    const args = data.actionArgs ?? "";
    const isPreset = ACTION_PRESETS.some((p) => p.label === action);

    return (
        <div className="flex flex-col gap-2">
            <div>
                <p style={LABEL}>action</p>
                <select value={isPreset ? action : "__custom__"}
                        onChange={(e) => {
                            if (e.target.value !== "__custom__") onChange({action: e.target.value});
                        }}
                        className="nodrag" style={INPUT}>
                    {ACTION_PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label}()</option>)}
                    {!isPreset && action && <option value="__custom__">{action}()</option>}
                    <option value="__custom__">custom…</option>
                </select>
                {!isPreset && (
                    <input value={action} onChange={(e) => onChange({action: e.target.value})}
                           className="nodrag" placeholder="my.action" style={{...INPUT, marginTop: 4}}/>
                )}
            </div>

            <div>
                <p style={LABEL}>arguments</p>
                <input value={args} onChange={(e) => onChange({actionArgs: e.target.value})}
                       className="nodrag" placeholder="(blank = none)"
                       style={INPUT}/>
                <div className="flex flex-wrap gap-1 mt-1">
                    {QUICK_ARGS.map((a) => (
                        <button key={a.label} className="nodrag" onClick={() => onChange({actionArgs: a.label})}
                                title={a.desc}
                                style={{
                                    fontSize: 10,
                                    padding: "1px 6px",
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    fontFamily: MONO,
                                    backgroundColor: args === a.label ? "#22c55e22" : "#111",
                                    color: args === a.label ? "#22c55e" : "#555",
                                    border: `1px solid ${args === a.label ? "#22c55e44" : "#252525"}`,
                                }}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
