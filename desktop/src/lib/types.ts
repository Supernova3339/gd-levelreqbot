export interface AuthConfig {
    bot_username: string;
    /** OAuth token for the bot's account (when using a separate bot) */
    bot_access_token: string;
    channel: string;
    web_api_token: string;
    /** OAuth token for the channel/streamer account */
    twitch_access_token: string;
    youtube_access_token: string;
    youtube_api_key: string;
}

export interface ModesConfig {
    gd: boolean;
    sub: boolean;
    smart: boolean;
    youtube: boolean;
}

export interface LimitsConfig {
    viewer_request_limit: number;
    subscriber_request_limit: number;
    max_queue_size: number;
}

export interface WsConfig {
    enabled: boolean;
    port: number;
    secret: string;
}

export interface GDAccount {
    account_id: number;
    username: string;
    gjp2_enc: string;
}

export interface AppConfig {
    auth: AuthConfig;
    modes: ModesConfig;
    limits: LimitsConfig;
    ws?: WsConfig;
    gd_account?: GDAccount;
    setup_complete: boolean;
    auto_copy_level_id: boolean;
    level_thumbnails: boolean;
    thumbnail_quality: string;
    queue_open: boolean;
}

export interface HistoryEntry {
    id: number;
    level_id: number;
    username: string;
    queue_type: string;
    platform: string;
    nexted_at: string;
}

export interface HistoryPage {
    data: HistoryEntry[];
    page: number;
    total_pages: number;
    total_items: number;
}

export interface GDLevel {
    level_id: number;
    level_name: string;
    description: string;
    player_id: number;
    author: string;
    difficulty: string;
    downloads: number;
    likes: number;
    length: string;
    stars: number;
    demon: boolean;
    auto: boolean;
    coins: number;
    verified_coins: boolean;
    featured: boolean;
    epic: boolean;
    original_id: number;
    version: number;
}

export interface GDUser {
    user_name: string;
    user_id: number;
    account_id: number;
    stars: number;
    demons: number;
    creator_points: number;
    rank: number;
}

export interface Keybind {
    action: string;
    shortcut: string;
}

export interface QueueEntry {
    id: number;
    level_id: number;
    username: string;
    is_subscriber: boolean;
    position: number;
    queue_type: string;
    platform: string;
    added_at: string;
}

export interface QueuePage {
    data: QueueEntry[];
    page: number;
    total_pages: number;
    total_items: number;
    items_per_page: number;
}

export interface NextLevel {
    level_id: number;
    username: string;
    queue_type: string;
}

export interface BotStatusResponse {
    status: "stopped" | "connecting" | "connected" | { error: string };
    twitch_connected: boolean;
    youtube_connected: boolean;
}

// ── Modules ──────────────────────────────────────────────────────────────────

export interface CommandDef {
    trigger: string;
    aliases?: string[];
    description?: string;
    builtin_key: string;
    required_badges?: string[];
    enabled?: boolean;
    cooldown_seconds?: number;
    user_cooldown_seconds?: number;
}

export interface WidgetAction {
    /** Omit to render icon-only (requires `icon`). */
    label?: string;
    action_key: string;
    /** Row field to pass as args[0] when triggered from a List row. Defaults to row_id. */
    arg_field?: string;
    args?: string[];
    style?: "default" | "danger" | "success";
    /** Lucide icon name (e.g. "trash-2"). Rendered alongside the label, or alone if no label is set. */
    icon?: string;
    /** Sub-page id to navigate to instead of dispatching an action key. */
    navigate_to?: string;
    /** Secondary description text shown below the label */
    text?: string;
    /** "separator" renders a horizontal divider instead of a clickable item */
    type?: "separator";
    /** Row field to copy to the clipboard instead of dispatching action_key —
     *  a pure frontend action for menu items like "Copy Title" that have no
     *  script-side effect at all. Takes priority over action_key when set. */
    copy_field?: string;
}

// ── Page / Layout system ──────────────────────────────────────────────────────

export interface FieldDef {
    key: string;
    label: string;
    type?: "text" | "number" | "image" | "badge" | "stars" | "boolean";
}

