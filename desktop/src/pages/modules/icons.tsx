/**
 * Shared built-in icon registry for the module system.
 * All icons are duotone-style SVGs — opacity-layered fills using currentColor.
 * Used in catalog list, module detail, and the icon picker.
 */

import React from "react";
import * as LucideIcons from "lucide-react";

// ── SVG definitions ───────────────────────────────────────────────────────────

export const BUILTIN_SVG: Record<string, React.ReactElement> = {
    // Queue & Lists
    queue: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="2" y="4" width="14" height="2.2" rx="1.1" opacity="0.9"/>
            <rect x="2" y="8" width="10" height="2.2" rx="1.1" opacity="0.55"/>
            <rect x="2" y="12" width="12" height="2.2" rx="1.1" opacity="0.25"/>
        </svg>
    ),
    stack: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="4" y="12.5" width="10" height="3" rx="1" opacity="0.18"/>
            <rect x="2" y="8" width="14" height="3.5" rx="1.2" opacity="0.48"/>
            <rect x="2" y="3" width="14" height="4" rx="1.5" opacity="0.9"/>
        </svg>
    ),
    checklist: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="3" cy="4.8" r="1.5" opacity="0.9"/>
            <rect x="6.5" y="3.8" width="9.5" height="2" rx="1" opacity="0.9"/>
            <circle cx="3" cy="9.5" r="1.5" opacity="0.55"/>
            <rect x="6.5" y="8.5" width="7" height="2" rx="1" opacity="0.55"/>
            <circle cx="3" cy="14.2" r="1.5" opacity="0.25"/>
            <rect x="6.5" y="13.2" width="8" height="2" rx="1" opacity="0.25"/>
        </svg>
    ),

    // Social & Hype
    heart: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M9 16C9 16 1 11 1 6.5A4.5 4.5 0 0 1 9 5a4.5 4.5 0 0 1 8 1.5C17 11 9 16 9 16Z" opacity="0.15"/>
            <path d="M9 14.5C9 14.5 2.5 10 2.5 6.8A3.3 3.3 0 0 1 9 5.5a3.3 3.3 0 0 1 6.5 1.3C15.5 10 9 14.5 9 14.5Z"
                  opacity="0.85"/>
        </svg>
    ),
    star: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <polygon points="9,1.5 11.2,6.5 16.5,7.2 12.8,10.8 13.8,16.2 9,13.5 4.2,16.2 5.2,10.8 1.5,7.2 6.8,6.5"
                     opacity="0.2"/>
            <polygon points="9,3 11,7 16,7.5 12.5,11 13.5,15.5 9,13 4.5,15.5 5.5,11 2,7.5 7,7" opacity="0.9"/>
        </svg>
    ),
    crown: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M2 14L4 5.5L7.5 10.5L9 3.5L10.5 10.5L14 5.5L16 14Z" opacity="0.15"/>
            <path d="M3 13L5 6.5L7.8 11L9 5L10.2 11L13 6.5L15 13Z" opacity="0.8"/>
            <rect x="2.5" y="13" width="13" height="2.5" rx="1.2" opacity="0.8"/>
            <circle cx="4" cy="6.5" r="1.1" opacity="0.9"/>
            <circle cx="9" cy="4.5" r="1.1" opacity="0.9"/>
            <circle cx="14" cy="6.5" r="1.1" opacity="0.9"/>
        </svg>
    ),
    trophy: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M4.5 2H13.5V9A4.5 4.5 0 0 1 4.5 9Z" opacity="0.15"/>
            <path d="M5.5 3H12.5V8.5A3.5 3.5 0 0 1 5.5 8.5Z" opacity="0.75"/>
            <path d="M2 3.5H5.5V7C3.8 7 2 6 2 4.5Z" opacity="0.35"/>
            <path d="M12.5 3.5H16V4.5C16 6 14.2 7 12.5 7Z" opacity="0.35"/>
            <rect x="8.2" y="12" width="1.6" height="2" rx="0.8" opacity="0.55"/>
            <rect x="8" y="11.5" width="2" height="1" rx="0.5" opacity="0.35"/>
            <rect x="5.5" y="14" width="7" height="2" rx="1" opacity="0.8"/>
        </svg>
    ),
    fire: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path
                d="M9 17C5.7 17 3 14.3 3 11C3 7 6 5 7 3C7.3 4.8 8 6 9.5 7.5C9.5 5.5 10 3.5 11.5 1.5C14.5 4 15 8 15 11C15 14.3 12.3 17 9 17Z"
                opacity="0.15"/>
            <path
                d="M9 16C6.2 16 4 13.8 4 11C4 8 6.5 6.5 7.5 5C7.7 6.5 8.3 7.8 9.5 9C9.3 7.5 9.7 5.5 11 4C13.5 6 14 9 14 11C14 13.8 11.8 16 9 16Z"
                opacity="0.55"/>
            <path
                d="M9 15C7 15 5.5 13.5 5.5 11.5C5.5 9.5 7 8.5 8 7.5C8.2 9 9 9.8 9.5 10.5C9.5 9.5 10 8.5 10.5 7.5C12.5 9 12.5 10.5 12.5 11.5C12.5 13.5 11 15 9 15Z"
                opacity="0.9"/>
        </svg>
    ),
    shield: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M9 2L2 4.5V10C2 13.8 5.2 16.5 9 17C12.8 16.5 16 13.8 16 10V4.5Z" opacity="0.15"/>
            <path d="M9 3.5L3.5 5.5V10C3.5 13 6.2 15.2 9 15.7C11.8 15.2 14.5 13 14.5 10V5.5Z" opacity="0.65"/>
            <path d="M9 6.5L6 7.8V10C6 12 7.2 13.5 9 14C10.8 13.5 12 12 12 10V7.8Z" opacity="0.9"/>
        </svg>
    ),

    // Media
    music: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M7 3v9.5A3.5 3.5 0 1 0 9 16V6.5l5-1V3H7Z" opacity="0.2"/>
            <path d="M7.5 4v9A3 3 0 1 0 9.5 16V7l4-.8V4Z" opacity="0.9"/>
        </svg>
    ),
    headphones: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path
                d="M9 2C5 2 2 5.2 2 9V14C2 14.6 2.4 15 3 15H5V10H3V9A6 6 0 0 1 15 9V10H13V15H15C15.6 15 16 14.6 16 14V9C16 5.2 13 2 9 2Z"
                opacity="0.18"/>
            <path
                d="M9 3.5C6 3.5 3.5 6 3.5 9V10.5H5.5V9C5.5 6.8 7 5 9 5S12.5 6.8 12.5 9V10.5H14.5V9C14.5 6 12 3.5 9 3.5Z"
                opacity="0.5"/>
            <rect x="2.5" y="10" width="3" height="5" rx="1.5" opacity="0.9"/>
            <rect x="12.5" y="10" width="3" height="5" rx="1.5" opacity="0.9"/>
        </svg>
    ),
    mic: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="6.5" y="1.5" width="5" height="9" rx="2.5" opacity="0.18"/>
            <rect x="7" y="2" width="4" height="8" rx="2" opacity="0.85"/>
            <path d="M5 9.5C5 12 6.8 14 9 14S13 12 13 9.5" fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" opacity="0.65"/>
            <rect x="8.2" y="14" width="1.6" height="2.5" rx="0.8" opacity="0.6"/>
            <rect x="6" y="16" width="6" height="1.5" rx="0.75" opacity="0.5"/>
        </svg>
    ),
    play: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="9" cy="9" r="8" opacity="0.12"/>
            <circle cx="9" cy="9" r="6.5" opacity="0.22"/>
            <path d="M7 5.5L14 9L7 12.5Z" opacity="0.9"/>
        </svg>
    ),

    // Economy
    coins: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="9" cy="9" r="7.5" opacity="0.1"/>
            <circle cx="9" cy="9" r="5.5" opacity="0.28"/>
            <circle cx="9" cy="9" r="3.5" opacity="0.6"/>
            <circle cx="9" cy="9" r="2" opacity="0.95"/>
        </svg>
    ),
    gift: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="2" y="7" width="14" height="9.5" rx="1.5" opacity="0.18"/>
            <rect x="2.5" y="7.5" width="13" height="8.5" rx="1" opacity="0.65"/>
            <rect x="2" y="5" width="14" height="3" rx="1" opacity="0.85"/>
            <rect x="8.2" y="5" width="1.6" height="11" opacity="0.9"/>
            <path d="M9 5C9 5 6.5 4.5 6.5 2.5A1.5 1.5 0 0 1 9 2.5Z" opacity="0.7"/>
            <path d="M9 5C9 5 11.5 4.5 11.5 2.5A1.5 1.5 0 0 0 9 2.5Z" opacity="0.7"/>
        </svg>
    ),
    diamond: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M9 16L1 8L4.5 2H13.5L17 8Z" opacity="0.15"/>
            <path d="M9 14.5L2.5 8L5.5 3H12.5L15.5 8Z" opacity="0.5"/>
            <path d="M9 12.5L5 8L7 5H11L13 8Z" opacity="0.9"/>
        </svg>
    ),
    ticket: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="1" y="5.5" width="16" height="7" rx="1.5" opacity="0.15"/>
            <rect x="1.5" y="6" width="15" height="6" rx="1" opacity="0.7"/>
            <circle cx="5.5" cy="9" r="2.2" fill="#0d0d0d" opacity="0.8"/>
            <rect x="8.5" y="7" width="7" height="1.5" rx="0.75" opacity="0.9"/>
            <rect x="8.5" y="9.5" width="5" height="1.5" rx="0.75" opacity="0.6"/>
        </svg>
    ),

    // Analytics
    polls: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="3" y="12" width="3" height="4" rx="0.5" opacity="0.35"/>
            <rect x="7.5" y="7" width="3" height="9" rx="0.5" opacity="0.6"/>
            <rect x="12" y="2" width="3" height="14" rx="0.5" opacity="0.9"/>
        </svg>
    ),
    trending: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round"
             strokeLinejoin="round">
            <path d="M2 14L6.5 9L9.5 12L14 6" strokeWidth="1.8" opacity="0.5"/>
            <path d="M2.5 13.5L7 9L10 12L14.5 5.5" strokeWidth="1.8" opacity="0.9"/>
            <path d="M11.5 5.5H14.5V8.5" strokeWidth="1.8" opacity="0.9"/>
        </svg>
    ),
    users: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="13" cy="6.5" r="2.5" opacity="0.28"/>
            <path d="M10.5 15.5C10.5 13 12 11.5 13 11.5C15 11.5 17 12.5 17 15.5Z" opacity="0.28"/>
            <circle cx="7" cy="6.5" r="3" opacity="0.9"/>
            <path d="M1.5 15.5C1.5 12.5 4 11 7 11S12.5 12.5 12.5 15.5Z" opacity="0.7"/>
        </svg>
    ),
    target: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="9" cy="9" r="8" opacity="0.1"/>
            <circle cx="9" cy="9" r="5.5" opacity="0.25"/>
            <circle cx="9" cy="9" r="3.5" opacity="0.55"/>
            <circle cx="9" cy="9" r="1.5" opacity="0.95"/>
        </svg>
    ),

    // Utility
    layers: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 11l7 4 7-4" opacity="0.5"/>
            <path d="M2 7l7 4 7-4M9 3 2 7l7 4 7-4-7-4Z" opacity="0.9"/>
        </svg>
    ),
    clock: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round">
            <circle cx="9" cy="9" r="7.5" fill="currentColor" fillOpacity="0.08" strokeWidth="1.3" strokeOpacity="0.5"/>
            <circle cx="9" cy="9" r="7.5" strokeWidth="1.3" strokeOpacity="0.6"/>
            <path d="M9 5.5V9.5L12 11.5" strokeWidth="1.7" strokeOpacity="0.9" strokeLinejoin="round"/>
        </svg>
    ),
    bell: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M9 1.5C6 1.5 3.5 4 3.5 7V12.5L2 14H16L14.5 12.5V7C14.5 4 12 1.5 9 1.5Z" opacity="0.15"/>
            <path d="M9 2.5C6.5 2.5 4.5 4.5 4.5 7V12L3 13.5H15L13.5 12V7C13.5 4.5 11.5 2.5 9 2.5Z" opacity="0.75"/>
            <path d="M7 14A2 2 0 0 0 11 14Z" opacity="0.8"/>
            <rect x="8.2" y="0.5" width="1.6" height="2.5" rx="0.8" opacity="0.7"/>
        </svg>
    ),
    settings: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <rect x="2" y="3.8" width="4" height="1.9" rx="0.95" opacity="0.9"/>
            <rect x="8" y="3.8" width="8" height="1.9" rx="0.95" opacity="0.3"/>
            <circle cx="7" cy="4.75" r="2.2" opacity="0.9"/>
            <rect x="2" y="8.1" width="8" height="1.9" rx="0.95" opacity="0.3"/>
            <rect x="12" y="8.1" width="4" height="1.9" rx="0.95" opacity="0.9"/>
            <circle cx="11" cy="9" r="2.2" opacity="0.9"/>
            <rect x="2" y="12.3" width="5" height="1.9" rx="0.95" opacity="0.3"/>
            <rect x="9" y="12.3" width="7" height="1.9" rx="0.95" opacity="0.9"/>
            <circle cx="8.5" cy="13.25" r="2.2" opacity="0.9"/>
        </svg>
    ),
    tag: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
            <path d="M2 2H9.5L16.5 9L10.5 15L3.5 8Z" opacity="0.15"/>
            <path d="M2.5 2.5H9.5L16 9L10.5 14L4 7.5Z" opacity="0.8"/>
            <circle cx="6" cy="6" r="1.5" opacity="0.4"/>
        </svg>
    ),
    custom: (
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.35"/>
            <path d="M7 9h4M9 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
        </svg>
    ),
};

