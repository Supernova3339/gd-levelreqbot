interface Props {
    code: string;
}

function parseFunctions(code: string): string[] {
    const matches = [...code.matchAll(/^fn\s+(\w+)\s*\(([^)]*)\)/gm)];
    return matches.map((m) => `fn ${m[1]}(${m[2].trim()})`);
}

export function LibraryFunctions({code}: Props) {
    const fns = parseFunctions(code);
    if (fns.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 flex-shrink-0"
             style={{borderBottom: "1px solid #1a1a1a", backgroundColor: "#080808"}}>
            {fns.map((sig) => (
                <span key={sig}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                          backgroundColor: "#111", color: "#82aaff", border: "1px solid #1e1e1e",
                          fontFamily: "monospace"
                      }}>
          {sig}
        </span>
            ))}
        </div>
    );
}