export interface FormFieldDef {
    key: string;
    label: string;
    type: "text" | "number" | "password" | "toggle" | "select" | "textarea";
    /** Rhai expression evaluated on mount to populate the initial field value. */
    default_expr?: string;
    options?: Array<{ value: string; label: string }>;
    min?: number;
    max?: number;
    placeholder?: string;
    /** Section label — a header is rendered above the first field of each new
     *  group (fields keep document order; consecutive same-group fields share
     *  one header). Lets a single <Form> visually organize many fields without
     *  splitting into multiple <Form>s (which breaks shared scroll sizing). */
    group?: string;
    /** Key of another field in the same Form whose label row this field
     *  should render alongside instead of taking its own row — generic
     *  "attach a small control to a label" tooling, not tied to any
     *  particular use case (units, sort direction, ...). Always renders as
     *  a compact segmented toggle rather than a full dropdown, since that's
     *  the whole point of putting it on a label row instead of its own. */
    attach_to?: string;
}

// ── Module dependency / bundle types ─────────────────────────────────────────

export interface ModuleDependency {
    id: string;
    /** "library" | "module" (default: "library") */
    dep_type?: string;
    optional?: boolean;
}

export interface BundledLibraryDef {
    /** Library name as imported in Rhai (e.g. "queue-core") */
    name: string;
    /** Relative path within the module directory to the .rhai file */
    file: string;
    description?: string;
}

export interface ModuleBundle {
    libraries?: BundledLibraryDef[];
}

export interface TableColumnDef {
    key: string;
    label: string;
    /** "text" (default) | "number" | "badge" */
    type?: "text" | "number" | "badge";
}

export interface AccordionSection {
    label: string;
    default_open?: boolean;
    content: LayoutNode;
}

export interface SelectOption {
    value: string;
    label: string;
}

export interface LayoutNode {
    type:
    // Layout
        | "TwoColumn" | "Stack" | "Grid" | "Tabs"
        | "Accordion" | "Drawer" | "Divider" | "Spacer"
        | "Card" | "ScrollArea" | "Inset"
        // Data / control flow
        | "Toolbar" | "Conditional" | "Each"
        // Display
        | "List" | "DetailCard" | "StatCard" | "Chart"
        | "Table" | "Alert" | "Progress"
        | "Text" | "Badge" | "Icon"
        | "Heading" | "Code" | "EmptyState"
        | "Skeleton" | "TagList" | "KVList"
        | "Timeline" | "Avatar" | "CalloutBox" | "ExpandableText"
        | "ProgressRing" | "Tooltip" | "SectionHeader" | "Image"
        | "StatBar"
        // Input / interaction
        | "Form" | "Button"
        | "Select" | "Input" | "Slider" | "MultiSelect"
        | "Toggle" | "Checkbox" | "RadioGroup"
        | "NumberInput" | "CopyButton" | "SegmentedControl" | "TextArea"
        | "ConfirmButton" | "ActionMenu" | "TwoFieldForm"
        | "Empty";

    // ── TwoColumn ─────────────────────────────────────────────────────────────
    left_width?: number;
    left?: LayoutNode;
    right?: LayoutNode;

    // ── Stack ─────────────────────────────────────────────────────────────────
    children?: LayoutNode[];
    /** "vertical" (default) or "horizontal" */
    stack_direction?: "vertical" | "horizontal";
    stack_gap?: number;
    /** When true, Stack grows to fill available space (flex: 1). Default: false (natural height). */
    stack_fill?: boolean;
    /** Padding inside the stack container (px). */
    stack_padding?: number;
    /** CSS align-items value ("start" | "center" | "end" | "stretch"). */
    stack_align?: string;
    /** When true, horizontal stack wraps to next line. Default: false. */
    stack_wrap?: boolean;
    /** Inline CSS string applied to the stack div (e.g. "padding: 14px 16px"). */
    stack_style?: string;
    /** CSS justify-content value ("start" | "center" | "end" | "space-between" | "space-around"). */
    stack_justify?: string;

    // ── Image ─────────────────────────────────────────────────────────────────
    img_src_expr?: string;
    img_src?: string;
    img_height?: number;
    img_border_radius?: number;
    img_fit?: string;

    // ── Tabs ──────────────────────────────────────────────────────────────────
    tabs_variant?: string;
    tabs?: Array<{
        label: string;
        icon?: string;
        badge_expr?: string;
        show_expr?: string;
        show_key?: string;
        content: LayoutNode
    }>;
    selection_key?: string;

