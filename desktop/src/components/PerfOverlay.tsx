// Floating performance counter — shown when the "perf counter" dev toggle is on.
// Tracks JS heap memory and FPS via requestAnimationFrame.

import {useEffect, useState} from "react";

export const PERF_KEY = "gdlqbot_perf_counter";
export const PERF_EVENT = "gdlqbot:perf-toggle";

interface PerfStats {
    fps: number;
    heapUsed: number;  // MB
    heapTotal: number;  // MB
}

function usePerfStats(): PerfStats {
    const [stats, setStats] = useState<PerfStats>({fps: 0, heapUsed: 0, heapTotal: 0});

    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let rafId = 0;

        const tick = () => {
            frameCount++;
            const now = performance.now();
            const diff = now - lastTime;

            if (diff >= 1000) {
                const mem = (performance as any).memory;
                setStats({
                    fps: Math.round((frameCount * 1000) / diff),
                    heapUsed: mem ? +(mem.usedJSHeapSize / 1_048_576).toFixed(1) : 0,
                    heapTotal: mem ? +(mem.totalJSHeapSize / 1_048_576).toFixed(1) : 0,
                });
                frameCount = 0;
                lastTime = now;
            }
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return stats;
}

export function PerfOverlay() {
    const {fps, heapUsed, heapTotal} = usePerfStats();
    const fpsColor = fps >= 55 ? "#22c55e" : fps >= 30 ? "#f59e0b" : "#ef4444";

    return (
        <div style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            zIndex: 99999,
            backgroundColor: "rgba(0,0,0,0.82)",
            border: "1px solid #222",
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: '"JetBrains Mono","Fira Code",monospace',
            fontSize: 11,
            lineHeight: 1.7,
            userSelect: "none",
            pointerEvents: "none",
            backdropFilter: "blur(4px)",
        }}>
            <div style={{color: fpsColor}}>
                FPS <span style={{color: "#fff"}}>{fps}</span>
            </div>
            {heapTotal > 0 && (
                <div style={{color: "#555"}}>
                    MEM{" "}
                    <span style={{color: "#c0c0c0"}}>{heapUsed}</span>
                    <span style={{color: "#333"}}> / {heapTotal} MB</span>
                </div>
            )}
        </div>
    );
}
