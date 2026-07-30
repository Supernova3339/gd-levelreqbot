/**
 * GDUI parser — converts XML module page definitions into LayoutNode trees.
 *
 * File format: UTF-8 XML with a <Page> root element.
 *
 * Layout elements
 * ───────────────
 *   <TwoColumn leftWidth="280">  <Left>…</Left>  <Right>…</Right>  </TwoColumn>
 *   <Stack [direction="horizontal"] [gap="8"] [padding="0"] [align="start|center|end|stretch"]
 *          [fill="true"] [wrap="true"]>…children…</Stack>
 *   <Grid [columns="3"] [gap="12"] [minWidth="160"]>…children…</Grid>
 *     — minWidth uses auto-fill responsive columns (ignores columns attr when set)
 *   <Tabs [selectionKey="selected"]>
 *     <Tab label="…" [badgeExpr="ms.count()"] [showExpr="ms.get_or('flag', true)"] [showKey="state-key"]>…child…</Tab>
 *   </Tabs>
 *     — showExpr/showKey hide the tab entirely (not just its content) when falsy; all
 *       tabs' showExpr are batched into a single eval call. Switching away from a tab
 *       that becomes hidden happens automatically.
 *
 * Interactive elements
 * ────────────────────
 *   <Button [label="…"] [labelExpr="rhai"] [icon="trash-2"] [actionKey="…"]
 *           [variant="primary|ghost|danger|warn|success|default"]
 *           [navigateTo="subpage-id|.."] [stateKey="…" stateValue="…"]
 *           [disabledExpr="…"] [args="a,b"] [argState="selected.id"]
 *     — argState accepts comma-separated dot-paths for multi-arg actions,
 *       e.g. argState="new_level_id, new_level_username"
 *           [afterStateKey="…" afterStateExpr="rhai"]/>
 *     — afterStateKey/afterStateExpr: after actionKey succeeds, eval afterStateExpr
 *       and store it under afterStateKey — e.g. auto-select the level a "Next"
 *       action just popped, so a detail panel bound to that state key shows it
 *       immediately instead of requiring the user to click a row.
 *     — icon alone renders as icon-only button; icon+label renders both
 *   <Text value="expr" [style="default|title|subtitle|muted|accent|error|code"] [size="14"]/>
 *   <Badge value="expr" [variant="default|success|warn|danger|accent"]/>
 *   <Icon name="lucide:star|builtin:queue|local:my-icon" [size="18"] [color="…"]/>
 *   <Divider [label="…"]/>
 *   <Spacer [size="12"]/>
 *   <SectionHeader label="…" [countExpr="rhai"] [actionKey="…"] [actionLabel="…"]
 *                  [collapsible="true"] [stateKey="…"]/>
 *
 * Data widgets
 * ────────────
 *   <Toolbar [statusExpr="…"] [statusOnLabel="Open"] [statusOffLabel="Closed"]
 *            [statusActionOn="open"] [statusActionOff="close"]
 *            [countExpr="…"] [maxExpr="…"]>
 *     <Action label="…" key="…" [style="danger|success|primary"] [args="a,b"]/>
 *   </Toolbar>
 *   <List rowId="field" primary="field" [secondary="field"] [platform="field"]
 *         [positionField="position"] [badgeField="queue_type"]
 *         [selectionKey="selected"] [navigateTo="sub-page-id"] [emptyMessage="…"]>
 *     <Section [label="…"] dataExpr="ms.all()"/>
 *     <RowAction label="…" key="…" [argField="field"] [style="danger"] [icon="trash-2"]/>
 *   </List>
 *   <DetailCard [dataExpr="…"] [placeholder="…"]>
 *     <Field key="…" label="…" [type="text|number|badge|stars|image"]/>
 *   </DetailCard>
 *   <Form [title="…"] [submitKey="save_settings"] [autosave="true|false"]>
 *     — autosave (default true) saves on every change, debounced, with a status strip
 *       instead of a button; autosave="false" reverts to an explicit Save button.
 *     — a Form with many fields scrolls as ONE region on its own (don't split it into
 *       several <Form>s to add visual grouping — each Form's own internal flex sizing
 *       fights its siblings for space instead of stacking naturally). Use [group="…"]
 *       on fields instead: a header is rendered above the first field of each new
 *       group (consecutive same-group fields share one header).
 *     <Input    key="…" label="…" [type="text|number"] [defaultExpr="…"] [placeholder="…"] [group="…"]/>
 *     <Textarea key="…" label="…" [defaultExpr="…"] [placeholder="…"] [group="…"]/>
 *     <Toggle   key="…" label="…" [defaultExpr="…"] [group="…"]/>
 *     <Select   key="…" label="…" [defaultExpr="…"] [group="…"]>  <Option value="…" label="…"/>  </Select>
 *   </Form>
 *   <StatCard [label="…"] [valueExpr="…"] [format="number|percent|duration|text"]/>
 *   <Chart [type="bar|line"] [dataExpr="…"] [xKey="…"] [yKey="…"] [color="…"]/>
 *
 * Composition / control flow
 * ──────────────────────────
 *   <Conditional [showExpr="…"] [showKey="state-key"]>
 *     …then-child…
 *     …else-child…  (optional second child rendered when condition is false)
 *   </Conditional>
 *   <Each items="expr" [as="item"] [keyField="id"]>…template…</Each>
 *   <Import file="ui/parts/queue-list.gdui"/>
 *     — splices in another .gdui file so a page can be broken up into smaller
 *       reusable files. `file` is module-root-relative (like page/icon paths
 *       elsewhere), not relative to the importing file. The imported file's
 *       root must be <Fragment>…children…</Fragment> — the wrapper is
 *       discarded and its children take the <Import>'s place. Fragments may
 *       import further fragments; cycles and depth >8 are rejected. Resolved
 *       by loadGduiDocument() in imports.ts before parsing ever sees it.
 *
 * Input / interaction widgets (all bind to page state via stateKey)
 * ──────────────────────────────────────────────────────────────────
 *   <Select stateKey="…" [placeholder="…"] [label="…"] [actionKey="…"]
 *           [optionsExpr="rhai"] [valueExpr="rhai"]>
 *     <Option value="…" label="…"/>
 *   </Select>
 *   <Input stateKey="…" [type="text|number|password"] [label="…"] [placeholder="…"]
 *          [min="…"] [max="…"] [actionKey="…"] [valueExpr="rhai"]
 *          [afterStateKey="…" afterStateExpr="rhai"]/>
 *     — actionKey dispatches on Enter only (not blur — a blur-triggered dispatch
 *       would double-fire alongside a nearby Button's click, since blur fires
 *       first). afterStateKey/afterStateExpr work like Button's: eval on success,
 *       store under afterStateKey — e.g. afterStateExpr="''" to clear the input.
 *   <Slider stateKey="…" [min="0"] [max="100"] [step="1"] [label="…"]
 *           [valueExpr="rhai"] [actionKey="…"]/>
 *   <MultiSelect stateKey="…" [label="…"] [optionsExpr="rhai"]>
 *     <Option value="…" label="…"/>
 *   </MultiSelect>
 *   <TwoFieldForm actionKey="…" [field1Placeholder="…"] [field2Placeholder="…"]
 *                 [buttonLabel="Add"] [buttonIcon="plus"]/>
 *     — deliberately NOT stateKey-bound: fully local component state, submits
 *       both fields as ONE JSON-object arg (io.parse_json(args[0]) on the
 *       script side: #{field1: "…", field2: "…"}), only clears its inputs on
 *       a successful dispatch. Use for small inline add-forms instead of an
 *       Input+Input+Button trio wired through page state/argState — that
 *       pattern is fragile for multi-field submits.
 *
 * Display widgets
 * ───────────────
 *   <Table dataExpr="rhai" [emptyMessage="…"] [selectionKey="…"]>
 *     <Column key="…" label="…" [type="text|number|badge"]/>
 *     <RowAction label="…" key="…" [argField="…"] [style="danger"] [icon="trash-2"]/>
 *   </Table>
 *   <Alert variant="info|warn|error|success" [title="…"] [message="…"] [expr="rhai"]/>
 *   <Progress expr="rhai" [maxExpr="rhai"] [label="…"] [color="…"] [showValue="true"]/>
 *
 * Layout widgets
 * ──────────────
 *   <Accordion>
 *     <Section label="…" [defaultOpen="true"]>…child…</Section>
 *   </Accordion>
 *   <Drawer triggerLabel="…" [triggerIcon="lucide-name"] [triggerVariant="ghost"]
 *           [title="…"]>…content…</Drawer>
 *
 * Display widgets (v2)
 * ────────────────────
 *   <Heading label="…" [variant="page|section|sub"] [icon="lucide:settings"]/>
 *   <Code [expr="rhai"] [static="…"] [copyable="true"] [wrap="true"]/>
 *   <EmptyState [icon="lucide:inbox"] [message="…"] [actionKey="…"] [actionLabel="…"]/>
 *   <Skeleton [lines="3"] [height="12"]/>
 *   <TagList valueExpr="rhai" [variant="default|accent|success|warn|danger"] [emptyMessage="…"]/>
 *   <KVList dataExpr="rhai" [title="…"] [emptyMessage="…"]/>
 *   <Timeline dataExpr="rhai" [emptyMessage="…"]/>
 *   <Avatar [name="…"|nameExpr="rhai"] [src="url"|srcExpr="rhai"] [size="32"]
 *           [status="online|away|offline|busy"]/>
 *   <Image [srcExpr="rhai"|src="url"] [height="120"] [borderRadius="0"] [fit="cover|contain|fill"]/>
 *   <CalloutBox [kind="tip|note|warning|danger|info"] [title="…"] message="…"/>
 *   <ExpandableText [expr="rhai"] [static="…"] [lines="2"]/>
 *   <ProgressRing expr="rhai" [maxExpr="rhai"] [label="…"] [size="80"] [stroke="6"]
 *                [color="…"] [trackColor="…"] [format="number|percent"] [showValue="true"]/>
 *   <Tooltip text="…" [position="top|bottom|left|right"]>…child…</Tooltip>
 *
 * Layout widgets (v2)
 * ───────────────────
 *   <Card [title="…"] [padding="14"] [gap="10"]>…children…</Card>
 *   <ScrollArea [maxHeight="300"] [gap="0"]>…children…</ScrollArea>
 *
 * Input widgets (v2)
 * ──────────────────
 *   <Toggle stateKey="…" [label="…"] [valueExpr="rhai"] [actionKey="…"]/>
 *   <Checkbox stateKey="…" [label="…"] [valueExpr="rhai"] [actionKey="…"]/>
 *   <RadioGroup stateKey="…" [label="…"] [direction="vertical|horizontal"]
 *               [optionsExpr="rhai"] [actionKey="…"]>
 *     <Option value="…" label="…"/>
 *   </RadioGroup>
 *   <NumberInput stateKey="…" [label="…"] [min="0"] [max="100"] [step="1"]
 *                [valueExpr="rhai"] [actionKey="…"]/>
 *   <CopyButton [valueExpr="rhai"] [static="…"] [label="Copy"] [variant="default|accent"]/>
 *   <SegmentedControl stateKey="…" [label="…"] [optionsExpr="rhai"] [actionKey="…"]>
 *     <Option value="…" label="…"/>
 *   </SegmentedControl>
 *   <TextArea stateKey="…" [label="…"] [placeholder="…"] [rows="4"]
 *             [valueExpr="rhai"] [actionKey="…"]/>
 *   <ConfirmButton label="…" [actionKey="…"] [confirmLabel="Confirm?"]
 *                 [disabledExpr="rhai"] [args="a,b"]/>
 *   <ActionMenu [label="Actions"] [variant="default|primary|ghost"] [selectionKey="…"]>
 *     <Action label="…" key="…" [style="danger|success"] [args="a,b"]/>
 *   </ActionMenu>
 *
 * Sub-pages (defined at <Page> root level, navigated to via Button navigateTo="…")
 * ──────────────────────────────────────────────────────────────────────────────
 *   <SubPage id="detail">…layout…</SubPage>
 *
 *   <Empty/>
 */

