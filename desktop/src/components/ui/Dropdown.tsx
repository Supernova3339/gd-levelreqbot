import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";

interface Item {
    label: string;
    value: string;
    danger?: boolean;
}

interface Props {
    trigger: React.ReactNode;
    items: Item[];
    onSelect: (value: string) => void;
}

export function Dropdown({trigger, items, onSelect}: Props) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const btnRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const cancelPos = useRef(false);

    const reposition = useCallback(() => {
        if (!btnRef.current || !menuRef.current) return;
        cancelPos.current = false;
        computePosition(btnRef.current, menuRef.current, {
            placement: "bottom-start",
            middleware: [offset(4), flip(), shift({padding: 8})],
        }).then(({x, y}) => {
            if (!cancelPos.current) setPos({top: y, left: x});
        });
    }, []);

    // Callback ref: fires as soon as the portal div mounts, guaranteeing
    // menuRef.current is populated before we call computePosition.
    const setMenuRef = useCallback((node: HTMLDivElement | null) => {
        menuRef.current = node;
        if (node) reposition();
    }, [reposition]);

    useEffect(() => {
        if (!open) {
            cancelPos.current = true;
            setPos({top: -9999, left: -9999});
            return;
        }
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return () => {
            cancelPos.current = true;
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
                setOpen(false);
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [open]);

    return (
        <>
            <div ref={btnRef} onClick={() => setOpen((v) => !v)} style={{display: "contents"}}>
                {trigger}
            </div>

            {open && createPortal(
                <div ref={setMenuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
                    backgroundColor: "#111", border: "1px solid #222", borderRadius: 6,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.8)", minWidth: 140, overflow: "hidden",
                }}>
                    {items.map((item) => (
                        <button key={item.value}
                                onClick={() => {
                                    onSelect(item.value);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs"
                                style={{color: item.danger ? "#ef4444" : "#c0c0c0", display: "block"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}>
                            {item.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
