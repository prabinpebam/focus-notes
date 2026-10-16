/**
 * `focus-notes-mcp --workspace <folder> --data <app data folder>` (WP-7.2, D-159): the MCP server on
 * stdio under Node. It's `focus-notes mcp` (WP-7.3, D-165): the terminal principal is sealed before
 * anything else, the server refuses to start while agents can't connect (exit 3), and each agent
 * write is one commit with the workspace's lock held only for it.
 */
import { runCli } from "../cli/run.ts";

process.exitCode = await runCli(["mcp", ...process.argv.slice(2)], { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