    // ── List ──────────────────────────────────────────────────────────────────
    sections?: Array<{ label?: string; data_expr: string }>;
    row_id?: string;
    row_primary?: string;
    row_secondary?: string;
    row_platform?: string;
    row_actions?: WidgetAction[];
    /** Right-click menu for a row — <List><RowContextMenu><MenuItem .../></RowContextMenu></List>.
     *  Separate from row_actions (always-visible inline buttons); this opens at
     *  the cursor on right-click instead. */
    row_context_menu?: WidgetAction[];
    empty_message?: string;
    /** Rhai expression for the empty-state message instead of a static string
     *  — e.g. so it can reference ms.command_trigger("...") and never go
     *  stale when the user renames the command. Takes priority over empty_message. */
    empty_message_expr?: string;
    /** Field whose integer value is displayed as "#N" before the row primary label */
    row_position_field?: string;
    /** Field whose value is rendered as a small badge chip on each row */
    row_badge_field?: string;
    /** Static string prepended to the secondary field value (e.g. "#" to display "#12345678") */
    row_secondary_prefix?: string;
    /** Navigate to this sub-page id when a row is clicked (alongside setting selection) */
    row_navigate_to?: string;

    // ── Toolbar ───────────────────────────────────────────────────────────────
    status_expr?: string;
    status_on_label?: string;
    status_off_label?: string;
    status_action_on?: string;
    status_action_off?: string;
    count_expr?: string;
    max_expr?: string;
    actions?: WidgetAction[];

    // ── DetailCard ────────────────────────────────────────────────────────────
    data_expr?: string;
    fields?: FieldDef[];
    placeholder?: string;

    // ── Form ──────────────────────────────────────────────────────────────────
    /** Display title rendered above the form fields. */
    title?: string;
    /** Module action key called on submit; receives JSON-encoded field values as args[0]. */
    submit_key?: string;
    /** Auto-save on change (debounced) instead of an explicit Save button. Default true. */
    autosave?: boolean;
    form_fields?: FormFieldDef[];

    // ── StatCard ──────────────────────────────────────────────────────────────
    /** Rhai expression that returns a scalar value to display. */
    value_expr?: string;
    /** Label shown below the value. */
    value_label?: string;
    format?: "number" | "percent" | "duration" | "text";

    // ── Chart ─────────────────────────────────────────────────────────────────
    chart_type?: "bar" | "line";
    x_key?: string;
    y_key?: string;
    chart_color?: string;

    // ── Button ────────────────────────────────────────────────────────────────
    button_label?: string;
    /** Rhai expression evaluated dynamically as button label */
    button_label_expr?: string;
    /** Optional Lucide icon name (e.g. "trash-2"). Renders before label, or alone if no label. */
    button_icon?: string;
    /** Module action key to invoke on click */
    button_action?: string;
    button_args?: string[];
    /** Dot-path into page state used as args[0] on dispatch (e.g. "selected.level_id") */
    button_arg_state?: string;
    /** Rhai expression; button is disabled when truthy */
    button_disabled_expr?: string;
    button_variant?: "primary" | "ghost" | "danger" | "warn" | "success" | "default";
    /** Navigate to sub-page id, or ".." to return to root */
    button_navigate?: string;
    /** State key to set on click */
    button_state_key?: string;
    button_state_value?: unknown;
    /** After a successful button_action dispatch, eval this Rhai expression and
     *  store the result under this state key (e.g. show the level a "Next" action
     *  just popped, without requiring the user to click a row to select it). */
    button_after_state_key?: string;
    button_after_state_expr?: string;
    /** When true, button stretches to 100% of its container width */
    button_full_width?: boolean;

    // ── Text ─────────────────────────────────────────────────────────────────
    text_expr?: string;
    text_value?: string;
    text_style?: "default" | "title" | "subtitle" | "muted" | "accent" | "error" | "code";
    text_size?: number;
    /** If true, wraps text; default false (truncates) */
    text_wrap?: boolean;

    // ── Badge ─────────────────────────────────────────────────────────────────
    badge_expr?: string;
    badge_value?: string;
    badge_variant?: "default" | "success" | "warn" | "danger" | "accent";
    badge_color?: string;