import type {
    AccordionSection,
    FieldDef,
    FormFieldDef,
    LayoutNode,
    SelectOption,
    TableColumnDef,
    WidgetAction
} from "../../../lib/types";

export interface ParsedPage {
    id: string;
    label: string;
    icon: string;
    layout: LayoutNode;
    /** Named sub-pages navigable via Button navigateTo="id" */
    subPages: Record<string, LayoutNode>;
}

/** Parse a .gdui XML string into a ParsedPage. Throws on malformed XML.
 *  Does NOT resolve <Import> elements — use loadGduiDocument() (imports.ts)
 *  + parseGduiDocument() for pages that may reference other files. */
export function parseGdui(xml: string): ParsedPage {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const parseErr = doc.querySelector("parsererror");
    if (parseErr) throw new Error(`GDUI parse error: ${parseErr.textContent?.trim()}`);
    return parseGduiDocument(doc);
}

/** Parse an already-resolved Document (see imports.ts) into a ParsedPage. */
export function parseGduiDocument(doc: Document): ParsedPage {
    const root = doc.documentElement;
    if (root.tagName !== "Page") {
        throw new Error(`GDUI root must be <Page>, got <${root.tagName}>`);
    }

    const allChildren = elChildren(root);
    // SubPage elements are top-level siblings of the main layout
    const subPageEls = allChildren.filter(e => e.tagName === "SubPage");
    const contentEls = allChildren.filter(e => e.tagName !== "SubPage");

    const subPages: Record<string, LayoutNode> = {};
    for (const sp of subPageEls) {
        const id = sp.getAttribute("id");
        if (!id) continue;
        const child = elChildren(sp)[0];
        subPages[id] = child ? parseNode(child) : {type: "Empty"};
    }

    return {
        id: root.getAttribute("id") ?? "page",
        label: root.getAttribute("label") ?? "Page",
        icon: root.getAttribute("icon") ?? "box",
        layout: contentEls.length > 0 ? parseNode(contentEls[0]) : {type: "Empty"},
        subPages,
    };
}

