import type {Block, Condition} from "./block-types";

export function conditionToRhai(c: Condition): string {
    switch (c.kind) {
        case "call":
            return c.method.includes("(") ? c.method : `${c.method}()`;
        case "not":
            return `!${conditionToRhai(c.inner)}`;
        case "and":
            return `${conditionToRhai(c.left)} && ${conditionToRhai(c.right)}`;
        case "or":
            return `${conditionToRhai(c.left)} || ${conditionToRhai(c.right)}`;
        default:
            return "true";
    }
}

// Use backtick strings when the message contains ${...} interpolation.
function rhaiStr(s: string): string {
    return s.includes("${") ? `\`${s}\`` : JSON.stringify(s);
}

export function blockToRhai(b: Block, indent: string): string {
    const i = indent;
    const i2 = indent + "    ";
    switch (b.type) {
        case "say":
            return `${i}chat.say(${rhaiStr(b.message)});`;
        case "reply":
            return `${i}chat.reply(${rhaiStr(b.message)});`;
        case "stop":
            return `${i}return;`;
        case "action": {
            const call = b.name.includes("(") ? b.name : `${b.name}()`;
            return `${i}${call};`;
        }
        case "random": {
            const opts = b.messages.map(rhaiStr).join(", ");
            return `${i}chat.say(rand.pick([${opts}]));`;
        }
        case "require":
            return (
                `${i}if !(${conditionToRhai(b.condition)}) {\n` +
                `${i2}return;\n` +
                `${i}}`
            );
        case "if": {
            const thenLines = b.then.map((child) => blockToRhai(child, i2)).join("\n");
            const elseLines = b.else.map((child) => blockToRhai(child, i2)).join("\n");
            let out = `${i}if ${conditionToRhai(b.condition)} {\n${thenLines}\n${i}}`;
            if (b.else.length > 0) out += ` else {\n${elseLines}\n${i}}`;
            return out;
        }
        case "comment":
            return "";  // canvas-only, no Rhai output
    }
}

export function blocksToRhai(blocks: Block[]): string {
    return blocks.map((b) => blockToRhai(b, "")).join("\n");
}

// ── Visual state persistence ──────────────────────────────────────────────────
// Blocks are serialised as a JSON comment at the top of the saved script so
// the visual layout survives close/reopen without a separate DB column.

export const VISUAL_TAG = "// @visual ";

export function serializeBlocks(blocks: Block[]): string {
    return VISUAL_TAG + JSON.stringify(blocks);
}

export function parseVisualComment(script: string): Block[] | null {
    // The @visual line may appear after // @directive lines at the top.
    // Stop searching once we hit a non-comment, non-blank line.
    for (const line of script.split("\n")) {
        if (line.startsWith(VISUAL_TAG)) {
            try {
                return JSON.parse(line.slice(VISUAL_TAG.length));
            } catch {
                return null;
            }
        }
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("//")) break;
    }
    return null;
}

export function buildScript(blocks: Block[]): string {
    const rhai = blocksToRhai(blocks);
    if (blocks.length === 0) return rhai;
    return `${serializeBlocks(blocks)}\n${rhai}`;
}
