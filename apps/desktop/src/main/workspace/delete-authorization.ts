import { GitHubApi, type Fetch } from "@focus-notes/github";

export class DeletionAuthorizationError extends Error {
  readonly reason: "declined" | "expired" | "identity" | "failed" | "isolation";
  constructor(reason: DeletionAuthorizationError["reason"]) { super(`Deletion authorization ${reason}`); this.reason = reason; }
}

interface Options {
  token?: string;
  apiFetch: Fetch;
  oauthFetch: Fetch;
  signal: AbortSignal;
  code: (code: string) => void;
  expected: { id: number; login: string };
  current: () => boolean;
}

export const deletionAuthorizationMethod = () => process.env.FOCUS_NOTES_GITHUB_OAUTH_CLIENT_ID ? "device" : "token";

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DeletionAuthorizationError("declined")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** The granting API and token remain local to one operation. */
export async function withDeletionAuthorization<T>(options: Options, use: (api: GitHubApi) => Promise<T>): Promise<T> {
  const o = options;
  const clientId = process.env.FOCUS_NOTES_GITHUB_OAUTH_CLIENT_ID;
  let token = o.token ?? "";
  const check = () => {
    if (o.signal.aborted || !o.current()) throw new DeletionAuthorizationError("declined");
  };
  try {
    check();
    if (token) {
      if (!/^github_pat_[A-Za-z0-9_]{10,244}$/.test(token)) throw new DeletionAuthorizationError("failed");
    } else if (clientId) {
      if (!/^[A-Za-z0-9._-]+$/.test(clientId)) throw new DeletionAuthorizationError("failed");
      const post = async <R,>(path: string, body: Record<string, string>): Promise<R> => {
        const response = await o.oauthFetch(`https://github.com${path}`, {
          method: "POST", redirect: "error", signal: o.signal,
          headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(body).toString(),
        });
        if (!response.ok) throw new DeletionAuthorizationError("failed");
        return response.json() as Promise<R>;
      };
      const device = await post<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>("/login/device/code", { client_id: clientId, scope: "delete_repo" });
      if (typeof device.device_code !== "string" || !device.device_code || device.verification_uri !== "https://github.com/login/device" || typeof device.user_code !== "string" || !/^[A-Z0-9-]{4,20}$/.test(device.user_code) || !Number.isFinite(device.expires_in) || device.expires_in <= 0 || !Number.isFinite(device.interval) || device.interval <= 0) throw new DeletionAuthorizationError("failed");
      o.code(device.user_code);
      const expires = Date.now() + Math.min(device.expires_in, 900) * 1000;
      let interval = device.interval * 1000;
      while (!token) {
        check();
        if (Date.now() + interval >= expires) throw new DeletionAuthorizationError("expired");
        await pause(interval, o.signal);
        const grant = await post<{ access_token?: string; error?: string; scope?: string }>("/login/oauth/access_token", { client_id: clientId, device_code: device.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
        if (grant.error === "authorization_pending") continue;
        if (grant.error === "slow_down") { interval += 5000; continue; }
        if (grant.error === "access_denied") throw new DeletionAuthorizationError("declined");
        if (grant.error === "expired_token") throw new DeletionAuthorizationError("expired");
        if (grant.error || !grant.access_token || !grant.scope?.split(/[ ,]+/).includes("delete_repo")) throw new DeletionAuthorizationError("failed");
        token = grant.access_token;
      }
    } else {
      // Official gh login/logout touch shared keyring slots even with --insecure-storage.
      throw new DeletionAuthorizationError("isolation");
    }
    check();
    const api = new GitHubApi(token, o.apiFetch);
    const account = await api.user();
    if (account.id !== o.expected.id || account.login !== o.expected.login) throw new DeletionAuthorizationError("identity");
    check();
    o.code("");
    return await use(api);
  } finally {
    token = "";
  }
}
