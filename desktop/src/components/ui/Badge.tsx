interface Props {
    children: React.ReactNode;
    color?: string;
    style?: React.CSSProperties;
}

export function Badge({children, color = "#888", style}: Props) {
    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
            border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
            ...style,
        }}>
      {children}
    </span>
    );
}
