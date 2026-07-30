import type {LayoutNode} from "../../../../../lib/types";
import {resolveLucideIcon} from "../lucide";

const VARIANT_STYLES = {
    page: {fontSize: 15, fontWeight: 700, color: "#f1f1f1", marginBottom: 2},
    section: {
        fontSize: 12,
        fontWeight: 600,
        color: "#888",
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em"
    },
    sub: {fontSize: 12, fontWeight: 600, color: "#aaa"},
};

export function Heading({node}: { node: LayoutNode }) {
    const variant = (node.heading_variant ?? "section") as keyof typeof VARIANT_STYLES;
    const style = VARIANT_STYLES[variant] ?? VARIANT_STYLES.section;

    let iconEl: React.ReactNode = null;
    if (node.heading_icon) {
        const Ic = resolveLucideIcon(node.heading_icon);
        if (Ic) iconEl = <Ic size={style.fontSize} color={style.color}/>;
    }

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            ...style,
        }}>
            {iconEl}
            <span>{node.heading_label ?? ""}</span>
        </div>
    );
}
