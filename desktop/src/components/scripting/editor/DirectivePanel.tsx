// Command settings panel — replaces raw // @directive lines with a clean UI.

import {useRef, useState} from "react";
import type {Directive, DirectiveListener} from "../../../lib/scripting/directives";
import {TwitchRewardPicker} from "../../TwitchRewardPicker";
import {EventListenerPicker} from "../../EventListenerPicker";

const OPEN_KEY = "gdlqbot.directive_panel_open";

interface Props {
    directive: Directive;
    onChange: (d: Directive) => void;
    readOnly?: boolean;
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
    backgroundColor: "#0d0d0d",
    border: "1px solid #1e1e1e",
    borderRadius: 5,
    color: "#c0c0c0",
    fontSize: 12,
    padding: "5px 9px",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.1s",
};

function Field({label, children, grow}: { label: string; children: React.ReactNode; grow?: boolean }) {
    return (
        <div style={{display: "flex", flexDirection: "column", gap: 4, flex: grow ? "1 1 0" : undefined, minWidth: 0}}>
      <span style={{
          fontSize: 10,
          color: "#3a3a3a",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase"
      }}>
        {label}
      </span>
            {children}
        </div>
    );
}

// Button-group style selector (platform / roles)
function SegmentButton({label, active, onClick, disabled}: {
    label: string;
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 4,
                border: active ? "1px solid #3a3a5a" : "1px solid #1e1e1e",
                backgroundColor: active ? "#1a1a2e" : "transparent",
                color: active ? "#a5b4fc" : "#444",
                cursor: disabled ? "default" : "pointer",
                transition: "all 0.1s",
                flexShrink: 0,
            }}
            onMouseEnter={(e) => {
                if (!active && !disabled) {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                    e.currentTarget.style.color = "#888";
                }
            }}
            onMouseLeave={(e) => {
                if (!active && !disabled) {
                    e.currentTarget.style.borderColor = "#1e1e1e";
                    e.currentTarget.style.color = "#444";
                }
            }}
        >
            {label}
        </button>
    );
}

// Number stepper with + / – buttons
function NumberStepper({value, onChange, min = 0, disabled}: {
    value: number;
    onChange: (n: number) => void;
    min?: number;
    disabled?: boolean;
}) {
    const BtnStyle: React.CSSProperties = {
        width: 22, height: 26, fontSize: 14, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "#111", border: "1px solid #1e1e1e", borderRadius: 3,
        color: "#555", cursor: disabled ? "default" : "pointer", flexShrink: 0,
    };
    return (
        <div style={{display: "flex", alignItems: "center", gap: 3}}>
            <button style={BtnStyle}
                    onClick={() => !disabled && onChange(Math.max(min, value - 1))}
                    onMouseEnter={(e) => {
                        if (!disabled) e.currentTarget.style.color = "#c0c0c0";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#555";
                    }}>
                −
            </button>
            <input
                type="number" min={min} value={value}
                onChange={(e) => !disabled && onChange(Math.max(min, parseInt(e.target.value) || 0))}
                readOnly={disabled}
                style={{...INPUT, width: 52, textAlign: "center", padding: "4px 6px"}}
                onFocus={(e) => {
                    e.target.style.borderColor = "#2a2a2a";
                }}
                onBlur={(e) => {
                    e.target.style.borderColor = "#1e1e1e";
                }}
            />
            <button style={BtnStyle}
                    onClick={() => !disabled && onChange(value + 1)}
                    onMouseEnter={(e) => {
                        if (!disabled) e.currentTarget.style.color = "#c0c0c0";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#555";
                    }}>
                +
            </button>
        </div>
    );
}