// ── Node dispatch ─────────────────────────────────────────────────────────────

function parseNode(el: Element): LayoutNode {
    switch (el.tagName) {
        case "TwoColumn":
            return parseTwoColumn(el);
        case "Stack":
            return parseStack(el);
        case "Grid":
            return parseGrid(el);
        case "Tabs":
            return parseTabs(el);
        case "Toolbar":
            return parseToolbar(el);
        case "List":
            return parseList(el);
        case "DetailCard":
            return parseDetailCard(el);
        case "Form":
            return parseForm(el);
        case "StatCard":
            return parseStatCard(el);
        case "Chart":
            return parseChart(el);
        case "Button":
            return parseButton(el);
        case "Text":
            return parseText(el);
        case "Badge":
            return parseBadge(el);
        case "Icon":
            return parseIcon(el);
        case "Divider":
            return parseDivider(el);
        case "Spacer":
            return parseSpacer(el);
        case "Conditional":
            return parseConditional(el);
        case "Each":
            return parseEach(el);
        // ── Input / interaction widgets ───────────────────────────────────────
        case "Select":
            return parseSelect(el);
        case "Input":
            return parseInput(el);
        case "TwoFieldForm":
            return parseTwoFieldForm(el);
        case "Slider":
            return parseSlider(el);
        case "MultiSelect":
            return parseMultiSelect(el);
        // ── Display widgets ───────────────────────────────────────────────────
        case "Table":
            return parseTable(el);
        case "Alert":
            return parseAlert(el);
        case "Progress":
            return parseProgress(el);
        // ── Layout widgets ────────────────────────────────────────────────────
        case "Accordion":
            return parseAccordion(el);
        case "Drawer":
            return parseDrawer(el);
        // ── New display widgets ───────────────────────────────────────────────
        case "Heading":
            return parseHeading(el);
        case "Code":
            return parseCode(el);
        case "EmptyState":
            return parseEmptyState(el);
        case "Skeleton":
            return parseSkeleton(el);
        case "TagList":
            return parseTagList(el);
        case "KVList":
            return parseKVList(el);
        // ── New input widgets ─────────────────────────────────────────────────
        case "Toggle":
            return parseToggle(el);
        case "Checkbox":
            return parseCheckbox(el);
        case "RadioGroup":
            return parseRadioGroup(el);
        case "NumberInput":
            return parseNumberInput(el);
        case "CopyButton":
            return parseCopyButton(el);
        // ── New layout widgets ────────────────────────────────────────────────
        case "Card":
            return parseCard(el);
        case "ScrollArea":
            return parseScrollArea(el);
        // ── New display widgets ───────────────────────────────────────────────
        case "Timeline":
            return parseTimeline(el);
        case "Avatar":
            return parseAvatar(el);
        case "Image":
            return parseImage(el);
        case "CalloutBox":
            return parseCalloutBox(el);
        case "ExpandableText":
            return parseExpandableText(el);
        case "ProgressRing":
            return parseProgressRing(el);
        case "SectionHeader":
            return parseSectionHeader(el);
        case "Tooltip":
            return parseTooltip(el);
        // ── New input widgets ─────────────────────────────────────────────────
        case "SegmentedControl":
            return parseSegmentedControl(el);
        case "TextArea":
            return parseTextArea(el);
        case "ConfirmButton":
            return parseConfirmButton(el);
        case "ActionMenu":
            return parseActionMenu(el);
        // ── New display / layout widgets ──────────────────────────────────────
        case "StatBar":
            return parseStatBar(el);
        case "Inset":
            return parseInset(el);
        case "Empty":
            return {type: "Empty"};
        default:
            console.warn(`[GDUI] Unknown element <${el.tagName}> — skipped`);
            return {type: "Empty"};
    }
}

