// ─── Node type registry ────────────────────────────────────────────────────────
// Adding a new node type = add one entry here. No other files needed (except
// registering the component in NodeCanvas.NODE_TYPES_MAP).

export type NodeKind =
    | "entry"      // command entry point + directive metadata
    | "say"        // chat.say("...")
    | "reply"      // chat.reply("...")
    | "random"     // say random from list
    | "action"     // queue.add(), store.get(), etc.
    | "variable"   // let name = expression
    | "condition"  // if/else branch
    | "stop"       // return;
    | "comment";   // floating canvas note (no ports)

export interface NodeDef {
    kind: NodeKind;
    label: string;
    category: string;
    color: string;
    description: string;
    hasExecIn: boolean;
    hasExecOut: boolean;
    hasTrueFalse: boolean;
    config: "none" | "entry" | "message" | "condition" | "random" | "action" | "variable";
}

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
    entry: {
        kind: "entry", label: "Entry", category: "Script", color: "#818cf8",
        description: "Command trigger — execution starts here",
        hasExecIn: false, hasExecOut: true, hasTrueFalse: false,
        config: "entry",
    },
    say: {
        kind: "say", label: "chat.say", category: "Message", color: "#3b82f6",
        description: "Send a message in chat",
        hasExecIn: true, hasExecOut: true, hasTrueFalse: false,
        config: "message",
    },
    reply: {
        kind: "reply", label: "chat.reply", category: "Message", color: "#6366f1",
        description: "Reply with @username prefix",
        hasExecIn: true, hasExecOut: true, hasTrueFalse: false,
        config: "message",
    },
    random: {
        kind: "random", label: "say random", category: "Message", color: "#8b5cf6",
        description: "Pick one message at random",
        hasExecIn: true, hasExecOut: true, hasTrueFalse: false,
        config: "random",
    },
    action: {
        kind: "action", label: "action", category: "Action", color: "#22c55e",
        description: "Execute a library action",
        hasExecIn: true, hasExecOut: true, hasTrueFalse: false,
        config: "action",
    },
    variable: {
        kind: "variable", label: "let", category: "Script", color: "#c792ea",
        description: "Declare a local variable",
        hasExecIn: true, hasExecOut: true, hasTrueFalse: false,
        config: "variable",
    },
    condition: {
        kind: "condition", label: "if", category: "Flow", color: "#ec4899",
        description: "Branch on a condition",
        hasExecIn: true, hasExecOut: false, hasTrueFalse: true,
        config: "condition",
    },
    stop: {
        kind: "stop", label: "stop", category: "Flow", color: "#555",
        description: "Halt script execution (return)",
        hasExecIn: true, hasExecOut: false, hasTrueFalse: false,
        config: "none",
    },
    comment: {
        kind: "comment", label: "Note", category: "Canvas", color: "#f59e0b",
        description: "A floating note on the canvas",
        hasExecIn: false, hasExecOut: false, hasTrueFalse: false,
        config: "none",
    },
};

export const PORT = {
    execIn: "exec-in",
    execOut: "exec-out",
    trueOut: "true-out",
    falseOut: "false-out",
} as const;

// Data stored on every node.
export interface ScriptNodeData {
    kind: NodeKind;
    // ── Entry node: directive metadata ──────────────────────────────────────────
    trigger?: string;
    aliases?: string;                          // comma-separated
    description?: string;
    roles?: string;                          // "everyone" | "mod" | "sub" | "owner"
    platform?: "all" | "twitch" | "youtube";
    cooldown?: number;
    userCooldown?: number;
    // ── Message nodes ────────────────────────────────────────────────────────────
    message?: string;
    messages?: string[];
    // ── Action node ──────────────────────────────────────────────────────────────
    action?: string;
    actionArgs?: string;
    // ── Variable node ────────────────────────────────────────────────────────────
    varName?: string;
    varValue?: string;
    // ── Condition node ───────────────────────────────────────────────────────────
    condition?: string;
    // ── Comment node ─────────────────────────────────────────────────────────────
    commentText?: string;
    commentColor?: string;
    commentOpacity?: number;                            // fill opacity 0.04–0.6, default 0.12
    commentLocked?: boolean;                           // prevents drag + resize when true
    commentWidth?: number;
    commentHeight?: number;
    commentStyle?: "note" | "comment" | "section";   // visual variant
}

export const CONDITION_PRESETS = [
    {label: "user.isMod()", value: "user.isMod()"},
    {label: "user.isSub()", value: "user.isSub()"},
    {label: "user.isStaff()", value: "user.isStaff()"},
    {label: "user.isBroadcaster()", value: "user.isBroadcaster()"},
    {label: "args.len() > 0", value: "args.len() > 0"},
    {label: "args.len() == 0", value: "args.len() == 0"},
    {label: "queue.isEmpty()", value: "queue.isEmpty()"},
    {label: "queue.has(args[0])", value: "queue.has(args[0])"},
    {label: "gd.isValidId(args[0])", value: "gd.isValidId(args[0])"},
];
