import {useState} from "react";
import type {AccordionSection, LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

function AccordionSectionWidget({section}: { section: AccordionSection }) {
    const [open, setOpen] = useState(section.default_open ?? false);

    return (
        <div style={{borderBottom: "1px solid #141414"}}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "none", border: "none", cursor: "pointer",
                    color: "#888", fontSize: 11, fontWeight: 600, textAlign: "left" as const,
                    letterSpacing: "0.04em", textTransform: "uppercase" as const,
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.color = "#bbb";
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.color = "#888";
                }}
            >
                {section.label}
                <svg
                    width="12" height="12" viewBox="0 0 12 12"
                    style={{transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s"}}
                >
                    <path d="M2 4.5L6 7.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                          fill="none"/>
                </svg>
            </button>
            {open && (
                <div style={{padding: "8px 12px 12px"}}>
                    <NodeRenderer node={section.content}/>
                </div>
            )}
        </div>
    );
}

export function Accordion({node}: { node: LayoutNode }) {
    const sections = node.accordion_sections ?? [];
    if (sections.length === 0) return null;

    return (
        <div style={{border: "1px solid #1a1a1a", borderRadius: 6, overflow: "hidden"}}>
            {sections.map((s, i) => (
                <AccordionSectionWidget key={i} section={s}/>
            ))}
        </div>
    );
}