// ── Layout parsers ────────────────────────────────────────────────────────────

function parseTwoColumn(el: Element): LayoutNode {
    const leftEl = el.querySelector(":scope > Left");
    const rightEl = el.querySelector(":scope > Right");
    return {
        type: "TwoColumn",
        left_width: numAttr(el, "leftWidth") ?? 280,
        left: leftEl ? parseFirstChild(leftEl) : undefined,
        right: rightEl ? parseFirstChild(rightEl) : undefined,
    };
}

function parseStack(el: Element): LayoutNode {
    return {
        type: "Stack",
        stack_direction: (el.getAttribute("direction") as "horizontal" | "vertical") ?? undefined,
        stack_gap: numAttr(el, "gap") ?? undefined,
        stack_fill: el.getAttribute("fill") === "true",
        stack_padding: numAttr(el, "padding"),
        stack_align: attr(el, "align"),
        stack_justify: attr(el, "justify"),
        stack_wrap: el.getAttribute("wrap") === "true",
        stack_style: attr(el, "style"),
        children: elChildren(el).map(parseNode),
    };
}

function parseGrid(el: Element): LayoutNode {
    const colAttr = el.getAttribute("columns");
    const columns = colAttr ? (isNaN(Number(colAttr)) ? colAttr : Number(colAttr)) : 2;
    return {
        type: "Grid",
        grid_columns: columns,
        grid_gap: numAttr(el, "gap") ?? 12,
        grid_min_width: numAttr(el, "minWidth"),
        children: elChildren(el).map(parseNode),
    };
}

function parseTabs(el: Element): LayoutNode {
    const tabEls = elChildren(el).filter(e => e.tagName === "Tab");
    return {
        type: "Tabs",
        tabs_variant: attr(el, "variant") ?? "underline",
        selection_key: el.getAttribute("selectionKey") ?? undefined,
        tabs: tabEls.map(tab => ({
            label: tab.getAttribute("label") ?? "Tab",
            icon: tab.getAttribute("icon") ?? undefined,
            badge_expr: tab.getAttribute("badgeExpr") ?? undefined,
            show_expr: attr(tab, "showExpr"),
            show_key: attr(tab, "showKey"),
            content: parseFirstChild(tab) ?? {type: "Empty" as const},
        })),
    };
}

// ── Interactive parsers ───────────────────────────────────────────────────────

function parseButton(el: Element): LayoutNode {
    const stateValueRaw = el.getAttribute("stateValue");
    let stateValue: unknown = stateValueRaw;
    if (stateValueRaw === "true") stateValue = true;
    else if (stateValueRaw === "false") stateValue = false;
    else if (stateValueRaw !== null && !isNaN(Number(stateValueRaw))) stateValue = Number(stateValueRaw);

    return {
        type: "Button",
        button_label: el.getAttribute("label") ?? undefined,
        button_label_expr: attr(el, "labelExpr"),
        button_icon: attr(el, "icon"),
        button_action: attr(el, "actionKey"),
        button_args: el.getAttribute("args")?.split(",").map(s => s.trim()).filter(Boolean),
        button_arg_state: attr(el, "argState"),
        button_disabled_expr: attr(el, "disabledExpr"),
        button_variant: (el.getAttribute("variant") as LayoutNode["button_variant"]) ?? "default",
        button_navigate: attr(el, "navigateTo"),
        button_state_key: attr(el, "stateKey"),
        button_state_value: stateValue !== null ? stateValue : undefined,
        button_after_state_key: attr(el, "afterStateKey"),
        button_after_state_expr: attr(el, "afterStateExpr"),
        button_full_width: attr(el, "fullWidth") === "true",
    };
}

function parseText(el: Element): LayoutNode {
    const rawSize = numAttr(el, "size");
    return {
        type: "Text",
        text_expr: attr(el, "value"),
        text_value: el.getAttribute("static") ?? undefined,
        text_style: (el.getAttribute("style") as LayoutNode["text_style"]) ?? "default",
        text_size: rawSize,
        text_wrap: el.getAttribute("wrap") === "true",
    };
}

function parseBadge(el: Element): LayoutNode {
    return {
        type: "Badge",
        badge_expr: attr(el, "value"),
        badge_value: attr(el, "static"),
        badge_variant: (el.getAttribute("variant") as LayoutNode["badge_variant"]) ?? "default",
        badge_color: attr(el, "color"),
    };
}

