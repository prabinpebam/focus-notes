/**
 * `node out/main/cli.mjs <command> …` (WP-7.3, D-165): the command-line tool under Node, for
 * development and tests. The packaged app runs the same `runCli` with `--cli` (released builds
 * can't run Electron as Node).
 */
import { runCli } from "./run.ts";

process.exitCode = await runCli(process.argv.slice(2), { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
