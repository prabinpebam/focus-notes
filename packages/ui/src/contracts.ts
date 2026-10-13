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

export const contracts: readonly Contract[] = [
  Text, Heading, Icon, Button, IconButton, Tooltip, SignalDot, TriggerButton,
  Stack, Inline, Surface, Layer, Center, AppRoot,
  EditorSurface,
  Trigger,
];
export const contractByType = new Map(contracts.map((c) => [c.type, c]));
export { ICON_NAMES, type IconName } from "./icon-names.ts";
export type * from "./contract.ts";