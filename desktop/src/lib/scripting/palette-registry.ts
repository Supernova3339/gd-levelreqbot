import type {Block} from "../../components/scripting/visual/block-types";

export interface PaletteLeaf {
    kind: "leaf";
    label: string;
    desc: string;
    color: string;
    block: Block;
}

export interface PaletteCategory {
    kind: "category";
    label: string;
    color?: string;
    children: PaletteNode[];
}

export type PaletteNode = PaletteLeaf | PaletteCategory;

// Anchored to globalThis so Vite HMR re-evaluations of this module don't
// create a fresh empty array and lose (or duplicate) registered categories.
const REGISTRY_KEY = "__gdlqbot_palette__";
type G = typeof globalThis & { [REGISTRY_KEY]?: PaletteCategory[] };
if (!(globalThis as G)[REGISTRY_KEY]) (globalThis as G)[REGISTRY_KEY] = [];
const REGISTRY = (globalThis as G)[REGISTRY_KEY]!;

export function registerPaletteCategory(cat: PaletteCategory): void {
    const existing = REGISTRY.find((c) => c.label === cat.label);
    if (existing) {
        // Merge only children not already present — idempotent across HMR replays.
        for (const child of cat.children) {
            if (!existing.children.some((c) => c.label === child.label))
                existing.children.push(child);
        }
    } else {
        REGISTRY.push(cat);
    }
}

export function clearPaletteRegistry(): void {
    REGISTRY.length = 0;
}

export function getPaletteTree(): PaletteCategory[] {
    return REGISTRY;
}

export function flatLeaves(nodes: PaletteNode[]): PaletteLeaf[] {
    const out: PaletteLeaf[] = [];
    for (const n of nodes) {
        if (n.kind === "leaf") out.push(n);
        else out.push(...flatLeaves(n.children));
    }
    return out;
}

export function getNodeAt(tree: PaletteNode[], path: string[]): PaletteNode[] {
    let children: PaletteNode[] = tree;
    for (const segment of path) {
        const match = children.find(
            (n): n is PaletteCategory => n.kind === "category" && n.label === segment,
        );
        if (!match) return [];
        children = match.children;
    }
    return children;
}
