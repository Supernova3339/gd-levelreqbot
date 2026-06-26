export type Condition =
    | { kind: "call"; method: string }
    | { kind: "not"; inner: Condition }
    | { kind: "and"; left: Condition; right: Condition }
    | { kind: "or"; left: Condition; right: Condition };

export type Block =
    | { id: string; type: "if"; condition: Condition; then: Block[]; else: Block[] }
    | { id: string; type: "require"; condition: Condition }
    | { id: string; type: "action"; name: string }
    | { id: string; type: "say"; message: string }
    | { id: string; type: "reply"; message: string }
    | { id: string; type: "random"; messages: string[] }
    | { id: string; type: "stop" }
    | { id: string; type: "comment"; text: string; color: string };
