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
import { Trigger } from "./compounds/Trigger/Trigger.tsx";

/** The closed registry: the renderer can create these and nothing else (DSY-06). */
export const registry: Readonly<Record<string, ComponentType<any>>> = Object.freeze({
  Text, Heading, Icon, Button, IconButton, Tooltip, SignalDot, TriggerButton,
  Stack, Inline, Surface, Layer, Center, AppRoot,
  EditorSurface,
  Trigger,
});