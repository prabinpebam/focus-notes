/** The Focus Notes MCP server (WP-7.2, AGT-01, D-159): stdio only, notes only through the agent permissions. */
export { McpServer, MODERN_VERSION, LEGACY_VERSIONS, SUPPORTED_VERSIONS, SERVER_INFO, REFUSED, type Response } from "./server.ts";
export { serveStdio, MAX_MESSAGE_BYTES } from "./stdio.ts";
export { TOOLS, MESSAGES, applyOperations, runTool, type ToolResult } from "./tools.ts";
export { Refusal, type McpEnv, type AgentCommit, type McpRefusal } from "./notes.ts";