    // ── Grid ─────────────────────────────────────────────────────────────────
    /** Number of columns or CSS grid-template-columns value */
    grid_columns?: number | string;
    grid_gap?: number;
    /** If set, uses auto-fill with this minimum column width (px) — responsive grid. */
    grid_min_width?: number;

    // ── Conditional ──────────────────────────────────────────────────────────
    /** Rhai expression; renders children when truthy */
    show_expr?: string;
    /** State key; renders children when state[key] is truthy */
    show_key?: string;
    /** Optional fallback node rendered when condition is false (second child or explicit). */
    else_child?: LayoutNode;

    // ── Each ─────────────────────────────────────────────────────────────────
    /** Rhai expression returning an array to iterate over */
    items_expr?: string;
    /** Variable name injected per-item (default: "item") */
    item_var?: string;
    /** Field on each item used as the React key */
    item_key_field?: string;
    /** The template node to render for each item (first child of <Each>) */
    item_template?: LayoutNode;

    // ── Icon ─────────────────────────────────────────────────────────────────
    /** Format: "lucide:star", "builtin:queue", "local:my-icon" */
    icon_name?: string;
    icon_size?: number;
    icon_color?: string;

    // ── Divider ───────────────────────────────────────────────────────────────
    divider_label?: string;

    // ── Spacer ────────────────────────────────────────────────────────────────
    /** Fixed size in px. Omit for flex: 1 spacer. */
    spacer_size?: number;

    // ── Select ────────────────────────────────────────────────────────────────
    /** Page state key holding the current selected value. */
    select_key?: string;
    select_placeholder?: string;
    select_options?: SelectOption[];
    /** Rhai expr returning [{value, label}] array for dynamic options. */
    select_options_expr?: string;
    /** Rhai expr evaluated once on mount to pre-populate state[select_key]. */
    select_value_expr?: string;
    /** Action dispatched when value changes; receives new value as args[0]. */
    select_action_key?: string;
    select_label?: string;

    // ── Input ─────────────────────────────────────────────────────────────────
    input_key?: string;
    input_type?: "text" | "number" | "password";
    input_placeholder?: string;
    input_label?: string;
    /** Action dispatched on Enter (not blur — blur only syncs state, since a
     *  click on a nearby button would otherwise double-dispatch: blur fires
     *  before the button's own click). Receives current value as args[0]. */
    input_action_key?: string;
    /** Rhai expr evaluated on mount to populate initial value. */
    input_value_expr?: string;
    /** After a successful input_action_key dispatch (e.g. Enter submits an
     *  "add" action), eval this expression and store it under this state key —
     *  typically used to clear the input back to "" once submitted. */
    input_after_state_key?: string;
    input_after_state_expr?: string;
    input_min?: number;
    input_max?: number;

    // ── TwoFieldForm ──────────────────────────────────────────────────────────
    // Self-contained two-input row + submit button — its own local component
    // state end to end, deliberately NOT wired through the shared page-state
    // bag (no stateKey, no argState, no afterState). Submits both fields as a
    // single JSON-object arg (io.parse_json(args[0]) on the script side), so
    // there's no comma-split/multi-key resolution or dispatch-timing race to
    // get wrong. Only clears its inputs when the dispatch actually succeeds.
    twoform_action_key?: string;
    twoform_field1_key?: string;
    twoform_field1_placeholder?: string;
    twoform_field2_key?: string;
    twoform_field2_placeholder?: string;
    twoform_button_label?: string;
    twoform_button_icon?: string;

    // ── Slider ────────────────────────────────────────────────────────────────
    slider_key?: string;
    slider_min?: number;
    slider_max?: number;
    slider_step?: number;
    slider_label?: string;
    slider_value_expr?: string;
    /** Action dispatched on pointer release; receives value as args[0]. */
    slider_action_key?: string;

    // ── MultiSelect ───────────────────────────────────────────────────────────
    /** Page state key holding the selected values array. */
    multi_key?: string;
    multi_label?: string;
    multi_options?: SelectOption[];
    multi_options_expr?: string;

