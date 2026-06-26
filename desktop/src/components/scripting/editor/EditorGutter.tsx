import type {ParseError} from "./useEditorErrors";

const GUTTER_W = 36;
const FONT = '"JetBrains Mono","Fira Code","Cascadia Code",monospace';

interface Props {
    lineCount: number;
    errors: ParseError[];
    fontSize: number;
    lineHeight: number;
}

export function EditorGutter({lineCount, errors, fontSize, lineHeight}: Props) {
    const errLines = new Set(errors.map((e) => e.line));

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: GUTTER_W,
                bottom: 0,
                overflowY: "hidden",
                paddingTop: 6,
                fontFamily: FONT,
                fontSize: 10,
                lineHeight: lineHeight,
                backgroundColor: "#060606",
                borderRight: "1px solid #111",
                userSelect: "none",
                pointerEvents: "none",
                zIndex: 1,
            }}
        >
            {Array.from({length: lineCount}, (_, i) => {
                const n = i + 1;
                const isErr = errLines.has(n);
                return (
                    <div
                        key={n}
                        style={{
                            height: fontSize * lineHeight,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            paddingRight: 5,
                            color: isErr ? "#ef4444" : "#252525",
                        }}
                    >
                        {isErr ? "⚠" : n}
                    </div>
                );
            })}
        </div>
    );
}
