/**
 * Remote-control input bridge for the JetBrains /preview stream.
 *
 * The Rust API server (api/preview.rs) evals `window.__gdlqPreviewInput(ev)`
 * for each event forwarded from the preview page's input WebSocket. This module
 * replays them as synthesized DOM events — clicks, drags, scrolling, typing —
 * and draws a small remote-cursor overlay so the viewer can see where the
 * mouse is in the stream.
 *
 * Coordinates arrive as normalized fractions of the frame (0–1); multiply by
 * the viewport size to get CSS pixels. This keeps the stream resolution,
 * window size, and DPI fully decoupled.
 */

interface PreviewEvent {
    t: "mm" | "md" | "mu" | "wh" | "kd" | "ku" | "ch";
    x?: number;
    y?: number;  // normalized 0–1
    b?: number;   // JS button index: 0 left, 1 middle, 2 right
    mk?: number;  // MK_* mask held during a move
    d?: number;   // wheel delta (browser px, positive = down)
    vk?: number;  // Windows virtual-key code
    c?: number;   // Unicode codepoint
}

// ── Remote cursor overlay ─────────────────────────────────────────────────────

let cursorEl: HTMLDivElement | null = null;
let cursorHideTimer: number | undefined;

function showCursor(x: number, y: number) {
    if (!cursorEl) {
        cursorEl = document.createElement("div");
        cursorEl.style.cssText =
            "position:fixed;z-index:2147483647;pointer-events:none;" +
            "width:14px;height:20px;transition:opacity 0.25s;left:0;top:0;";
        cursorEl.innerHTML =
            `<svg width="14" height="20" viewBox="0 0 14 20">` +
            `<path d="M1 1 L1 15 L4.5 11.8 L7 18 L9.5 17 L7 11 L12 11 Z" ` +
            `fill="#fff" stroke="#000" stroke-width="1.2"/></svg>`;
        document.body.appendChild(cursorEl);
    }
    cursorEl.style.transform = `translate(${x}px, ${y}px)`;
    cursorEl.style.opacity = "1";
    window.clearTimeout(cursorHideTimer);
    cursorHideTimer = window.setTimeout(() => {
        if (cursorEl) cursorEl.style.opacity = "0";
    }, 4000);
}

// ── Event synthesis helpers ───────────────────────────────────────────────────

function buttonsFromMask(mk: number): number {
    // MK_LBUTTON=0x01 MK_RBUTTON=0x02 MK_MBUTTON=0x10 → DOM buttons bitmask
    let b = 0;
    if (mk & 0x01) b |= 1;
    if (mk & 0x02) b |= 2;
    if (mk & 0x10) b |= 4;
    return b;
}

function mouseEv(type: string, x: number, y: number, button = 0, buttons = 0): MouseEvent {
    return new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, button, buttons,
    });
}

function pointerEv(type: string, x: number, y: number, button = 0, buttons = 0): PointerEvent {
    return new PointerEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, button, buttons,
        pointerId: 1, pointerType: "mouse", isPrimary: true,
    });
}