    // ── Table ─────────────────────────────────────────────────────────────────
    /** Rhai expr returning the array of row objects. */
    table_data_expr?: string;
    table_columns?: TableColumnDef[];
    table_empty?: string;
    /** Page state key to write the clicked row into. */
    table_selection_key?: string;
    table_row_actions?: WidgetAction[];

    // ── Alert ─────────────────────────────────────────────────────────────────
    alert_variant?: "info" | "warn" | "error" | "success";
    alert_title?: string;
    alert_message?: string;
    /** Rhai expr returning the message string. */
    alert_expr?: string;

    // ── Progress ──────────────────────────────────────────────────────────────
    /** Rhai expr returning the current value. */
    progress_expr?: string;
    /** Rhai expr returning the maximum (default: 100). */
    progress_max_expr?: string;
    progress_label?: string;
    /** CSS color for the filled bar. */
    progress_color?: string;
    progress_show_value?: boolean;

    // ── Accordion ─────────────────────────────────────────────────────────────
    accordion_sections?: AccordionSection[];

    // ── Drawer ────────────────────────────────────────────────────────────────
    drawer_trigger_label?: string;
    drawer_trigger_icon?: string;
    drawer_trigger_variant?: string;
    drawer_title?: string;

    // ── Heading ───────────────────────────────────────────────────────────────
    /** "page" | "section" (default) | "sub" */
    heading_variant?: "page" | "section" | "sub";
    heading_label?: string;
    /** Optional icon: "lucide:settings" */
    heading_icon?: string;

    // ── Code ──────────────────────────────────────────────────────────────────
    /** Rhai expression returning the code/text to display. */
    code_expr?: string;
    code_value?: string;
    /** Whether to add a copy button (default: false). */
    code_copyable?: boolean;
    /** Whether to wrap long lines (default: false). */
    code_wrap?: boolean;

    // ── EmptyState ────────────────────────────────────────────────────────────
    /** Lucide icon name (e.g. "lucide:inbox"). */
    empty_icon?: string;
    empty_state_message?: string;
    /** Action key called when the action button is clicked. */
    empty_action_key?: string;
    empty_action_label?: string;

    // ── Skeleton ──────────────────────────────────────────────────────────────
    /** Number of skeleton lines (default: 3, max: 10). */
    skeleton_lines?: number;
    /** Height of each line in px (default: 12). */
    skeleton_height?: number;

    // ── TagList ───────────────────────────────────────────────────────────────
    /** Rhai expr returning a string array of tags. */
    taglist_expr?: string;
    taglist_variant?: "default" | "accent" | "success" | "warn" | "danger";
    /** Shown when there are no tags. */
    taglist_empty?: string;

    // ── KVList ────────────────────────────────────────────────────────────────
    /** Rhai expr returning array of {key, value} or a plain object. */
    kvlist_expr?: string;
    kvlist_title?: string;
    kvlist_empty?: string;

    // ── Toggle ────────────────────────────────────────────────────────────────
    toggle_key?: string;
    toggle_label?: string;
    /** Rhai expr for initial value. */
    toggle_value_expr?: string;
    /** Action dispatched on change; receives "true" or "false" as args[0]. */
    toggle_action_key?: string;

    // ── Checkbox ──────────────────────────────────────────────────────────────
    checkbox_key?: string;
    checkbox_label?: string;
    checkbox_value_expr?: string;
    checkbox_action_key?: string;

    // ── RadioGroup ────────────────────────────────────────────────────────────
    radio_key?: string;
    radio_label?: string;
    radio_options?: Array<{ value: string; label: string }>;
    radio_options_expr?: string;
    /** "vertical" (default) | "horizontal" */
    radio_direction?: "vertical" | "horizontal";
    radio_action_key?: string;

    // ── NumberInput ───────────────────────────────────────────────────────────
    numInput_key?: string;
    numInput_label?: string;
    numInput_min?: number;
    numInput_max?: number;
    numInput_step?: number;
    numInput_value_expr?: string;
    numInput_action_key?: string;

    // ── CopyButton ────────────────────────────────────────────────────────────
    /** Rhai expr returning the text to copy. */
    copy_value_expr?: string;
    copy_value?: string;
    copy_label?: string;
    copy_variant?: "default" | "accent";

    // ── Card ──────────────────────────────────────────────────────────────────
    card_title?: string;
    card_padding?: number;
    card_gap?: number;

