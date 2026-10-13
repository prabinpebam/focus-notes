/** Every component contract. Plain data with no React, so Node tools (ui:check) can read it. */
import type { Contract } from "./contract.ts";
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
import { contract as LiveRegion } from "./primitives/LiveRegion/contract.ts";
import { contract as Toast } from "./primitives/Toast/contract.ts";
import { contract as ResultList } from "./primitives/ResultList/contract.ts";
import { contract as Tabs } from "./primitives/Tabs/contract.ts";
import { contract as Field } from "./layouts/Field/contract.ts";
import { contract as MorphPanel } from "./primitives/MorphPanel/contract.ts";

export const contracts: readonly Contract[] = [
  Text, Heading, Icon, Button, IconButton, Tooltip, SignalDot, TriggerButton, Divider, PopoverPanel, MenuButton, Shortcut, SearchField, SegmentedControl, DialogPanel, Spinner, LiveRegion, Toast, ResultList, Tabs, MorphPanel,
  Stack, Inline, Surface, Layer, Center, AppRoot, ToolbarRow, Field,
  EditorSurface,
  Trigger, Toolbar, Dialog,
];
export const contractByType = new Map(contracts.map((c) => [c.type, c]));
export { ICON_NAMES, type IconName } from "./icon-names.ts";
export type * from "./contract.ts";
export type * from "./data.ts";