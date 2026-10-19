/**
 * The share reader's part of the design system (IA-VIEW-PUBLIC, WP-5.4): the reader page's components
 * and the few controls its passcode form and footer use, so the page loads nothing else (PRF-05).
 */
import type { Contract } from "./contract.ts";
import { Text } from "./primitives/Text/Text.tsx";
import { Heading } from "./primitives/Heading/Heading.tsx";
import { Button } from "./primitives/Button/Button.tsx";
import { TextField } from "./primitives/TextField/TextField.tsx";
import { Spinner } from "./primitives/Spinner/Spinner.tsx";
import { Stack } from "./layouts/Stack/Stack.tsx";
import { Inline } from "./layouts/Inline/Inline.tsx";
import { ReaderPage } from "./layouts/ReaderPage/ReaderPage.tsx";
import { NoteContent } from "./blocks/NoteContent/NoteContent.tsx";
import { contractByType } from "./contracts.ts";
import { defineRegistry } from "./register.ts";

export const shareRegistry = defineRegistry({ Text, Heading, Button, TextField, Spinner, Stack, Inline, ReaderPage, NoteContent });
export const shareContracts: ReadonlyMap<string, Contract> = new Map(Object.keys(shareRegistry).map((type) => [type, contractByType.get(type)!]));