function parseIcon(el: Element): LayoutNode {
    return {
        type: "Icon",
        icon_name: el.getAttribute("name") ?? undefined,
        icon_size: numAttr(el, "size") ?? 18,
        icon_color: el.getAttribute("color") ?? undefined,
    };
}

function parseDivider(el: Element): LayoutNode {
    return {
        type: "Divider",
        divider_label: attr(el, "label"),
    };
}

function parseSpacer(el: Element): LayoutNode {
    return {
        type: "Spacer",
        spacer_size: numAttr(el, "size"),
    };
}

// ── Control flow parsers ──────────────────────────────────────────────────────

function parseConditional(el: Element): LayoutNode {
    const kids = elChildren(el);
    return {
        type: "Conditional",
        show_expr: attr(el, "showExpr"),
        show_key: attr(el, "showKey"),
        // children[0] = "then", children[1] = optional "else"
        children: kids.map(parseNode),
    };
}

function parseEach(el: Element): LayoutNode {
    const template = elChildren(el)[0];
    return {
        type: "Each",
        items_expr: el.getAttribute("items") ?? undefined,
        item_var: el.getAttribute("as") ?? "item",
        item_key_field: attr(el, "keyField"),
        item_template: template ? parseNode(template) : {type: "Empty"},
    };
}

// ── Data widget parsers ───────────────────────────────────────────────────────

function parseToolbar(el: Element): LayoutNode {
    const actions = elChildren(el)
        .filter(e => e.tagName === "Action")
        .map(parseAction);
    return {
        type: "Toolbar",
        status_expr: attr(el, "statusExpr"),
        status_on_label: attr(el, "statusOnLabel"),
        status_off_label: attr(el, "statusOffLabel"),
        status_action_on: attr(el, "statusActionOn"),
        status_action_off: attr(el, "statusActionOff"),
        count_expr: attr(el, "countExpr"),
        max_expr: attr(el, "maxExpr"),
        actions: actions.length ? actions : undefined,
    };
}

function parseList(el: Element): LayoutNode {
    const sections = elChildren(el)
        .filter(e => e.tagName === "Section")
        .map(s => ({
            label: attr(s, "label"),
            data_expr: s.getAttribute("dataExpr") ?? "",
        }));

    const rowActions = elChildren(el)
        .filter(e => e.tagName === "RowAction")
        .map(parseRowAction);

    return {
        type: "List",
        row_id: attr(el, "rowId"),
        row_primary: attr(el, "primary"),
        row_secondary: attr(el, "secondary"),
        row_platform: attr(el, "platform"),
        row_position_field: attr(el, "positionField"),
        row_badge_field: attr(el, "badgeField"),
        row_secondary_prefix: attr(el, "secondaryPrefix"),
        row_navigate_to: attr(el, "navigateTo"),
        selection_key: attr(el, "selectionKey"),
        empty_message: attr(el, "emptyMessage"),
        sections: sections.length ? sections : undefined,
        row_actions: rowActions.length ? rowActions : undefined,
    };
}

function parseDetailCard(el: Element): LayoutNode {
    const fields = elChildren(el)
        .filter(e => e.tagName === "Field")
        .map(parseField);
    return {
        type: "DetailCard",
        data_expr: attr(el, "dataExpr"),
        placeholder: attr(el, "placeholder"),
        fields: fields.length ? fields : undefined,
    };
}

function parseForm(el: Element): LayoutNode {
    const fieldEls = elChildren(el).filter(e =>
        ["Input", "Textarea", "Toggle", "Select"].includes(e.tagName)
    );
    return {
        type: "Form",
        title: attr(el, "title"),
        submit_key: attr(el, "submitKey"),
        autosave: el.getAttribute("autosave") !== "false",
        form_fields: fieldEls.length ? fieldEls.map(parseFormField) : undefined,
    };
}

function parseStatCard(el: Element): LayoutNode {
    return {
        type: "StatCard",
        value_label: attr(el, "label"),
        value_expr: attr(el, "valueExpr"),
        format: (el.getAttribute("format") as LayoutNode["format"]) ?? undefined,
    };
}

function parseChart(el: Element): LayoutNode {
    return {
        type: "Chart",
        chart_type: (el.getAttribute("type") as "bar" | "line") ?? "bar",
        data_expr: attr(el, "dataExpr"),
        x_key: attr(el, "xKey"),
        y_key: attr(el, "yKey"),
        chart_color: attr(el, "color"),
    };
}

// ── Sub-element parsers ───────────────────────────────────────────────────────

function parseAction(el: Element): WidgetAction {
    const type = attr(el, "type") as WidgetAction["type"] | undefined;
    return {
        label: el.getAttribute("label") ?? "",
        action_key: el.getAttribute("key") ?? "",
        style: (el.getAttribute("style") as WidgetAction["style"]) ?? "default",
        args: el.getAttribute("args")?.split(",").map(s => s.trim()).filter(Boolean),
        icon: attr(el, "icon") ?? undefined,
        navigate_to: attr(el, "navigateTo") ?? undefined,
        text: attr(el, "text") ?? undefined,
        type,
    };
}

function parseRowAction(el: Element): WidgetAction {
    return {
        label: el.getAttribute("label") ?? "",
        action_key: el.getAttribute("key") ?? "",
        arg_field: attr(el, "argField"),
        style: (el.getAttribute("style") as WidgetAction["style"]) ?? "default",
        icon: attr(el, "icon"),
    };
}

function parseField(el: Element): FieldDef {
    return {
        key: el.getAttribute("key") ?? "",
        label: el.getAttribute("label") ?? "",
        type: (el.getAttribute("type") as FieldDef["type"]) ?? "text",
    };
}

