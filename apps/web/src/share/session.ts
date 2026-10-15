/**
 * Where the share reader keeps its session (SHR-10, D-125): only in this tab by default (sessionStorage,
 * so a reload keeps it and closing the tab ends it), on this device when the reader asks (localStorage,
 * until the grant ends), and signing out reaches every open tab (BroadcastChannel). The session is the
 * derived key, what finds its keyring, and the grant's expiry: never the link secret, name, or passcode.
 */
import type { SessionStore } from "@focus-notes/core/share-reader";

const KEY = "focus-notes.share";

const read = (storage: Storage): unknown => {
  const text = storage.getItem(KEY);
  if (text === null) return undefined;
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
};

export function createSessionStore(): SessionStore {
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(KEY) : undefined;
  return {
    load() {
      const tab = read(sessionStorage);
      if (tab !== undefined) return { session: tab, remembered: localStorage.getItem(KEY) !== null };
      const device = read(localStorage);
      return device === undefined ? undefined : { session: device, remembered: true };
    },
    save(session, remembered) {
      const text = JSON.stringify(session);
      sessionStorage.setItem(KEY, text);
      if (remembered) localStorage.setItem(KEY, text);
      else localStorage.removeItem(KEY);
    },
    signOut() {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
      channel?.postMessage("signOut");
    },
    onSignedOut(listener) {
      const onMessage = (e: MessageEvent) => {
        if (e.data !== "signOut") return;
        sessionStorage.removeItem(KEY);
        listener();
      };
      channel?.addEventListener("message", onMessage);
      return () => channel?.removeEventListener("message", onMessage);
    },
  };
}
