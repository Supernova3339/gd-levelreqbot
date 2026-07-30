// Public API for the scripting library.
// Scripts are raw Rhai text — no TypeScript AST or parser.
// Only directive metadata + display utilities live here.

export type {Directive} from "./directives";
export {
    parseDirectives, serializeDirectives, getBodyText,
    buildScript, rolesToDb, dbToRoles
} from "./directives";

export {highlightRhai} from "./rhai-highlighter";

export type {ScriptTemplate, TemplateCategory} from "./templates";
export {BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES} from "./templates";

export type {Snippet, SnippetCategory} from "./snippets";
export {BUILTIN_SNIPPETS, SNIPPET_CATEGORIES} from "./snippets";

export type {PaletteLeaf, PaletteCategory, PaletteNode} from "./palette-registry";
export {
    registerPaletteCategory, getPaletteTree,
    flatLeaves, getNodeAt
} from "./palette-registry";

// Side-effect: registers all default palette categories.
import "./default-palette";
