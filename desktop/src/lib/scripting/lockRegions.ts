// In-script code locking — a module author wraps specific lines they
// consider load-bearing in `// @lock` / `// @unlock` markers; everything
// else in the same script stays freely editable. Deliberately not a
// whole-script lock (that already exists implicitly for scripts with no
// override mechanism at all) — this is for "you can customize this command,
// just don't touch this one part."
//
// Enforcement is content-based, not position-based: a locked block (markers
// included) extracted from the module's current default script must still
// appear verbatim, as an exact substring, somewhere in the edited script.
// That's intentionally permissive about *where* it ends up (code around it
// can be reordered/edited freely) and strict about the block's own content.
//
// These markers share the `// @word` shape that getBodyText() strips as a
// directive comment (trigger/roles/cooldown/etc) — getBodyText() has an
// explicit exemption for exactly these two lines (see directives.ts) so
// they survive into the body text lock-detection actually runs on. Without
// that exemption they'd vanish before any of this code ever saw them, which
// is exactly what happened originally: backend enforcement (working on the
// raw unstripped file) caught bad edits fine, but the editor's body text
// never had the markers to find, so no visual ever showed.

const LOCK_START = "// @lock";
const LOCK_END = "// @unlock";

export interface LockedBlock {
    /** Exact text of the block, including both marker lines. */
    text: string;
    /** 1-indexed start/end line numbers in the source it was extracted from. */
    startLine: number;
    endLine: number;
}

/** Extract every `// @lock` ... `// @unlock` block (marker lines included). */
export function extractLockedBlocks(text: string): LockedBlock[] {
    const lines = text.split("\n");
    const blocks: LockedBlock[] = [];
    let openAt: number | null = null;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === LOCK_START && openAt === null) {
            openAt = i;
        } else if (trimmed === LOCK_END && openAt !== null) {
            blocks.push({
                text: lines.slice(openAt, i + 1).join("\n"),
                startLine: openAt + 1,
                endLine: i + 1,
            });
            openAt = null;
        }
    }
    // An unclosed `// @lock` (no matching `// @unlock`) is ignored rather than
    // locking "everything to end of file" — a missing marker shouldn't silently
    // turn into the most restrictive possible interpretation.
    return blocks;
}

export interface LockViolation {
    startLine: number;
    endLine: number;
}

/**
 * Locked blocks are sourced from `originalText` (the module's current
 * default); `editedText` is what the user is trying to save. Returns the
 * blocks that no longer appear verbatim in `editedText` — empty if the save
 * is allowed.
 */
export function findLockViolations(originalText: string, editedText: string): LockViolation[] {
    const blocks = extractLockedBlocks(originalText);
    return blocks
        .filter((b) => !editedText.includes(b.text))
        .map((b) => ({startLine: b.startLine, endLine: b.endLine}));
}

/**
 * Where each locked block (sourced from `originalText`) currently sits in
 * `currentText`, for drawing an overlay in the editor — content-based, so it
 * tracks correctly even after unrelated edits shift line numbers around it.
 * A block that's been altered (no longer found verbatim) is simply omitted;
 * `findLockViolations` is what reports that as an error.
 */
export function locateLockedBlocks(originalText: string, currentText: string): LockViolation[] {
    const blocks = extractLockedBlocks(originalText);
    const located: LockViolation[] = [];
    for (const b of blocks) {
        const idx = currentText.indexOf(b.text);
        if (idx === -1) continue;
        const startLine = currentText.slice(0, idx).split("\n").length;
        const endLine = startLine + b.text.split("\n").length - 1;
        located.push({startLine, endLine});
    }
    return located;
}