// One row in the repeatable listener list — a type selector plus whichever
// config picker matches it.
function ListenerRow({listener, readOnly, onChange, onRemove}: {
    listener: DirectiveListener;
    readOnly?: boolean;
    onChange: (l: DirectiveListener) => void;
    onRemove: () => void;
}) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 8,
            borderRadius: 6,
            backgroundColor: "#0a0a0a",
            border: "1px solid #1a1a1a"
        }}>
            <div className="flex items-center gap-2">
                <div style={{display: "flex", gap: 3}}>
                    {([
                        ["twitch_redemption", "Twitch redemption"],
                        ["event", "Internal event"],
                    ] as const).map(([val, label]) => (
                        <SegmentButton key={val}
                                       label={label}
                                       active={listener.type === val}
                                       disabled={readOnly}
                                       onClick={() => !readOnly && onChange({
                                           type: val,
                                           config: listener.type === val ? listener.config : ""
                                       })}
                        />
                    ))}
                </div>
                {!readOnly && (
                    <button onClick={onRemove} className="text-xs ml-auto"
                            style={{color: "#333", background: "none", border: "none", cursor: "pointer"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#f87171";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#333";
                            }}>
                        Remove
                    </button>
                )}
            </div>
            {listener.type === "twitch_redemption" ? (
                <TwitchRewardPicker value={listener.config} disabled={readOnly}
                                    onChange={(title) => onChange({...listener, config: title})}/>
            ) : (
                <EventListenerPicker value={listener.config} disabled={readOnly}
                                     onChange={(name) => onChange({...listener, config: name})}/>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DirectivePanel({directive: d, onChange, readOnly}: Props) {
    const [open, setOpen] = useState(() => {
        try {
            return localStorage.getItem(OPEN_KEY) !== "0";
        } catch {
            return true;
        }
    });

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try {
            localStorage.setItem(OPEN_KEY, next ? "1" : "0");
        } catch { /* ignore */
        }
    };

    const upd = (patch: Partial<Directive>) => onChange({...d, ...patch});

    // Alias chip management
    const [aliasInput, setAliasInput] = useState("");
    const aliasRef = useRef<HTMLInputElement>(null);

    const addAlias = () => {
        const v = aliasInput.trim().replace(/^!/, "");
        if (!v) return;
        const existing = d.aliases ?? [];
        const next = "!" + v;
        if (!existing.includes(next)) upd({aliases: [...existing, next]});
        setAliasInput("");
        aliasRef.current?.focus();
    };

    const removeAlias = (a: string) =>
        upd({aliases: (d.aliases ?? []).filter((x) => x !== a)});

    const roles = d.roles ?? [];
    const everyone = roles.length === 0;
    const platform = d.platform ?? "all";

    return (
        <div style={{backgroundColor: "#080808", borderBottom: "1px solid #111", flexShrink: 0}}>

            {/* ── Collapse header ── */}
            <button onClick={toggle} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px", cursor: "pointer", border: "none", background: "none",
                color: "#2a2a2a", fontSize: 10, fontWeight: 600, letterSpacing: "0.07em",
                textTransform: "uppercase", textAlign: "left",
            }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#555";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#2a2a2a";
                    }}>
                <span style={{
                    display: "inline-block",
                    transition: "transform 0.15s",
                    transform: open ? "rotate(90deg)" : "none",
                    fontSize: 8
                }}>▶</span>
                Settings

                {/* Collapsed summary */}
                {!open && (
                    <div style={{display: "flex", alignItems: "center", gap: 6, marginLeft: 4, flexWrap: "wrap"}}>
                        {d.trigger && (
                            <code style={{
                                fontSize: 11,
                                color: "#555",
                                fontWeight: 400,
                                letterSpacing: 0,
                                textTransform: "none"
                            }}>
                                {d.trigger}
                            </code>
                        )}
                        {(d.aliases ?? []).length > 0 && (
                            <span style={{
                                fontSize: 10,
                                color: "#333",
                                fontWeight: 400,
                                letterSpacing: 0,
                                textTransform: "none"
                            }}>
                +{d.aliases!.length} alias{d.aliases!.length > 1 ? "es" : ""}
              </span>
                        )}
                        {platform !== "all" && (
                            <span style={{
                                fontSize: 10,
                                color: "#333",
                                fontWeight: 400,
                                letterSpacing: 0,
                                textTransform: "none"
                            }}>
                {platform}
              </span>
                        )}
                        {!everyone && (
                            <span style={{
                                fontSize: 10,
                                color: "#555",
                                fontWeight: 400,
                                letterSpacing: 0,
                                textTransform: "none"
                            }}>
                {roles.join(", ")}
              </span>
                        )}
                    </div>
                )}
            </button>

            {/* ── Fields ── */}
            {open && (
                <div style={{padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 12}}>

                    {/* Row 1: Trigger + Aliases */}
                    <div style={{display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start"}}>
                        <Field label="Trigger">
                            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                                <span style={{
                                    color: "#4ade80",
                                    fontSize: 12,
                                    fontFamily: "monospace",
                                    flexShrink: 0
                                }}>!</span>
                                <input
                                    value={(d.trigger ?? "").replace(/^!/, "")}
                                    onChange={(e) => upd({trigger: e.target.value ? `!${e.target.value.replace(/^!/, "")}` : ""})}
                                    readOnly={readOnly}
                                    placeholder="command"
                                    style={{...INPUT, width: 110}}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = "#2a2a2a";
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = "#1e1e1e";
                                    }}
                                />
                            </div>
                        </Field>

                        <Field label="Aliases" grow>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                flexWrap: "wrap",
                                minHeight: 30
                            }}>
                                {(d.aliases ?? []).map((a) => (
                                    <span key={a} style={{
                                        display: "inline-flex", alignItems: "center", gap: 3,
                                        padding: "3px 7px", borderRadius: 4,
                                        backgroundColor: "#111", border: "1px solid #1e1e1e",
                                        fontSize: 11, color: "#82aaff", fontFamily: "monospace",
                                    }}>
                    {a}
                                        {!readOnly && (
                                            <button onClick={() => removeAlias(a)} style={{
                                                background: "none", border: "none", color: "#333",
                                                cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 12,
                                            }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.color = "#f87171";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.color = "#333";
                                                    }}>×</button>
                                        )}
                  </span>
                                ))}
                                {!readOnly && (
                                    <div style={{display: "flex", alignItems: "center", gap: 2}}>
                                        <span style={{color: "#2a2a2a", fontSize: 11, fontFamily: "monospace"}}>!</span>
                                        <input
                                            ref={aliasRef}
                                            value={aliasInput}
                                            onChange={(e) => setAliasInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === ",") {
                                                    e.preventDefault();
                                                    addAlias();
                                                }
                                                if (e.key === "Backspace" && !aliasInput && (d.aliases ?? []).length > 0) {
                                                    const aliases = d.aliases!;
                                                    removeAlias(aliases[aliases.length - 1]);
                                                }
                                            }}
                                            placeholder="add…"
                                            style={{...INPUT, width: 70, fontSize: 11, padding: "4px 6px"}}
                                            onFocus={(e) => {
                                                e.target.style.borderColor = "#2a2a2a";
                                            }}
                                            onBlur={() => {
                                                if (aliasInput.trim()) addAlias(); else setAliasInput("");
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </Field>
                    </div>

                    {/* Row 2: Description */}
                    <Field label="Description" grow>
                        <input
                            value={d.description ?? ""}
                            onChange={(e) => upd({description: e.target.value})}
                            readOnly={readOnly}
                            placeholder="What does this command do?"
                            style={{...INPUT, width: "100%"}}
                            onFocus={(e) => {
                                e.target.style.borderColor = "#2a2a2a";
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = "#1e1e1e";
                            }}
                        />
                    </Field>

                    {/* Row 3: Platform + Roles */}
                    <div style={{display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start"}}>
                        <Field label="Platform">
                            <div style={{display: "flex", gap: 3}}>
                                {(["all", "twitch", "youtube"] as const).map((p) => (
                                    <SegmentButton key={p}
                                                   label={p === "all" ? "All" : p === "twitch" ? "Twitch" : "YouTube"}
                                                   active={platform === p}
                                                   disabled={readOnly}
                                                   onClick={() => !readOnly && upd({platform: p})}
                                    />
                                ))}
                            </div>
                        </Field>

                        <Field label="Allowed roles">
                            <div style={{display: "flex", gap: 3, flexWrap: "wrap"}}>
                                {([
                                    ["everyone", "Everyone"],
                                    ["mod", "Mod"],
                                    ["owner", "Owner"],
                                    ["sub", "Sub"],
                                ] as const).map(([val, label]) => {
                                    const isEveryone = val === "everyone";
                                    const checked = isEveryone ? everyone : roles.includes(val);
                                    return (
                                        <SegmentButton key={val}
                                                       label={label}
                                                       active={checked}
                                                       disabled={readOnly}
                                                       onClick={() => {
                                                           if (readOnly) return;
                                                           if (isEveryone) {
                                                               upd({roles: []});
                                                               return;
                                                           }
                                                           const next = checked ? roles.filter((r) => r !== val) : [...roles, val];
                                                           upd({roles: next});
                                                       }}
                                        />
                                    );
                                })}
                            </div>
                        </Field>
                    </div>

                    {/* Row 4: Cooldowns */}
                    <div style={{display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start"}}>
                        <Field label="Global cooldown">
                            <div style={{display: "flex", alignItems: "center", gap: 6}}>
                                <NumberStepper value={d.cooldown ?? 0} onChange={(n) => upd({cooldown: n})}
                                               disabled={readOnly}/>
                                <span style={{fontSize: 10, color: "#2a2a2a"}}>sec</span>
                            </div>
                        </Field>

                        <Field label="Per-user cooldown">
                            <div style={{display: "flex", alignItems: "center", gap: 6}}>
                                <NumberStepper value={d.user_cooldown ?? 0} onChange={(n) => upd({user_cooldown: n})}
                                               disabled={readOnly}/>
                                <span style={{fontSize: 10, color: "#2a2a2a"}}>sec</span>
                            </div>
                        </Field>
                    </div>

                    {/* Row 5: Chat trigger toggle + listeners — how this command can fire.
                        Chat and any number of listeners are independent; turning chat off
                        doesn't require having a listener (though then nothing invokes it),
                        and a command can have several listeners of either kind at once. */}
                    <Field label="Chat trigger">
                        <div style={{display: "flex", gap: 3}}>
                            {([[true, "On"], [false, "Off"]] as const).map(([val, label]) => (
                                <SegmentButton key={String(val)}
                                               label={label}
                                               active={(d.chatEnabled ?? true) === val}
                                               disabled={readOnly}
                                               onClick={() => !readOnly && upd({chatEnabled: val})}
                                />
                            ))}
                        </div>
                        {d.chatEnabled === false && (
                            <span style={{fontSize: 10, color: "#2a2a2a"}}>
                                Trigger/aliases above are ignored — this command only fires from listeners below.
                            </span>
                        )}
                    </Field>

                    <Field label="Listeners" grow>
                        <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                            {(d.listeners ?? []).map((listener, i) => (
                                <ListenerRow
                                    key={i}
                                    listener={listener}
                                    readOnly={readOnly}
                                    onChange={(next) => {
                                        const listeners = [...(d.listeners ?? [])];
                                        listeners[i] = next;
                                        upd({listeners});
                                    }}
                                    onRemove={() => {
                                        const listeners = (d.listeners ?? []).filter((_, j) => j !== i);
                                        upd({listeners});
                                    }}
                                />
                            ))}
                            {!readOnly && (
                                <button
                                    onClick={() => upd({
                                        listeners: [...(d.listeners ?? []), {
                                            type: "event",
                                            config: ""
                                        }]
                                    })}
                                    className="text-xs self-start px-2 py-1 rounded"
                                    style={{
                                        color: "#555",
                                        border: "1px dashed #2a2a2a",
                                        background: "none",
                                        cursor: "pointer"
                                    }}>
                                    + Add listener
                                </button>
                            )}
                        </div>
                    </Field>

                </div>
            )}
        </div>
    );
}