function parseFormField(el: Element): FormFieldDef {
    const typeMap: Record<string, FormFieldDef["type"]> = {
        Input: "text",
        Textarea: "textarea",
        Toggle: "toggle",
        Select: "select",
    };
    const baseType = typeMap[el.tagName] ?? "text";
    const attrType = el.getAttribute("type") as FormFieldDef["type"] | null;
    const type: FormFieldDef["type"] = (baseType === "text" && attrType) ? attrType : baseType;

    const options = elChildren(el)
        .filter(c => c.tagName === "Option")
        .map(o => ({
            value: o.getAttribute("value") ?? "",
            label: o.getAttribute("label") ?? o.getAttribute("value") ?? "",
        }));

    return {
        key: el.getAttribute("key") ?? "",
        label: el.getAttribute("label") ?? "",
        type,
        default_expr: attr(el, "defaultExpr"),
        placeholder: attr(el, "placeholder"),
        min: numAttr(el, "min"),
        max: numAttr(el, "max"),
        options: options.length ? options : undefined,
        group: attr(el, "group"),
    };
}

// ── New input / interaction widgets ──────────────────────────────────────────

function parseOptions(el: Element): SelectOption[] | undefined {
    const opts = elChildren(el).filter(c => c.tagName === "Option")
        .map(o => ({
            value: o.getAttribute("value") ?? "",
            label: o.getAttribute("label") ?? o.getAttribute("value") ?? ""
        }));
    return opts.length ? opts : undefined;
}

function parseSelect(el: Element): LayoutNode {
    return {
        type: "Select",
        select_key: attr(el, "stateKey"),
        select_label: attr(el, "label"),
        select_placeholder: attr(el, "placeholder"),
        select_options: parseOptions(el),
        select_options_expr: attr(el, "optionsExpr"),
        select_value_expr: attr(el, "valueExpr"),
        select_action_key: attr(el, "actionKey"),
    };
}

function parseInput(el: Element): LayoutNode {
    return {
        type: "Input",
        input_key: attr(el, "stateKey"),
        input_label: attr(el, "label"),
        input_type: (attr(el, "type") as LayoutNode["input_type"]) ?? "text",
        input_placeholder: attr(el, "placeholder"),
        input_action_key: attr(el, "actionKey"),
        input_value_expr: attr(el, "valueExpr"),
        input_after_state_key: attr(el, "afterStateKey"),
        input_after_state_expr: attr(el, "afterStateExpr"),
        input_min: numAttr(el, "min"),
        input_max: numAttr(el, "max"),
    };
}

function parseTwoFieldForm(el: Element): LayoutNode {
    return {
        type: "TwoFieldForm",
        twoform_action_key: attr(el, "actionKey"),
        twoform_field1_key: attr(el, "field1Key") ?? "field1",
        twoform_field1_placeholder: attr(el, "field1Placeholder"),
        twoform_field2_key: attr(el, "field2Key") ?? "field2",
        twoform_field2_placeholder: attr(el, "field2Placeholder"),
        twoform_button_label: attr(el, "buttonLabel") ?? "Add",
        twoform_button_icon: attr(el, "buttonIcon"),
    };
}

function parseSlider(el: Element): LayoutNode {
    return {
        type: "Slider",
        slider_key: attr(el, "stateKey"),
        slider_label: attr(el, "label"),
        slider_min: numAttr(el, "min") ?? 0,
        slider_max: numAttr(el, "max") ?? 100,
        slider_step: numAttr(el, "step") ?? 1,
        slider_value_expr: attr(el, "valueExpr"),
        slider_action_key: attr(el, "actionKey"),
    };
}

function parseMultiSelect(el: Element): LayoutNode {
    return {
        type: "MultiSelect",
        multi_key: attr(el, "stateKey"),
        multi_label: attr(el, "label"),
        multi_options: parseOptions(el),
        multi_options_expr: attr(el, "optionsExpr"),
    };
}

// ── New display widgets ────────────────────────────────────────────────────────

function parseTable(el: Element): LayoutNode {
    const cols: TableColumnDef[] = elChildren(el)
        .filter(c => c.tagName === "Column")
        .map(c => ({
            key: c.getAttribute("key") ?? "",
            label: c.getAttribute("label") ?? "",
            type: (c.getAttribute("type") as TableColumnDef["type"]) ?? "text",
        }));
    const rowActions = elChildren(el)
        .filter(c => c.tagName === "RowAction")
        .map(parseRowAction);
    return {
        type: "Table",
        table_data_expr: attr(el, "dataExpr"),
        table_columns: cols.length ? cols : undefined,
        table_empty: attr(el, "emptyMessage"),
        table_selection_key: attr(el, "selectionKey"),
        table_row_actions: rowActions.length ? rowActions : undefined,
    };
}

function parseAlert(el: Element): LayoutNode {
    return {
        type: "Alert",
        alert_variant: (attr(el, "variant") as LayoutNode["alert_variant"]) ?? "info",
        alert_title: attr(el, "title"),
        alert_message: attr(el, "message"),
        alert_expr: attr(el, "expr"),
    };
}

function parseProgress(el: Element): LayoutNode {
    return {
        type: "Progress",
        progress_expr: attr(el, "expr"),
        progress_max_expr: attr(el, "maxExpr"),
        progress_label: attr(el, "label"),
        progress_color: attr(el, "color"),
        progress_show_value: attr(el, "showValue") === "true",
    };
}

// ── New layout widgets ────────────────────────────────────────────────────────

