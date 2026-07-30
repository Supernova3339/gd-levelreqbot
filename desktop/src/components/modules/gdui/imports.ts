/**
 * GDUI import resolution — splices <Import file="…"/> elements with the
 * contents of other .gdui files, so a module can break a large page up into
 * smaller reusable files instead of one giant XML document.
 *
 *   <Import file="ui/parts/queue-list.gdui"/>
 *
 * `file` is a module-root-relative path, same convention as page/icon paths
 * used elsewhere (e.g. "ui/queue.gdui", "resources/icons/x.svg") — it is
 * NOT relative to the importing file. The imported file's root element must
 * be <Fragment>; its children are spliced in place of the <Import> tag and
 * the wrapper itself is discarded. Fragments may themselves import further
 * fragments (resolved depth-first before splicing), up to MAX_IMPORT_DEPTH,
 * and a file cannot (transitively) import itself.
 */

import {readModulePage} from "../../../lib/commands";

const MAX_IMPORT_DEPTH = 8;

function parseXmlDocument(xml: string, context: string): Document {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const parseErr = doc.querySelector("parsererror");
    if (parseErr) {
        throw new Error(`GDUI parse error in ${context}: ${parseErr.textContent?.trim()}`);
    }
    return doc;
}

async function resolveImportsIn(el: Element, moduleId: string, chain: string[]): Promise<void> {
    // Snapshot — the loop mutates the tree, but only ever with already-resolved
    // subtrees, so nodes newly inserted below never need a second pass here.
    const importEls = Array.from(el.getElementsByTagName("Import"));

    for (const imp of importEls) {
        const file = imp.getAttribute("file");
        if (!file) throw new Error("<Import> is missing a required \"file\" attribute");

        if (chain.includes(file)) {
            throw new Error(`Circular GDUI import: ${[...chain, file].join(" -> ")}`);
        }
        if (chain.length >= MAX_IMPORT_DEPTH) {
            throw new Error(`GDUI import depth exceeded (max ${MAX_IMPORT_DEPTH}) while importing "${file}"`);
        }

        const xml = await readModulePage(moduleId, file);
        const fragDoc = parseXmlDocument(xml, `imported file "${file}"`);
        const fragRoot = fragDoc.documentElement;
        if (fragRoot.tagName !== "Fragment") {
            throw new Error(`Imported GDUI file "${file}" must have a <Fragment> root, got <${fragRoot.tagName}>`);
        }

        // Resolve the fragment's own imports before splicing it in.
        await resolveImportsIn(fragRoot, moduleId, [...chain, file]);

        const parent = imp.parentNode;
        if (!parent) continue;
        const ownerDoc = el.ownerDocument!;
        for (const child of Array.from(fragRoot.childNodes)) {
            parent.insertBefore(ownerDoc.importNode(child, true), imp);
        }
        parent.removeChild(imp);
    }
}

/**
 * Fetch a page's XML and recursively inline any <Import> elements, returning
 * a fully-resolved Document ready to hand to parseGduiDocument().
 */
export async function loadGduiDocument(moduleId: string, pageFile: string): Promise<Document> {
    const xml = await readModulePage(moduleId, pageFile);
    const doc = parseXmlDocument(xml, "page");
    await resolveImportsIn(doc.documentElement, moduleId, [pageFile]);
    return doc;
}
