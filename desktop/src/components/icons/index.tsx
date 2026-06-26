import React from "react";

interface IconProps {
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

export function QueueIcon({size = 18, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p}>
            <rect x="1" y="2" width="16" height="2.5" rx="1.25" fill="currentColor"/>
            <rect x="1" y="7.75" width="16" height="2.5" rx="1.25" fill="currentColor"/>
            <rect x="1" y="13.5" width="16" height="2.5" rx="1.25" fill="currentColor"/>
        </svg>
    );
}

export function CommandsIcon({size = 18, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p}>
            <path d="M3 5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                  strokeLinejoin="round"/>
            <path d="M9 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
    );
}

export function GearIcon({size = 18, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...p}>
            <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.6"/>
            <path
                d="M9 1.5v1.8M9 14.7v1.8M1.5 9h1.8M14.7 9h1.8M3.7 3.7l1.27 1.27M13.03 13.03l1.27 1.27M3.7 14.3l1.27-1.27M13.03 4.97l1.27-1.27"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
            />
        </svg>
    );
}

export function ChevronRightIcon({size = 10, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 10 10" fill="none" {...p}>
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeLinejoin="round"/>
        </svg>
    );
}

export function ChevronDownIcon({size = 10, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 10 10" fill="none" {...p}>
            <path d="M2 3l3 4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeLinejoin="round"/>
        </svg>
    );
}

export function CloseIcon({size = 12, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 12 12" fill="none" {...p}>
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
    );
}

export function PlusIcon({size = 16, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
    );
}

export function SearchIcon({size = 14, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" {...p}>
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    );
}

export function CheckIcon({size = 10, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 10 10" fill="none" {...p}>
            <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                  strokeLinejoin="round"/>
        </svg>
    );
}

export function WarningIcon({size = 16, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
            <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
        </svg>
    );
}

export function InfoIcon({size = 16, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="5" r="0.75" fill="currentColor"/>
        </svg>
    );
}

export function DotIcon({size = 8, ...p}: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 8 8" fill="none" {...p}>
            <circle cx="4" cy="4" r="3" fill="currentColor"/>
        </svg>
    );
}
