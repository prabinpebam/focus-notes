import type { ComponentType } from "react";
import { Text } from "./primitives/Text/Text.tsx";
import { Heading } from "./primitives/Heading/Heading.tsx";
import { Icon } from "./primitives/Icon/Icon.tsx";
import { Button } from "./primitives/Button/Button.tsx";
import { IconButton } from "./primitives/IconButton/IconButton.tsx";
import { Tooltip } from "./primitives/Tooltip/Tooltip.tsx";
import { SignalDot } from "./primitives/SignalDot/SignalDot.tsx";
import { TriggerButton } from "./primitives/TriggerButton/TriggerButton.tsx";
import { Stack } from "./layouts/Stack/Stack.tsx";
import { Inline } from "./layouts/Inline/Inline.tsx";
import { Surface } from "./layouts/Surface/Surface.tsx";
import { Layer } from "./layouts/Layer/Layer.tsx";
import { Center } from "./layouts/Center/Center.tsx";
import { AppRoot } from "./layouts/AppRoot/AppRoot.tsx";
import { EditorSurface } from "./host/EditorSurface/EditorSurface.tsx";
import { TableControls } from "./host/TableControls/TableControls.tsx";
import { Trigger } from "./compounds/Trigger/Trigger.tsx";
import { Divider } from "./primitives/Divider/Divider.tsx";
import { PopoverPanel } from "./primitives/PopoverPanel/PopoverPanel.tsx";
import { MenuButton } from "./primitives/MenuButton/MenuButton.tsx";
import { ToolbarRow } from "./layouts/ToolbarRow/ToolbarRow.tsx";
import { Toolbar } from "./compounds/Toolbar/Toolbar.tsx";
import { Shortcut } from "./primitives/Shortcut/Shortcut.tsx";
import { SearchField } from "./primitives/SearchField/SearchField.tsx";
import { SegmentedControl } from "./primitives/SegmentedControl/SegmentedControl.tsx";
import { DialogPanel } from "./primitives/DialogPanel/DialogPanel.tsx";
import { Dialog } from "./compounds/Dialog/Dialog.tsx";
import { Spinner } from "./primitives/Spinner/Spinner.tsx";
import { LiveRegion } from "./primitives/LiveRegion/LiveRegion.tsx";
import { Toast } from "./primitives/Toast/Toast.tsx";
import { ResultList } from "./primitives/ResultList/ResultList.tsx";
import { Tabs } from "./primitives/Tabs/Tabs.tsx";
import { Field } from "./layouts/Field/Field.tsx";
import { Positioner } from "./layouts/Positioner/Positioner.tsx";
import { MorphPanel } from "./primitives/MorphPanel/MorphPanel.tsx";
import { TextField } from "./primitives/TextField/TextField.tsx";
import { PillButton } from "./primitives/PillButton/PillButton.tsx";
import { FileTree } from "./primitives/FileTree/lazy.tsx";
import { Sheet } from "./layouts/Sheet/Sheet.tsx";

/** The closed registry: the renderer can create these and nothing else (DSY-06). */
export const registry: Readonly<Record<string, ComponentType<any>>> = Object.freeze({
  Text, Heading, Icon, Button, IconButton, Tooltip, SignalDot, TriggerButton, Divider, PopoverPanel, MenuButton, Shortcut, SearchField, SegmentedControl, DialogPanel, Spinner, LiveRegion, Toast, ResultList, Tabs, MorphPanel, TextField, PillButton, FileTree,
  Stack, Inline, Surface, Layer, Center, AppRoot, ToolbarRow, Field, Positioner, Sheet,
  EditorSurface, TableControls,
  Trigger, Toolbar, Dialog,
});