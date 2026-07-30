import type {LayoutNode} from "../../../../lib/types";
// ── Layout ─────────────────────────────────────────────────────────────────────
import {Accordion, Card, Divider, Drawer, Grid, Inset, ScrollArea, Spacer, Stack, Tabs, TwoColumn} from "./layout";
// ── Display ────────────────────────────────────────────────────────────────────
import {
    Alert,
    Avatar,
    Badge,
    CalloutBox,
    Chart,
    Code,
    DetailCard,
    EmptyState,
    ExpandableText,
    Heading,
    Icon,
    Image,
    KVList,
    List,
    Progress,
    ProgressRing,
    SectionHeader,
    Skeleton,
    StatBar,
    StatCard,
    Table,
    TagList,
    Text,
    Timeline,
    Tooltip,
} from "./display";
// ── Input / interaction ────────────────────────────────────────────────────────
import {
    ActionMenu,
    Button,
    Checkbox,
    ConfirmButton,
    CopyButton,
    Form,
    Input,
    MultiSelect,
    NumberInput,
    RadioGroup,
    SegmentedControl,
    Select,
    Slider,
    TextArea,
    Toggle,
    TwoFieldForm,
} from "./inputs";
// ── Data / control flow ────────────────────────────────────────────────────────
import {Conditional, Each, Toolbar} from "./data";

export function NodeRenderer({node}: { node: LayoutNode }) {
    switch (node.type) {
        // ── Layout ─────────────────────────────────────────────────────────────
        case "TwoColumn":
            return <TwoColumn node={node}/>;
        case "Stack":
            return <Stack node={node}/>;
        case "Grid":
            return <Grid node={node}/>;
        case "Tabs":
            return <Tabs node={node}/>;
        case "Accordion":
            return <Accordion node={node}/>;
        case "Drawer":
            return <Drawer node={node}/>;
        case "Divider":
            return <Divider node={node}/>;
        case "Spacer":
            return <Spacer node={node}/>;
        case "Card":
            return <Card node={node}/>;
        case "ScrollArea":
            return <ScrollArea node={node}/>;
        case "Inset":
            return <Inset node={node}/>;

        // ── Data / control flow ─────────────────────────────────────────────────
        case "Toolbar":
            return <Toolbar node={node}/>;
        case "Conditional":
            return <Conditional node={node}/>;
        case "Each":
            return <Each node={node}/>;

        // ── Display ─────────────────────────────────────────────────────────────
        case "List":
            return <List node={node}/>;
        case "DetailCard":
            return <DetailCard node={node}/>;
        case "StatCard":
            return <StatCard node={node}/>;
        case "Chart":
            return <Chart node={node}/>;
        case "Table":
            return <Table node={node}/>;
        case "Alert":
            return <Alert node={node}/>;
        case "Progress":
            return <Progress node={node}/>;
        case "Text":
            return <Text node={node}/>;
        case "Badge":
            return <Badge node={node}/>;
        case "Icon":
            return <Icon node={node}/>;
        case "Heading":
            return <Heading node={node}/>;
        case "Code":
            return <Code node={node}/>;
        case "EmptyState":
            return <EmptyState node={node}/>;
        case "Skeleton":
            return <Skeleton node={node}/>;
        case "TagList":
            return <TagList node={node}/>;
        case "KVList":
            return <KVList node={node}/>;
        case "Timeline":
            return <Timeline node={node}/>;
        case "Avatar":
            return <Avatar node={node}/>;
        case "CalloutBox":
            return <CalloutBox node={node}/>;
        case "ExpandableText":
            return <ExpandableText node={node}/>;
        case "Image":
            return <Image node={node}/>;
        case "ProgressRing":
            return <ProgressRing node={node}/>;
        case "SectionHeader":
            return <SectionHeader node={node}/>;
        case "StatBar":
            return <StatBar node={node}/>;
        case "Tooltip":
            return <Tooltip node={node}/>;

        // ── Input / interaction ─────────────────────────────────────────────────
        case "Button":
            return <Button node={node}/>;
        case "Form":
            return <Form node={node}/>;
        case "Select":
            return <Select node={node}/>;
        case "Input":
            return <Input node={node}/>;
        case "TwoFieldForm":
            return <TwoFieldForm node={node}/>;
        case "Slider":
            return <Slider node={node}/>;
        case "MultiSelect":
            return <MultiSelect node={node}/>;
        case "Toggle":
            return <Toggle node={node}/>;
        case "Checkbox":
            return <Checkbox node={node}/>;
        case "RadioGroup":
            return <RadioGroup node={node}/>;
        case "NumberInput":
            return <NumberInput node={node}/>;
        case "CopyButton":
            return <CopyButton node={node}/>;
        case "SegmentedControl":
            return <SegmentedControl node={node}/>;
        case "TextArea":
            return <TextArea node={node}/>;
        case "ConfirmButton":
            return <ConfirmButton node={node}/>;
        case "ActionMenu":
            return <ActionMenu node={node}/>;

        case "Empty":
        default:
            return null;
    }
}
