import { useEffect, useState } from "react";
import { Stack } from "../../layouts/Stack/Stack.tsx";
import { TextField } from "../../primitives/TextField/TextField.tsx";
import { Button } from "../../primitives/Button/Button.tsx";
import { CommitFailure, type CommitState } from "../../primitives/CommitMark/CommitMark.tsx";

/** One-shot credential entry, never bound to a view model.
 * @tier compound
 * @a11y Labelled password field and native save button.
 * @key Tab moves between field and save.
 */
export function SecureKeyField({ label, saveLabel, pendingLabel, savedLabel, entryScope = "", commit = "rest", error, retryLabel, revertLabel, disabled = false, disabledReason, onSave, onRevert }: {
  /** Accessible credential label. */ label: string;
  /** Save action label. */ saveLabel: string;
  /** Provider-check and durable-write label. */ pendingLabel: string;
  /** Confirmed durable-write label. */ savedLabel: string;
  /** Section-local result; never contains a credential. */ commit?: CommitState;
  /** Changing connection or destination discards the old destination's local entry. */ entryScope?: string;
  /** Sanitized failure and recovery labels. */ error?: string; retryLabel?: string; revertLabel?: string;
  /** Connection details must be saved before checking a key. */ disabled?: boolean;
  /** Why Save is unavailable. */ disabledReason?: string;
  /** One-shot credential event; input clears only after confirmed persistence. */ onSave?: (event: { key: string }) => void;
  /** Discards this local entry without changing the saved key. */ onRevert?: () => void;
}) {
  const [key, setKey] = useState("");
  useEffect(() => { if (commit === "confirmed") setKey(""); }, [commit]);
  useEffect(() => setKey(""), [entryScope]);
  const save = () => onSave?.({ key });
  return <Stack gap="stackItem">
    <TextField label={label} type="password" value={key} readOnly={commit === "pending"} onChange={event => setKey(event.value)} />
    <Button label={commit === "pending" ? pendingLabel : commit === "confirmed" ? savedLabel : saveLabel} commit={commit} disabled={commit !== "pending" && (disabled || !key)} {...(disabledReason ? { disabledReason } : {})} onPress={save} />
    {commit === "failed" && error ? <CommitFailure message={error} {...(key && retryLabel ? { retryLabel, onRetry: save } : {})} {...(revertLabel ? { revertLabel, onRevert: () => { setKey(""); onRevert?.(); } } : {})} /> : null}
  </Stack>;
}