// ── Category layout (for the picker) ─────────────────────────────────────────

export interface IconCategory {
    label: string;
    icons: string[]
}

export const BUILTIN_CATEGORIES: IconCategory[] = [
    {label: "Queue & Lists", icons: ["queue", "stack", "checklist"]},
    {label: "Social & Hype", icons: ["heart", "star", "crown", "trophy", "fire", "shield"]},
    {label: "Media", icons: ["music", "headphones", "mic", "play"]},
    {label: "Economy", icons: ["coins", "gift", "diamond", "ticket"]},
    {label: "Analytics", icons: ["polls", "trending", "users", "target"]},
    {label: "Utility", icons: ["layers", "clock", "bell", "settings", "tag", "custom"]},
];

// ── Color palette ─────────────────────────────────────────────────────────────

const ICON_COLORS: Record<string, string> = {
    queue: "#7c3aed", stack: "#6d28d9", checklist: "#8b5cf6",
    heart: "#e11d48", star: "#d97706", crown: "#b45309", trophy: "#92400e",
    fire: "#ea580c", shield: "#0284c7",
    music: "#2563eb", headphones: "#3b82f6", mic: "#1d4ed8", play: "#6366f1",
    coins: "#dc2626", gift: "#db2777", diamond: "#0891b2", ticket: "#7c3aed",
    polls: "#059669", trending: "#10b981", users: "#14b8a6", target: "#0f766e",
    layers: "#64748b", clock: "#475569", bell: "#6b7280", settings: "#4b5563",
    tag: "#6b7280", custom: "#4b5563",
};

export function iconColor(name: string): string {
    return ICON_COLORS[name] ?? "#555";
}

// ── Icon renderer ─────────────────────────────────────────────────────────────

type LucideComponent = (p: { size: number; strokeWidth: number }) => React.ReactNode;

function toLucideKey(name: string): keyof typeof LucideIcons {
    return name.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("") as keyof typeof LucideIcons;
}

/** Renders a built-in duotone SVG, falls back to Lucide, then a placeholder box. */
export function IconRenderer({name, size = 14}: { name: string; size?: number }) {
    const svg = BUILTIN_SVG[name];
    if (svg) {
        return React.cloneElement(svg, {width: size, height: size} as React.SVGProps<SVGSVGElement>);
    }
    const LucideComp = LucideIcons[toLucideKey(name)] as LucideComponent | undefined;
    if (LucideComp) {
        return <LucideComp size={size} strokeWidth={1.8}/>;
    }
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" opacity="0.35"/>
        </svg>
    );
}
