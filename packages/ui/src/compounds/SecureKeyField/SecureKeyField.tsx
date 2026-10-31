import { useState } from "react";
import { Stack } from "../../layouts/Stack/Stack.tsx";
import { TextField } from "../../primitives/TextField/TextField.tsx";
import { Button } from "../../primitives/Button/Button.tsx";

/** One-shot credential entry, never bound to a view model.
 * @tier compound
 * @a11y Labelled password field and native save button.
 * @key Tab moves between field and save.
 */
export function SecureKeyField({ label, saveLabel, onSave }: {
  /** Accessible credential label. */ label: string;
  /** Save action label. */ saveLabel: string;
  /** One-shot credential event; input clears immediately. */ onSave?: (event: { key: string }) => void;
}) {
  const [key, setKey] = useState("");
  return <Stack gap="s">
    <TextField label={label} type="password" value={key} onChange={event => setKey(event.value)} />
    <Button label={saveLabel} onPress={() => { onSave?.({ key }); setKey(""); }} />
  </Stack>;
}