    // ── StatBar ───────────────────────────────────────────────────────────────
    stat_items?: Array<{ icon?: string; value_expr: string; label?: string; suffix?: string }>;

    // ── Inset ─────────────────────────────────────────────────────────────────
    inset_padding?: string | number;

    // ── ScrollArea ────────────────────────────────────────────────────────────
    /** Maximum height before scrolling (px). Default: 300. Ignored when scroll_fill is true. */
    scroll_max_height?: number;
    scroll_gap?: number;
    /** When true, fills remaining flex space instead of using a fixed maxHeight. */
    scroll_fill?: boolean;

    // ── Timeline ──────────────────────────────────────────────────────────────
    /** Rhai expr returning [{label, sub?, time?, color?}] */
    timeline_expr?: string;
    timeline_empty?: string;

    // ── Avatar ────────────────────────────────────────────────────────────────
    avatar_name?: string;
    avatar_name_expr?: string;
    avatar_src?: string;
    avatar_src_expr?: string;
    /** Size in px. Default: 32. */
    avatar_size?: number;
    /** "online" | "away" | "offline" | "busy" */
    avatar_status?: string;

    // ── CalloutBox ────────────────────────────────────────────────────────────
    /** "tip" | "note" (default) | "warning" | "danger" | "info" */
    callout_kind?: string;
    callout_title?: string;
    callout_message?: string;

    // ── ExpandableText ────────────────────────────────────────────────────────
    /** Rhai expr returning the text string. */
    expand_expr?: string;
    expand_value?: string;
    /** Number of visible lines before collapse. Default: 2. */
    expand_lines?: number;

    // ── SegmentedControl ──────────────────────────────────────────────────────
    segment_key?: string;
    segment_label?: string;
    segment_options?: Array<{ value: string; label: string }>;
    /** Rhai expr returning [{value, label}]. */
    segment_options_expr?: string;
    segment_action_key?: string;

    // ── TextArea ──────────────────────────────────────────────────────────────
    textarea_key?: string;
    textarea_label?: string;
    textarea_placeholder?: string;
    textarea_rows?: number;
    textarea_value_expr?: string;
    textarea_action_key?: string;

    // ── SectionHeader ─────────────────────────────────────────────────────────
    section_label?: string;
    /** Rhai expr returning a count displayed as a badge. */
    section_count_expr?: string;
    section_action_key?: string;
    section_action_label?: string;
    /** When true, clicking toggles children. Requires section_state_key. */
    section_collapsible?: boolean;
    /** State key storing open/closed state (default: open). */
    section_state_key?: string;

    // ── ProgressRing ──────────────────────────────────────────────────────────
    /** Outer diameter in px. Default: 80. */
    ring_size?: number;
    /** Stroke width in px. Default: 6. */
    ring_stroke?: number;
    ring_color?: string;
    ring_track_color?: string;

    // ── Tooltip ───────────────────────────────────────────────────────────────
    /** Text shown in the tooltip on hover. */
    tooltip_text?: string;
    /** "top" (default) | "bottom" | "left" | "right" */
    tooltip_position?: string;

    // ── ConfirmButton ─────────────────────────────────────────────────────────
    /** Label shown after first click, before confirmation. Default: "Confirm?". */
    confirm_label?: string;

    // ── ActionMenu ────────────────────────────────────────────────────────────
    /** Trigger button label. Default: "Actions". */
    menu_label?: string;
    /** Trigger button variant: "default" | "primary" | "ghost". */
    menu_variant?: string;
    /** Optional Lucide icon shown in the trigger button (e.g. "more-horizontal"). */
    menu_icon?: string;

    [key: string]: unknown;
}

/** Reference to a sidebar page defined in a .gdui XML file bundled with the module. */
export interface ModulePageRef {
    id: string;
    label: string;
    icon?: string;
    /** Relative path within the module directory, e.g. "ui/queue.gdui" */
    file: string;
}

/** Static browser-source overlay page — served read-only at
 *  `/overlay/{module_id}/{relative path under file's own directory}`. */
export interface ModuleOverlayRef {
    id: string;
    label: string;
    /** Relative path within the module directory, e.g. "overlay/results.html" */
    file: string;
}

