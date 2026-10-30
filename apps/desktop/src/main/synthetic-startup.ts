/**
 * Explicit synthetic E2E configuration, including packaged journeys. Not an OS sandbox:
 * native workspace Git must use only disposable local repositories without remotes/hooks.
 * Account discovery is disabled separately, before it can start a credential helper.
 */
export function syntheticStartup(env: NodeJS.ProcessEnv): boolean {
  if (env.FOCUS_NOTES_E2E_OFFLINE !== "1") return false;
  if (env.FOCUS_NOTES_E2E !== "1" || !env.FOCUS_NOTES_USER_DATA || !env.FOCUS_NOTES_DOCS || env.ALLOW_SCREEN || env.FOCUS_NOTES_E2E_ALLOW_SCREEN) {
    throw Error("synthetic-startup-requires-isolated-invisible-E2E");
  }
  return true;
}

/** Install before startup work, not from a late inspector attachment. */
export function loopbackFetch(transport: typeof fetch, denied: string[]): typeof fetch {
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/^http:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(raw)) {
      denied.push(`blocked:${raw}`);
      throw Error("synthetic-startup-denied");
    }
    // Transport may not follow an allowed loopback response to an outside host.
    return transport(input, { ...init, redirect: "error" });
  };
}
