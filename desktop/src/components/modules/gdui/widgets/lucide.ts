import * as LucideIcons from "lucide-react";
import type {ComponentType} from "react";

export type LucideIconComponent = ComponentType<{ size?: number; color?: string }>;

/** kebab-case ("arrow-up") -> PascalCase ("ArrowUp"), matching lucide-react export names. */
export function toLucideName(name: string): string {
    return name.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

/**
 * Resolves an icon name to its Lucide component. Accepts a bare kebab-case
 * name ("trash-2") or a namespaced one ("lucide:trash-2") — the namespace
 * prefix is stripped since this resolver only ever looks in the lucide set.
 * Returns undefined if the name doesn't match a known Lucide icon.
 */
export function resolveLucideIcon(name: string): LucideIconComponent | undefined {
    const bare = name.includes(":") ? name.split(":", 2)[1] : name;
    const componentName = toLucideName(bare);
    return (LucideIcons as unknown as Record<string, LucideIconComponent>)[componentName];
}