/** @deprecated Use ModulePageRef with .gdui files instead. Kept for type-checking legacy code. */
export interface PageDef {
    id: string;
    label: string;
    icon?: string;
    category?: string;
    layout: LayoutNode;
}

export interface WidgetDef {
    widget_type: string;
    // Table
    columns?: { key: string; label: string }[];
    data_expr?: string;
    actions?: WidgetAction[];
    row_actions?: WidgetAction[];
    // StatCard
    label?: string;
    value_expr?: string;
    // StatusBadge
    // QueuePanel / HistoryPanel
    viewer_data_expr?: string;
    subscriber_data_expr?: string;
    open_expr?: string;
    max_size_expr?: string;
    [key: string]: unknown;
}

export interface PanelDef {
    id: string;
    label: string;
    widgets: WidgetDef[];
}

export interface ModuleManifest {
    id: string;
    name: string;
    version: string;
    min_app_version?: string;
    builtin: boolean;
    enabled: boolean;
    description: string;
    icon: string;
    /** Sidebar pages defined as .gdui XML files in the module's ui/ folder. */
    pages?: ModulePageRef[];
    /** Static browser-source overlay pages in the module's overlay/ folder. */
    overlays?: ModuleOverlayRef[];
    commands: CommandDef[];
    /** Maps script key → relative path within the module directory. */
    scripts?: Record<string, string>;
    /** Libraries and modules this module requires (auto-installed on install). */
    dependencies?: ModuleDependency[];
    /** Libraries bundled inside this module's .gdmod package. */
    bundle?: ModuleBundle;
    /** Relative path to a .gdui file shown under Settings > Modules. */
    settings_page?: string;
    /** Initial sort applied when the module is installed. "alpha" | "register" (default = register). */
    default_sort?: "alpha" | "register";
    /** Opt-in capabilities beyond the default module sandbox — currently only "web" is recognized. */
    permissions?: string[];
}

// ── Licensing ────────────────────────────────────────────────────────────────

export interface VerifyResponse {
    valid: boolean;
    is_sponsor?: boolean;
    is_owner?: boolean;
    github_username?: string;
    github_id?: number;
    expires_at?: string;
    error?: string;
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export interface MarketplaceEntry {
    id: string;
    name: string;
    author: string;
    /** Whether this is a bot-command module or an installable Rhai function library, or a multi-library bundle. */
    package_type?: "module" | "library" | "package";
    /** Approval lifecycle state — only non-published entries carry this. */
    status?: "draft" | "pending" | "published" | "denied";
    deny_reason?: string;
    submitter_username?: string;
    /** Set when a standalone Team owns this package instead of (or in
     *  addition to) the flat co-owner list — see ModuleRepository::owners(). */
    owner_team_id?: number | null;
    owner_team_vanity?: string | null;
    owner_team_name?: string | null;
    /** Current version — pulled from the latest published release. */
    version: string;
    min_app_version: string;
    description: string;
    icon: string;
    /** Manifest-defined accent hex (e.g. "#7c3aed") — when set, the UI uses
     *  this instead of guessing a color from the icon name. */
    color?: string | null;
    verified: boolean;
    premium: boolean;
    downloads: number;
    /** Simple single-value taxonomy, e.g. "Utility" | "Chat Commands" | "Moderation" | "Integrations" | "Fun" | "Automation". */
    category?: string | null;
    /** Cached average of module_reviews.rating, recomputed on every review write/delete. */
    rating_avg?: number | null;
    rating_count?: number;
    tags: string[];
    /** Direct download URL from the latest published release. */
    download_url: string;
    checksum: string;
    /** Changelog from the latest published release. */
    changelog?: string;
    /** Release date of the latest published release. */
    pub_date?: string;
    /** Full manifest object — present only for bundled official modules. */
    manifest?: Record<string, unknown>;
    /** For library packages: component library names this package installs. */
    components?: string[];
    /** For .gdpck bundles: library IDs bundled inside this package. */
    libraries?: string[];
    /** For .gdpck bundles: module IDs bundled inside this package. */
    modules?: string[];
    /** Resource assets for this module (screenshots, banner, icon overrides). */
    resources?: Array<{
        id: number;
        resource_type: "icon" | "screenshot" | "banner" | "asset";
        url: string;
        filename: string;
        sort_order: number;
    }>;
}
