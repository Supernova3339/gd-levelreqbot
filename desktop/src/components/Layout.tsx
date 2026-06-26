import {type ReactNode, useState} from "react";
import {StatusBar} from "./StatusBar";
import {CommandsIcon, GearIcon, InfoIcon, QueueIcon} from "./icons";

type Page = "queue" | "commands" | "integrations" | "libraries" | "console";

interface LayoutProps {
    children: (page: Page) => ReactNode;
    onOpenSettings: () => void;
    onOpenAbout: () => void;
}

function LibrariesIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="3" y="2" width="9" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M6 2v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M12 5h2.5M12 8.5h2.5M12 12h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    );
}

function ConsoleNavIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 7l3 2-3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeLinejoin="round"/>
            <path d="M10 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    );
}

function IntegrationsIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <circle cx="4.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="13.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="13.5" cy="13.5" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M6.8 8l4.2-2.5M6.8 10l4.2 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
    );
}

function NavBtn({icon, label, active = false, onClick}: {
    icon: ReactNode; label: string; active?: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className="flex items-center justify-center transition-colors flex-shrink-0"
            style={{
                width: 44, height: 44,
                backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent",
                color: active ? "var(--color-accent)" : "#555",
                borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
            }}
            onMouseEnter={(e) => {
                if (!active) {
                    e.currentTarget.style.backgroundColor = "#1c1c1c";
                    e.currentTarget.style.color = "#999";
                }
            }}
            onMouseLeave={(e) => {
                if (!active) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#555";
                }
            }}
        >
            {icon}
        </button>
    );
}

export function Layout({children, onOpenSettings, onOpenAbout}: LayoutProps) {
    const [page, setPage] = useState<Page>("queue");

    return (
        <div className="flex flex-col h-full" style={{backgroundColor: "#0f0f0f"}}>
            <StatusBar/>

            <div className="flex flex-1 overflow-hidden">
                <nav
                    className="flex flex-col flex-shrink-0"
                    style={{width: 44, backgroundColor: "#111", borderRight: "1px solid #222"}}
                >
                    <div className="flex flex-col flex-1 pt-1">
                        <NavBtn icon={<QueueIcon/>} label="Queue" active={page === "queue"}
                                onClick={() => setPage("queue")}/>
                        <NavBtn icon={<CommandsIcon/>} label="Commands" active={page === "commands"}
                                onClick={() => setPage("commands")}/>
                        <NavBtn icon={<IntegrationsIcon/>} label="Integrations" active={page === "integrations"}
                                onClick={() => setPage("integrations")}/>
                        <NavBtn icon={<LibrariesIcon/>} label="Libraries" active={page === "libraries"}
                                onClick={() => setPage("libraries")}/>
                        <NavBtn icon={<ConsoleNavIcon/>} label="Console" active={page === "console"}
                                onClick={() => setPage("console")}/>
                    </div>
                    <div className="pb-1">
                        <NavBtn icon={<InfoIcon/>} label="About" onClick={onOpenAbout}/>
                        <NavBtn icon={<GearIcon/>} label="Settings" onClick={onOpenSettings}/>
                    </div>
                </nav>

                <main className="flex-1 overflow-hidden" style={{backgroundColor: "#0f0f0f"}}>
                    {children(page)}
                </main>
            </div>
        </div>
    );
}