function parseAccordion(el: Element): LayoutNode {
    const sections: AccordionSection[] = elChildren(el)
        .filter(c => c.tagName === "Section")
        .map(s => {
            const child = elChildren(s)[0];
            return {
                label: s.getAttribute("label") ?? "",
                default_open: s.getAttribute("defaultOpen") === "true",
                content: child ? parseNode(child) : {type: "Empty" as const},
            };
        });
    return {type: "Accordion", accordion_sections: sections};
}

function parseDrawer(el: Element): LayoutNode {
    const child = elChildren(el)[0];
    return {
        type: "Drawer",
        drawer_trigger_label: attr(el, "triggerLabel") ?? "Open",
        drawer_trigger_icon: attr(el, "triggerIcon"),
        drawer_trigger_variant: attr(el, "triggerVariant") ?? "default",
        drawer_title: attr(el, "title"),
        children: child ? [parseNode(child)] : [],
    };
}

// ── New widget parsers ────────────────────────────────────────────────────────

function parseHeading(el: Element): LayoutNode {
    return {
        type: "Heading",
        heading_label: el.getAttribute("label") ?? undefined,
        heading_variant: (el.getAttribute("variant") as LayoutNode["heading_variant"]) ?? "section",
        heading_icon: attr(el, "icon"),
    };
}

function parseCode(el: Element): LayoutNode {
    return {
        type: "Code",
        code_expr: attr(el, "expr"),
        code_value: attr(el, "static"),
        code_copyable: el.getAttribute("copyable") === "true",
        code_wrap: el.getAttribute("wrap") === "true",
    };
}

function parseEmptyState(el: Element): LayoutNode {
    return {
        type: "EmptyState",
        empty_icon: attr(el, "icon"),
        empty_state_message: attr(el, "message"),
        empty_action_key: attr(el, "actionKey"),
        empty_action_label: attr(el, "actionLabel"),
    };
}

function parseSkeleton(el: Element): LayoutNode {
    return {
        type: "Skeleton",
        skeleton_lines: numAttr(el, "lines"),
        skeleton_height: numAttr(el, "height"),
    };
}

function parseTagList(el: Element): LayoutNode {
    return {
        type: "TagList",
        taglist_expr: attr(el, "valueExpr"),
        taglist_variant: (attr(el, "variant") as LayoutNode["taglist_variant"]) ?? "default",
        taglist_empty: attr(el, "emptyMessage"),
    };
}

function parseKVList(el: Element): LayoutNode {
    return {
        type: "KVList",
        kvlist_expr: attr(el, "dataExpr"),
        kvlist_title: attr(el, "title"),
        kvlist_empty: attr(el, "emptyMessage"),
    };
}

function parseToggle(el: Element): LayoutNode {
    return {
        type: "Toggle",
        toggle_key: attr(el, "stateKey"),
        toggle_label: attr(el, "label"),
        toggle_value_expr: attr(el, "valueExpr"),
        toggle_action_key: attr(el, "actionKey"),
    };
}

function parseCheckbox(el: Element): LayoutNode {
    return {
        type: "Checkbox",
        checkbox_key: attr(el, "stateKey"),
        checkbox_label: attr(el, "label"),
        checkbox_value_expr: attr(el, "valueExpr"),
        checkbox_action_key: attr(el, "actionKey"),
    };
}

function parseRadioGroup(el: Element): LayoutNode {
    const options = elChildren(el)
        .filter(c => c.tagName === "Option")
        .map(o => ({
            value: o.getAttribute("value") ?? "",
            label: o.getAttribute("label") ?? o.getAttribute("value") ?? "",
        }));
    return {
        type: "RadioGroup",
        radio_key: attr(el, "stateKey"),
        radio_label: attr(el, "label"),
        radio_options: options.length ? options : undefined,
        radio_options_expr: attr(el, "optionsExpr"),
        radio_direction: (attr(el, "direction") as LayoutNode["radio_direction"]) ?? "vertical",
        radio_action_key: attr(el, "actionKey"),
    };
}

function parseNumberInput(el: Element): LayoutNode {
    return {
        type: "NumberInput",
        numInput_key: attr(el, "stateKey"),
        numInput_label: attr(el, "label"),
        numInput_min: numAttr(el, "min"),
        numInput_max: numAttr(el, "max"),
        numInput_step: numAttr(el, "step"),
        numInput_value_expr: attr(el, "valueExpr"),
        numInput_action_key: attr(el, "actionKey"),
    };
}

function parseCopyButton(el: Element): LayoutNode {
    return {
        type: "CopyButton",
        copy_value_expr: attr(el, "valueExpr"),
        copy_value: attr(el, "static"),
        copy_label: attr(el, "label"),
        copy_variant: (attr(el, "variant") as LayoutNode["copy_variant"]) ?? "default",
    };
}

// ── New layout widget parsers ─────────────────────────────────────────────────

function parseCard(el: Element): LayoutNode {
    return {
        type: "Card",
        card_title: attr(el, "title"),
        card_padding: numAttr(el, "padding"),
        card_gap: numAttr(el, "gap"),
        children: elChildren(el).map(parseNode),
    };
}

function parseScrollArea(el: Element): LayoutNode {
    return {
        type: "ScrollArea",
        scroll_max_height: numAttr(el, "maxHeight"),
        scroll_gap: numAttr(el, "gap"),
        scroll_fill: attr(el, "fill") === "true",
        children: elChildren(el).map(parseNode),
    };
}

// ── New display widget parsers ───────��────────────────────────────────────────

function parseTimeline(el: Element): LayoutNode {
    return {
        type: "Timeline",
        timeline_expr: attr(el, "dataExpr"),
        timeline_empty: attr(el, "emptyMessage"),
    };
}

