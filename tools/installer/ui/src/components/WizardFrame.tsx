import React from "react";
import {TitleBar} from "./TitleBar";

interface WizardFrameProps {
    /** Text in the custom window bar (frameless window). */
    windowTitle: string;
    /** Window-close handler — same semantics as Cancel. */
    onClose: () => void;
    /** Big friendly light-weight heading in the colored band. */
    title: string;
    /** Small reassuring line under it. */
    subtitle: string;
    children: React.ReactNode;
    /** Footer buttons, right-aligned in given order. */
    footer: React.ReactNode;
}

/**
 * Metro corporate chrome: custom window bar + a solid accent band with a big
 * thin heading that sounds like it cares about you, flat content, flat
 * button strip.
 */
export function WizardFrame({windowTitle, onClose, title, subtitle, children, footer}: WizardFrameProps) {
    return (
        <div className="flex flex-col h-full bg-bg-base">
            <TitleBar title={windowTitle} onClose={onClose}/>
            <div className="flex-shrink-0 h-[78px] px-6 bg-accent flex flex-col justify-center select-none">
                <div className="text-[26px] font-light leading-tight text-white">{title}</div>
                <div className="text-[11px] text-white/75 mt-0.5">{subtitle}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
                {children}
            </div>
            <div className="flex-shrink-0 flex items-center justify-end gap-1.5 px-4 py-3 bg-bg-card">
                {footer}
            </div>
        </div>
    );
}

/** Flat content section: tiny shouty caption + a solid block underneath. */
export function GroupBox({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted mb-1">
                {label}
            </div>
            <div className="bg-bg-card px-3 py-2.5">{children}</div>
        </div>
    );
}
