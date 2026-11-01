// A local stdio JSON-RPC peer for the official SDK; it never starts tools or contacts a service.
import { appendFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

if (process.argv.includes("--version")) {
  console.log(process.argv[2] === "unsupported" ? "GitHub Copilot CLI 0.0.1." : "GitHub Copilot CLI 1.0.105.");
  process.exit(0);
}
const mode = process.argv[2];
const log = process.argv[3];
let bytes = Buffer.alloc(0);
let sessionId;
let interval;
const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
};
const event = (type, data) => send({ method: "session.event", params: { sessionId, event: {
  id: randomUUID(), timestamp: new Date().toISOString(), parentId: null, type, data,
} } });
const record = (method, params) => appendFileSync(log, JSON.stringify({ method, params, pid: process.pid, cwd: process.cwd(), state: process.env.COPILOT_HOME, files: readdirSync(process.cwd()) }) + "\n");
function request(message) {
  const { id, method, params } = message;
  if (id === undefined || !method) return;
  record(method, params);
  let result = {};
  switch (method) {
    case "connect": case "ping": result = { protocolVersion: 3 }; break;
    case "auth.getStatus":
      if (mode === "auth-stall") return;
      result = { isAuthenticated: mode !== "signed-out", authType: "gh-cli", statusMessage: "must-not-leak", login: "must-not-leak" };
      break;
    case "session.create":
      sessionId = params.sessionId ?? randomUUID();
      result = { sessionId, capabilities: {} };
      break;
    case "session.tools.getCurrentMetadata": result = { tools: mode === "tools" ? [{ name: "shell" }] : [] }; break;
    case "session.detach": result = { success: true }; break;
    case "session.send":
      result = { messageId: "input" };
      break;
    case "models.list":
      if (mode === "models-stall") return;
      result = { models: [{ id: "model-a", name: "Model A", capabilities: {} }] };
      break;
    case "runtime.shutdown": clearInterval(interval); break;
    case "session.abort": clearInterval(interval); break;
  }
  send({ id, result });
  if (method === "session.send") {
    if (mode === "quota") event("session.error", { errorType: "quota", message: "rate limit must-not-leak" });
    else if (mode === "tool-event") event("tool.execution_start", { toolName: "shell" });
    else if (mode === "stall") {
      event("assistant.message_delta", { messageId: "answer", deltaContent: "Partial" });
      interval = setInterval(() => {}, 1000);
    } else {
      const parts = mode === "huge" ? ["x".repeat(65537)] : mode === "empty" ? [] : ["Short", "er ", "text."];
      if (mode !== "final-only") for (const deltaContent of parts) event("assistant.message_delta", { messageId: "answer", deltaContent });
      if (mode !== "missing-terminal") event("assistant.message", { messageId: "answer", content: parts.join("") });
      event("session.idle", {});
    }
  }
}
process.stdin.on("data", (chunk) => {
  bytes = Buffer.concat([bytes, chunk]);
  while (true) {
    const boundary = bytes.indexOf("\r\n\r\n");
    if (boundary < 0) return;
    const length = Number(/Content-Length:\s*(\d+)/i.exec(bytes.subarray(0, boundary).toString())?.[1]);
    if (!Number.isSafeInteger(length)) throw new Error("Invalid frame");
    const start = boundary + 4;
    if (bytes.length < start + length) return;
    const message = JSON.parse(bytes.subarray(start, start + length).toString());
    bytes = bytes.subarray(start + length);
    request(message);
  }
});
process.stdin.on("end", () => { clearInterval(interval); process.exit(0); });
