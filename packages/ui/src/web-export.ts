/**
 * The one-time browser draft export page's part of the design system (WEB-01, D-292, D-412):
 * only the layout and button primitives `webExport.view.json` uses, with no editor or TipTap code.
 */
import "@focus-notes/tokens/tokens.css";
import type { Contract } from "./contract.ts";
import { Text } from "./primitives/Text/Text.tsx";
import { Heading } from "./primitives/Heading/Heading.tsx";
import { Button } from "./primitives/Button/Button.tsx";
import { Spinner } from "./primitives/Spinner/Spinner.tsx";
import { ReaderPage } from "./layouts/ReaderPage/ReaderPage.tsx";
import { Stack } from "./layouts/Stack/Stack.tsx";
import { Inline } from "./layouts/Inline/Inline.tsx";
import { contractByType } from "./contracts.ts";
import { defineRegistry } from "./register.ts";

export const webExportRegistry = defineRegistry({ ReaderPage, Stack, Heading, Text, Inline, Button, Spinner });
export const webExportContracts: ReadonlyMap<string, Contract> = new Map(Object.keys(webExportRegistry).map((type) => [type, contractByType.get(type)!]));
