// Full command metadata editor for the Entry node.
// Fields map 1-to-1 with Rhai directive comments (// @trigger, etc.).

import type {ScriptNodeData} from "../NodeDefinitions";

const MONO = '"JetBrains Mono","Fira Code",monospace';

const INPUT: React.CSSProperties = {
    backgroundColor: "#0a0a0a", color: "#c0c0c0",
    border: "1px solid #252525", borderRadius: 3,
    padding: "3px 7px", fontSize: 11, fontFamily: MONO,
    width: "100%", outline: "none",
};

function Label({text}: { text: string }) {
    return (
        <p style={{
            fontSize: 9, color: "#444", margin: "0 0 3px",
            textTransform: "uppercase", letterSpacing: "0.05em"
        }}>{text}</p>
    );
}

function Field({label, children, style}: {
    label: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
    return (
        <div style={style}>
            <Label text={label}/>
            {children}
        </div>
    );
}

interface Props {
    data: ScriptNodeData;
    onChange: (patch: Partial<ScriptNodeData>) => void;
}

export function EntryConfig({data, onChange}: Props) {
    return (
        <div className="flex flex-col gap-2">
            <Field label="trigger">
                <input value={data.trigger ?? ""} onChange={(e) => onChange({trigger: e.target.value})}
                       placeholder="!command" style={INPUT} className="nodrag"/>
            </Field>

            <Field label="aliases">
                <input value={data.aliases ?? ""} onChange={(e) => onChange({aliases: e.target.value})}
                       placeholder="!cmd, !c" style={INPUT} className="nodrag"/>
            </Field>

            <Field label="description">
                <input value={data.description ?? ""} onChange={(e) => onChange({description: e.target.value})}
                       placeholder="What this command does" style={INPUT} className="nodrag"/>
            </Field>

            <div className="flex gap-1.5">
                <Field label="roles" style={{flex: 1}}>
                    <select value={data.roles ?? "everyone"} onChange={(e) => onChange({roles: e.target.value})}
                            style={INPUT} className="nodrag">
                        <option value="everyone">Everyone</option>
                        <option value="mod">Mod+</option>
                        <option value="sub">Subscribers</option>
                        <option value="owner">Owner only</option>
                    </select>
                </Field>
                <Field label="platform" style={{flex: 1}}>
                    <select value={data.platform ?? "all"}
                            onChange={(e) => onChange({platform: e.target.value as ScriptNodeData["platform"]})}
                            style={INPUT} className="nodrag">
                        <option value="all">All</option>
                        <option value="twitch">Twitch</option>
                        <option value="youtube">YouTube</option>
                    </select>
                </Field>
            </div>

            <div className="flex gap-1.5">
                <Field label="cooldown (s)" style={{flex: 1}}>
                    <input type="number" min={0} value={data.cooldown ?? 0}
                           onChange={(e) => onChange({cooldown: Math.max(0, +e.target.value)})}
                           style={INPUT} className="nodrag"/>
                </Field>
                <Field label="user cd (s)" style={{flex: 1}}>
                    <input type="number" min={0} value={data.userCooldown ?? 0}
                           onChange={(e) => onChange({userCooldown: Math.max(0, +e.target.value)})}
                           style={INPUT} className="nodrag"/>
                </Field>
            </div>
        </div>
    );
}