function parseImage(el: Element): LayoutNode {
    return {
        type: "Image",
        img_src_expr: attr(el, "srcExpr"),
        img_src: attr(el, "src"),
        img_height: numAttr(el, "height"),
        img_border_radius: numAttr(el, "borderRadius"),
        img_fit: attr(el, "fit"),
    };
}

function parseAvatar(el: Element): LayoutNode {
    return {
        type: "Avatar",
        avatar_name: attr(el, "name"),
        avatar_name_expr: attr(el, "nameExpr"),
        avatar_src: attr(el, "src"),
        avatar_src_expr: attr(el, "srcExpr"),
        avatar_size: numAttr(el, "size"),
        avatar_status: attr(el, "status"),
    };
}

function parseCalloutBox(el: Element): LayoutNode {
    return {
        type: "CalloutBox",
        callout_kind: attr(el, "kind"),
        callout_title: attr(el, "title"),
        callout_message: attr(el, "message"),
    };
}

function parseExpandableText(el: Element): LayoutNode {
    return {
        type: "ExpandableText",
        expand_expr: attr(el, "expr"),
        expand_value: attr(el, "static"),
        expand_lines: numAttr(el, "lines"),
    };
}

function parseProgressRing(el: Element): LayoutNode {
    return {
        type: "ProgressRing",
        progress_expr: attr(el, "expr"),
        progress_max_expr: attr(el, "maxExpr"),
        progress_label: attr(el, "label"),
        progress_show_value: el.getAttribute("showValue") !== "false",
        format: (attr(el, "format") as LayoutNode["format"]) ?? undefined,
        ring_size: numAttr(el, "size"),
        ring_stroke: numAttr(el, "stroke"),
        ring_color: attr(el, "color"),
        ring_track_color: attr(el, "trackColor"),
    };
}

function parseSectionHeader(el: Element): LayoutNode {
    return {
        type: "SectionHeader",
        section_label: attr(el, "label"),
        section_count_expr: attr(el, "countExpr"),
        section_action_key: attr(el, "actionKey"),
        section_action_label: attr(el, "actionLabel"),
        section_collapsible: el.getAttribute("collapsible") === "true",
        section_state_key: attr(el, "stateKey"),
    };
}

function parseTooltip(el: Element): LayoutNode {
    const child = elChildren(el)[0];
    return {
        type: "Tooltip",
        tooltip_text: attr(el, "text"),
        tooltip_position: attr(el, "position"),
        children: child ? [parseNode(child)] : [],
    };
}

// ── New input widget parsers ─────────────────────────────────────────────────

function parseSegmentedControl(el: Element): LayoutNode {
    const options = elChildren(el)
        .filter(c => c.tagName === "Option")
        .map(o => ({
            value: o.getAttribute("value") ?? "",
            label: o.getAttribute("label") ?? o.getAttribute("value") ?? "",
        }));
    return {
        type: "SegmentedControl",
        segment_key: attr(el, "stateKey"),
        segment_label: attr(el, "label"),
        segment_options: options.length ? options : undefined,
        segment_options_expr: attr(el, "optionsExpr"),
        segment_action_key: attr(el, "actionKey"),
    };
}

function parseTextArea(el: Element): LayoutNode {
    return {
        type: "TextArea",
        textarea_key: attr(el, "stateKey"),
        textarea_label: attr(el, "label"),
        textarea_placeholder: attr(el, "placeholder"),
        textarea_rows: numAttr(el, "rows"),
        textarea_value_expr: attr(el, "valueExpr"),
        textarea_action_key: attr(el, "actionKey"),
    };
}

function parseConfirmButton(el: Element): LayoutNode {
    return {
        type: "ConfirmButton",
        button_label: attr(el, "label"),
        button_action: attr(el, "actionKey"),
        button_args: attr(el, "args") ? attr(el, "args")!.split(",").map(s => s.trim()) : undefined,
        button_disabled_expr: attr(el, "disabledExpr"),
        confirm_label: attr(el, "confirmLabel"),
    };
}

function parseActionMenu(el: Element): LayoutNode {
    const actions = elChildren(el)
        .filter(c => c.tagName === "Action")
        .map(parseAction);
    return {
        type: "ActionMenu",
        menu_label: attr(el, "label"),
        menu_variant: attr(el, "variant"),
        menu_icon: attr(el, "icon"),
        selection_key: attr(el, "selectionKey"),
        actions: actions.length ? actions : undefined,
    };
}

// ── StatBar / Inset parsers ───────────────────────────────────────────────────

function parseStatBar(el: Element): LayoutNode {
    const stats = elChildren(el)
        .filter(e => e.tagName === "Stat")
        .map(s => ({
            icon: attr(s, "icon") ?? undefined,
            value_expr: s.getAttribute("valueExpr") ?? "",
            label: attr(s, "label") ?? undefined,
            suffix: attr(s, "suffix") ?? undefined,
        }));
    return {
        type: "StatBar",
        stat_items: stats,
    };
}

function parseInset(el: Element): LayoutNode {
    return {
        type: "Inset",
        inset_padding: attr(el, "padding"),
        children: elChildren(el).map(parseNode),
    };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function elChildren(el: Element): Element[] {
    return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
}

function parseFirstChild(el: Element): LayoutNode | undefined {
    const child = elChildren(el)[0];
    return child ? parseNode(child) : undefined;
}

function attr(el: Element, name: string): string | undefined {
    const v = el.getAttribute(name);
    return v !== null ? v : undefined;
}

function numAttr(el: Element, name: string): number | undefined {
    const v = el.getAttribute(name);
    if (!v) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
}
