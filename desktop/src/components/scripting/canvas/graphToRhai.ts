// Convert a ReactFlow node graph to a Rhai script.
// The entry node emits // @directive comment lines; all other nodes emit Rhai code.

import type {Edge, Node} from "reactflow";
import type {ScriptNodeData} from "./NodeDefinitions";
import {PORT} from "./NodeDefinitions";

// Use backtick strings for Rhai interpolation when message contains ${...}
function rhaiStr(s: string): string {
    return s.includes("${") ? `\`${s}\`` : JSON.stringify(s);
}

function nextNode(id: string, portId: string, edges: Edge[], nodes: Node<ScriptNodeData>[]): Node<ScriptNodeData> | null {
    const edge = edges.find((e) => e.source === id && e.sourceHandle === portId);
    if (!edge) return null;
    return nodes.find((n) => n.id === edge.target) ?? null;
}

function nodeToRhai(
    node: Node<ScriptNodeData>,
    edges: Edge[],
    nodes: Node<ScriptNodeData>[],
    indent: string,
    visited: Set<string>,
): string {
    if (visited.has(node.id)) return `${indent}// (cycle)`;
    visited.add(node.id);

    const {kind, message, action, actionArgs, condition, messages} = node.data;
    const lines: string[] = [];
    const n = indent + "    ";

    switch (kind) {
        case "entry": {
            const d = node.data;
            lines.push(`// @trigger ${(d.trigger ?? "!command").trim()}`);
            lines.push(`// @alias ${(d.aliases ?? "").trim()}`);
            lines.push(`// @description ${(d.description ?? "").trim()}`);
            lines.push(`// @roles ${(d.roles ?? "everyone").trim()}`);
            lines.push(`// @platform ${d.platform ?? "all"}`);
            lines.push(`// @cooldown ${d.cooldown ?? 0}`);
            lines.push(`// @user_cooldown ${d.userCooldown ?? 0}`);
            lines.push(`// @editor visual`);
            lines.push("");
            break;
        }
        case "say":
            lines.push(`${indent}chat.say(${rhaiStr(message ?? "")});`);
            break;
        case "reply":
            lines.push(`${indent}chat.reply(${rhaiStr(message ?? "")});`);
            break;
        case "random": {
            const opts = (messages ?? []).map((m) => JSON.stringify(m)).join(", ");
            lines.push(`${indent}chat.say(rand.pick([${opts}]));`);
            break;
        }
        case "action": {
            const fn = action ?? "// unknown_action";
            const args = actionArgs ? actionArgs : "";
            lines.push(`${indent}${fn}(${args});`);
            break;
        }
        case "variable": {
            const name = node.data.varName ?? "value";
            const val = node.data.varValue ?? "()";
            lines.push(`${indent}let ${name} = ${val};`);
            break;
        }
        case "stop":
            lines.push(`${indent}return;`);
            return lines.join("\n");
        case "condition": {
            const expr = condition ?? "true";
            const trueNode = nextNode(node.id, PORT.trueOut, edges, nodes);
            const falseNode = nextNode(node.id, PORT.falseOut, edges, nodes);
            lines.push(`${indent}if ${expr} {`);
            if (trueNode) lines.push(nodeToRhai(trueNode, edges, nodes, n, new Set(visited)));
            lines.push(`${indent}}`);
            if (falseNode) {
                lines.push(`${indent}else {`);
                lines.push(nodeToRhai(falseNode, edges, nodes, n, new Set(visited)));
                lines.push(`${indent}}`);
            }
            break;
        }
        case "comment":
            // Floating notes — no code output.
            return "";
    }

    const next = nextNode(node.id, PORT.execOut, edges, nodes);
    if (next) lines.push(nodeToRhai(next, edges, nodes, indent, visited));

    return lines.join("\n");
}

// ── Flow persistence ──────────────────────────────────────────────────────────

const FLOW_TAG = "// @flow ";

function minimalNodes(nodes: Node<ScriptNodeData>[]) {
    return nodes.map((n) => ({
        id: n.id, type: n.type,
        position: n.position,
        data: n.data,
        zIndex: n.zIndex,
    }));
}

function minimalEdges(edges: Edge[]) {
    return edges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
        type: e.type, data: e.data,
    }));
}

/** Parse the // @flow line out of a saved script to restore the canvas. */
export function parseFlow(script: string): { nodes: any[]; edges: any[] } | null {
    for (const line of script.split("\n")) {
        if (line.startsWith(FLOW_TAG)) {
            try {
                return JSON.parse(line.slice(FLOW_TAG.length));
            } catch {
                return null;
            }
        }
    }
    return null;
}

export function graphToRhai(nodes: Node<ScriptNodeData>[], edges: Edge[]): string {
    const entry = nodes.find((n) => n.data.kind === "entry");
    if (!entry) return "// No entry node";

    const raw = nodeToRhai(entry, edges, nodes, "", new Set()).trim();

    // Embed node graph after the last // @directive line so it can be restored on reopen.
    const flowLine = FLOW_TAG + JSON.stringify({nodes: minimalNodes(nodes), edges: minimalEdges(edges)});
    const lines = raw.split("\n");
    const lastDir = lines.reduce((acc, l, i) => /^\s*\/\/\s*@/.test(l) ? i : acc, -1);

    if (lastDir >= 0) {
        lines.splice(lastDir + 1, 0, flowLine);
    } else {
        lines.unshift(flowLine);
    }

    return lines.join("\n") || "// (empty script)";
}

/** Convert a Condition object (from block-types) to a Rhai expression string */
export function conditionToExpr(cond: any): string {
    if (!cond) return "true";
    if (cond.type === "call") return `${cond.method}()`;
    if (cond.type === "not") return `!(${conditionToExpr(cond.condition)})`;
    if (cond.type === "and") return cond.conditions.map(conditionToExpr).join(" && ");
    if (cond.type === "or") return cond.conditions.map(conditionToExpr).join(" || ");
    return "true";
}
