// Node type definitions for the visual scripting canvas.

export type NodeKind =
    | "entry"      // script entry point
    | "say"        // chat.say("...")
    | "reply"      // chat.reply("...")
    | "action"     // queue.add(), counter.inc(), gd.level.fetch(), etc.
    | "condition"  // if ... { } with true/false output ports
    | "return"     // return; (stop execution)
    | "random";    // say random "a", "b", "c"

export interface NodeData {
    kind: NodeKind;
    label: string;
    message?: string;          // say / reply / random
    action?: string;          // action: "queue.add", "counter.inc", etc.
    condition?: string;          // condition expression
    messages?: string[];        // random node message list
}

// Accent colour per node kind
export const NODE_COLORS: Record<NodeKind, string> = {
    entry: "#818cf8",  // indigo
    say: "#3b82f6",  // blue
    reply: "#6366f1",  // violet
    action: "#22c55e",  // green
    condition: "#ec4899",  // pink
    return: "#555",     // gray
    random: "#8b5cf6",  // purple
};

// Category label shown as a badge on each node
export const NODE_CATEGORY: Record<NodeKind, string> = {
    entry: "Entry",
    say: "Message",
    reply: "Message",
    action: "Action",
    condition: "Flow",
    return: "Flow",
    random: "Message",
};

// Port IDs used by ReactFlow edges
export const PORTS = {
    exec_in: "exec-in",
    exec_out: "exec-out",
    true_out: "true-out",
    false_out: "false-out",
} as const;
