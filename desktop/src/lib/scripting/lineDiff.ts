// Minimal line-based diff (classic O(n*m) LCS) — good enough for comparing
// module command scripts, which are almost always well under a thousand
// lines. No external dependency; this is the entire algorithm.

export type DiffOp =
    | { kind: "same"; text: string }
    | { kind: "add"; text: string }
    | { kind: "remove"; text: string };

export function diffLines(oldText: string, newText: string): DiffOp[] {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    const n = a.length, m = b.length;

    // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
    const lcs: number[][] = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    const ops: DiffOp[] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            ops.push({kind: "same", text: a[i]});
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            ops.push({kind: "remove", text: a[i]});
            i++;
        } else {
            ops.push({kind: "add", text: b[j]});
            j++;
        }
    }
    while (i < n) {
        ops.push({kind: "remove", text: a[i]});
        i++;
    }
    while (j < m) {
        ops.push({kind: "add", text: b[j]});
        j++;
    }
    return ops;
}

/** True if the two texts have any line-level differences. */
export function linesDiffer(oldText: string, newText: string): boolean {
    return oldText !== newText;
}
