import {createPortal} from "react-dom";
import {ArrowDownToLine, ArrowUpToLine, Copy, Settings, Trash2, Unlink} from "lucide-react";

interface Props {
    x: number;
    y: number;
    nodeId: string;
    nodeLabel: string;
    isEntry: boolean;
    onDelete: () => void;
    onDuplicate: () => void;
    onDisconnect: () => void;
    onBringToFront: () => void;
    onSendToBack: () => void;
    onConfigure?: () => void;
    onClose: () => void;
}

export function NodeContextMenu({
                                    x, y, nodeLabel, isEntry,
                                    onDelete, onDuplicate, onDisconnect,
                                    onBringToFront, onSendToBack,
                                    onConfigure, onClose,
                                }: Props) {
    const W = 190;
    const cx = Math.min(x, window.innerWidth - W - 8);
    const cy = Math.min(y, window.innerHeight - 240 - 8);

    return createPortal(
        <>
            <div style={{position: "fixed", inset: 0, zIndex: 9998}}
                 onClick={onClose}
                 onContextMenu={(e) => {
                     e.preventDefault();
                     onClose();
                 }}/>

            <div style={{
                position: "fixed", top: cy, left: cx, width: W, zIndex: 9999,
                backgroundColor: "#111", border: "1px solid #222", borderRadius: 6,
                boxShadow: "0 12px 32px rgba(0,0,0,0.8)", overflow: "hidden",
            }}>
                {/* Node label */}
                <div style={{padding: "6px 10px", borderBottom: "1px solid #1a1a1a"}}>
                    <p style={{
                        fontSize: 10, color: "#555", margin: 0,
                        fontFamily: '"JetBrains Mono","Fira Code",monospace',
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {nodeLabel}
                    </p>
                </div>

                {onConfigure && (
                    <MenuItem icon={<Settings size={11}/>} label="Configure…"
                              onClick={() => {
                                  onConfigure();
                                  onClose();
                              }}/>
                )}
                {!isEntry && (
                    <MenuItem icon={<Copy size={11}/>} label="Duplicate"
                              onClick={() => {
                                  onDuplicate();
                                  onClose();
                              }}/>
                )}
                <MenuItem icon={<Unlink size={11}/>} label="Disconnect edges"
                          onClick={() => {
                              onDisconnect();
                              onClose();
                          }}/>

                {/* Layer controls */}
                <Divider/>
                <MenuItem icon={<ArrowUpToLine size={11}/>} label="Bring to front"
                          onClick={() => {
                              onBringToFront();
                              onClose();
                          }}/>
                <MenuItem icon={<ArrowDownToLine size={11}/>} label="Send to back"
                          onClick={() => {
                              onSendToBack();
                              onClose();
                          }}/>

                {!isEntry && (
                    <>
                        <Divider/>
                        <MenuItem icon={<Trash2 size={11}/>} label="Delete"
                                  onClick={() => {
                                      onDelete();
                                      onClose();
                                  }} danger/>
                    </>
                )}
            </div>
        </>,
        document.body
    );
}

function Divider() {
    return <div style={{height: 1, backgroundColor: "#1a1a1a", margin: "2px 0"}}/>;
}

function MenuItem({icon, label, onClick, danger}: {
    icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
    return (
        <button onClick={onClick}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs"
                style={{color: danger ? "#ef4444" : "#c0c0c0"}}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                }}>
            <span style={{opacity: 0.7}}>{icon}</span>
            {label}
        </button>
    );
}
