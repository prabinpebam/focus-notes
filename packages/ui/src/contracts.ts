/** Every component contract. Plain data with no React, so Node tools (ui:check) can read it. */
import type { Contract } from "./contract.ts";
import { contract as SecureKeyField } from "./compounds/SecureKeyField/contract.ts";
import { contract as Text } from "./primitives/Text/contract.ts";
import { contract as Heading } from "./primitives/Heading/contract.ts";
import { contract as Icon } from "./primitives/Icon/contract.ts";
import { contract as Button } from "./primitives/Button/contract.ts";
import { contract as IconButton } from "./primitives/IconButton/contract.ts";
import { contract as Tooltip } from "./primitives/Tooltip/contract.ts";
import { contract as SignalDot } from "./primitives/SignalDot/contract.ts";
import { contract as TriggerButton } from "./primitives/TriggerButton/contract.ts";
import { contract as Stack } from "./layouts/Stack/contract.ts";
import { contract as Inline } from "./layouts/Inline/contract.ts";
import { contract as Surface } from "./layouts/Surface/contract.ts";
import { contract as Layer } from "./layouts/Layer/contract.ts";
import { contract as Center } from "./layouts/Center/contract.ts";
import { contract as AppRoot } from "./layouts/AppRoot/contract.ts";
import { contract as EditorSurface } from "./host/EditorSurface/contract.ts";
import { contract as TableControls } from "./host/TableControls/contract.ts";
import { contract as BlockHandle } from "./host/BlockHandle/contract.ts";
import { contract as Trigger } from "./compounds/Trigger/contract.ts";
import { contract as Divider } from "./primitives/Divider/contract.ts";
import { contract as PopoverPanel } from "./primitives/PopoverPanel/contract.ts";
import { contract as MenuButton } from "./primitives/MenuButton/contract.ts";
import { contract as ToolbarRow } from "./layouts/ToolbarRow/contract.ts";
import { contract as Toolbar } from "./compounds/Toolbar/contract.ts";
import { contract as Shortcut } from "./primitives/Shortcut/contract.ts";
import { contract as SearchField } from "./primitives/SearchField/contract.ts";
import { contract as SegmentedControl } from "./primitives/SegmentedControl/contract.ts";
import { contract as DialogPanel } from "./primitives/DialogPanel/contract.ts";
import { contract as Dialog } from "./compounds/Dialog/contract.ts";
import { contract as Spinner } from "./primitives/Spinner/contract.ts";
import { contract as Skeleton } from "./primitives/Skeleton/contract.ts";
import { contract as LiveRegion } from "./primitives/LiveRegion/contract.ts";
import { contract as Toast } from "./primitives/Toast/contract.ts";
import { contract as ResultList } from "./primitives/ResultList/contract.ts";
import { contract as Tabs } from "./primitives/Tabs/contract.ts";
import { contract as Field } from "./layouts/Field/contract.ts";
import { contract as Positioner } from "./layouts/Positioner/contract.ts";
import { contract as MorphPanel } from "./primitives/MorphPanel/contract.ts";
import { contract as TextField } from "./primitives/TextField/contract.ts";
import { contract as PillButton } from "./primitives/PillButton/contract.ts";
import { contract as FileTree } from "./primitives/FileTree/contract.ts";
import { contract as Sheet } from "./layouts/Sheet/contract.ts";
import { contract as VersionPane } from "./primitives/VersionPane/contract.ts";
import { contract as WindowControls } from "./primitives/WindowControls/contract.ts";
import { contract as WindowFrame } from "./host/WindowFrame/contract.ts";
import { contract as TextMenu } from "./host/TextMenu/contract.ts";
import { contract as ThemeGallery } from "./primitives/ThemeGallery/contract.ts";
import { contract as Slider } from "./primitives/Slider/contract.ts";
import { contract as ColorField } from "./primitives/ColorField/contract.ts";
import { contract as ReaderPage } from "./layouts/ReaderPage/contract.ts";
import { contract as NoteContent } from "./blocks/NoteContent/contract.ts";
import { contract as PrintPage } from "./layouts/PrintPage/contract.ts";
import { contract as AppMark } from "./primitives/AppMark/contract.ts";
import { contract as StepMark } from "./primitives/StepMark/contract.ts";
import { contract as ItemCard } from "./primitives/ItemCard/contract.ts";
import { contract as SaveState } from "./primitives/SaveState/contract.ts";
import { contract as Columns } from "./layouts/Columns/contract.ts";
import { contract as StepDots } from "./primitives/StepDots/contract.ts";
import { contract as StatusRow } from "./primitives/StatusRow/contract.ts";
import { contract as CodeBlock } from "./primitives/CodeBlock/contract.ts";
import { contract as VersionCompare } from "./primitives/VersionCompare/contract.ts";
import { contract as StrengthMeter } from "./primitives/StrengthMeter/contract.ts";
import { contract as ProgressBar } from "./primitives/ProgressBar/contract.ts";
import { contract as DatePicker } from "./primitives/DatePicker/contract.ts";
import { contract as SiteLink } from "./primitives/SiteLink/contract.ts";
import { contract as SitePage } from "./layouts/SitePage/contract.ts";
import { contract as SiteSection } from "./layouts/SiteSection/contract.ts";
import { contract as SiteText } from "./primitives/SiteText/contract.ts";
import { contract as SiteFigure } from "./primitives/SiteFigure/contract.ts";
import { contract as SiteGrid } from "./layouts/SiteGrid/contract.ts";
import { contract as SiteThemeShowcase } from "./primitives/SiteThemeShowcase/contract.ts";

/** Each contract by its type, with its literal types, so the registry checks components against it (D-199). */
export const contractsByType = {
  SecureKeyField,
  Text, Heading, Icon, Button, IconButton, Tooltip, SignalDot, TriggerButton, Divider, PopoverPanel, MenuButton, Shortcut, SearchField, SegmentedControl, DialogPanel, Spinner, Skeleton, LiveRegion, Toast, ResultList, Tabs, MorphPanel, TextField, PillButton, FileTree, VersionPane, WindowControls, ThemeGallery, Slider, ColorField, AppMark, StepMark, ItemCard, SaveState, StepDots, StatusRow, CodeBlock, VersionCompare, StrengthMeter, ProgressBar, DatePicker, SiteLink, SiteText, SiteFigure, SiteThemeShowcase,
  Stack, Inline, Columns, Surface, Layer, Center, AppRoot, ToolbarRow, Field, Positioner, Sheet, ReaderPage, PrintPage, SitePage, SiteSection, SiteGrid,
  EditorSurface, TableControls, BlockHandle, WindowFrame, TextMenu,
  Trigger, Toolbar, Dialog,
  NoteContent,
} as const;
export type ContractsByType = typeof contractsByType;
export const contracts: readonly Contract[] = Object.values(contractsByType);
export const contractByType = new Map(contracts.map((c) => [c.type, c]));
export { ICON_NAMES, type IconName } from "./icon-names.ts";
export type * from "./contract.ts";
export type * from "./data.ts";
export type { Registry, RegisteredComponent, ContractProps, RuntimeValue } from "./register.ts";
export { ITEM_SHAPES, STRING_ITEMS, type ItemShape, type FieldKind } from "./items.ts";