/** Set an input's value through the native setter so React's onChange fires. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", {bubbles: true}));
}

function insertText(text: string) {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
        el.selectionStart = el.selectionEnd = start + text.length;
    } else if (el instanceof HTMLElement && el.isContentEditable) {
        document.execCommand("insertText", false, text);
    }
}

function deleteChar(forward: boolean) {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        let start = el.selectionStart ?? el.value.length;
        let end = el.selectionEnd ?? start;
        if (start === end) {
            if (forward) end = Math.min(el.value.length, end + 1);
            else start = Math.max(0, start - 1);
        }
        if (start === end) return;
        setNativeValue(el, el.value.slice(0, start) + el.value.slice(end));
        el.selectionStart = el.selectionEnd = start;
    } else if (el instanceof HTMLElement && el.isContentEditable) {
        document.execCommand(forward ? "forwardDelete" : "delete", false);
    }
}

const VK_KEYS: Record<number, [key: string, code: string]> = {
    8: ["Backspace", "Backspace"], 9: ["Tab", "Tab"], 13: ["Enter", "Enter"],
    16: ["Shift", "ShiftLeft"], 17: ["Control", "ControlLeft"], 18: ["Alt", "AltLeft"],
    27: ["Escape", "Escape"], 32: [" ", "Space"],
    33: ["PageUp", "PageUp"], 34: ["PageDown", "PageDown"],
    35: ["End", "End"], 36: ["Home", "Home"],
    37: ["ArrowLeft", "ArrowLeft"], 38: ["ArrowUp", "ArrowUp"],
    39: ["ArrowRight", "ArrowRight"], 40: ["ArrowDown", "ArrowDown"],
    45: ["Insert", "Insert"], 46: ["Delete", "Delete"],
};

function keyFromVk(vk: number): [key: string, code: string] | null {
    const mapped = VK_KEYS[vk];
    if (mapped) return mapped;
    if (vk >= 65 && vk <= 90) { // letters — lowercase key, KeyX code
        const ch = String.fromCharCode(vk);
        return [ch.toLowerCase(), "Key" + ch];
    }
    if (vk >= 48 && vk <= 57) {
        const ch = String.fromCharCode(vk);
        return [ch, "Digit" + ch];
    }
    if (vk >= 112 && vk <= 123) {
        const n = vk - 111;
        return ["F" + n, "F" + n];
    }
    return null;
}

// ── Event handler ─────────────────────────────────────────────────────────────

let downTarget: Element | null = null;

function handlePreviewInput(ev: PreviewEvent) {
    const x = (ev.x ?? 0) * document.documentElement.clientWidth;
    const y = (ev.y ?? 0) * document.documentElement.clientHeight;

    switch (ev.t) {
        case "mm": {
            showCursor(x, y);
            const buttons = buttonsFromMask(ev.mk ?? 0);
            const target = document.elementFromPoint(x, y) ?? document.body;
            target.dispatchEvent(pointerEv("pointermove", x, y, 0, buttons));
            target.dispatchEvent(mouseEv("mousemove", x, y, 0, buttons));
            break;
        }
        case "md": {
            showCursor(x, y);
            const button = ev.b ?? 0;
            const buttons = button === 2 ? 2 : button === 1 ? 4 : 1;
            const target = document.elementFromPoint(x, y) ?? document.body;
            downTarget = target;
            target.dispatchEvent(pointerEv("pointerdown", x, y, button, buttons));
            target.dispatchEvent(mouseEv("mousedown", x, y, button, buttons));
            // Move focus like a real click would, so typing lands in the right place
            const focusable = (target as HTMLElement).closest?.(
                "input,textarea,select,button,a[href],[tabindex],[contenteditable]"
            ) as HTMLElement | null;
            if (focusable) focusable.focus();
            else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            break;
        }
        case "mu": {
            const button = ev.b ?? 0;
            const target = document.elementFromPoint(x, y) ?? document.body;
            target.dispatchEvent(pointerEv("pointerup", x, y, button, 0));
            target.dispatchEvent(mouseEv("mouseup", x, y, button, 0));
            if (button === 0 && downTarget &&
                (target === downTarget || downTarget.contains(target) || target.contains(downTarget))) {
                target.dispatchEvent(mouseEv("click", x, y, 0, 0));
            }
            if (button === 2) target.dispatchEvent(mouseEv("contextmenu", x, y, 2, 0));
            downTarget = null;
            break;
        }
        case "wh": {
            const delta = ev.d ?? 0;
            let el = document.elementFromPoint(x, y) as HTMLElement | null;
            while (el) {
                const s = getComputedStyle(el);
                if ((s.overflowY === "auto" || s.overflowY === "scroll") &&
                    el.scrollHeight > el.clientHeight) {
                    el.scrollBy({top: delta});
                    return;
                }
                el = el.parentElement;
            }
            window.scrollBy({top: delta});
            break;
        }
        case "kd":
        case "ku": {
            const mapped = keyFromVk(ev.vk ?? 0);
            if (!mapped) break;
            const [key, code] = mapped;
            const el = (document.activeElement ?? document.body) as HTMLElement;
            el.dispatchEvent(new KeyboardEvent(ev.t === "kd" ? "keydown" : "keyup", {
                bubbles: true, cancelable: true, key, code, view: window,
            }));
            if (ev.t === "kd") {
                // Default editing behaviors synthetic events don't trigger
                if (ev.vk === 8) deleteChar(false);
                else if (ev.vk === 46) deleteChar(true);
                else if (ev.vk === 13 && document.activeElement instanceof HTMLTextAreaElement) {
                    insertText("\n");
                }
            }
            break;
        }
        case "ch": {
            // Letters/digits already sent keydown via "kd"; here we just insert the text
            insertText(String.fromCodePoint(ev.c ?? 0));
            break;
        }
    }
}

(window as unknown as Record<string, unknown>).__gdlqPreviewInput = handlePreviewInput;

export {};
