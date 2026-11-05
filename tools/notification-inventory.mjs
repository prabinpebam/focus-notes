import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const DOC = "documentations/design/ui-states-audit.md";
export const START = "<!-- generated:notification-inventory -->";
export const END = "<!-- /generated:notification-inventory -->";
const reasons = {
  "data-at-risk": "Retained note text or recovered drafts need review before they can be safely stored.",
  "recovery-decision": "Conflicting versions need the person's recovery choice.",
  "operation-control": "The running rewrite's only Stop control must remain reachable.",
};
const cell = (text) => text.replace(/\s+/g, " ").replaceAll("|", "&#124;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("`", "&#96;");

export function scanNotifications(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const rows = [];
  const problems = [];
  const duplicates = new Map();
  function visit(node) {
    if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) && node.expression.text === "toast"
      || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "toast")) {
      const message = node.arguments[0];
      if (!message) problems.push(`${file}: notification has no message`);
      else {
        const options = node.arguments[1];
        const fields = { sticky: [], mustReadReason: [], command: [], action: [] };
        function properties(child) {
          if (ts.isPropertyAssignment(child)) {
            const name = child.name.getText(tree).replaceAll(/["']/g, "");
            if (name in fields) fields[name].push(child.initializer);
          }
          if (ts.isShorthandPropertyAssignment(child) && child.name.text === "action") fields.action.push(child.name);
          ts.forEachChild(child, properties);
        }
        if (options) properties(options);
        const manual = fields.sticky.some((value) => value.kind !== ts.SyntaxKind.FalseKeyword);
        const reasonValues = fields.mustReadReason.map((value) => ts.isStringLiteral(value) ? value.text : "");
        if (manual && (!reasonValues.length || reasonValues.some((reason) => !Object.hasOwn(reasons, reason)))) {
          problems.push(`${file}: must-read notification needs an allowed reason`);
        }
        if (!manual && reasonValues.length) problems.push(`${file}: auto-dismiss notification has a must-read reason`);
        const text = node.getText(tree).replace(/\s+/g, " ");
        const hash = createHash("sha256").update(`${file}:${text}`).digest("hex").slice(0, 12);
        const count = (duplicates.get(hash) ?? 0) + 1;
        duplicates.set(hash, count);
        rows.push({
          id: `${hash}-${count}`, file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          message: message.getText(tree), type: manual ? "must-read" : "auto-dismiss",
          reason: manual ? [...new Set(reasonValues)].map((reason) => `${reason}: ${reasons[reason] ?? "INVALID"}`).join("; ") : "Nonessential outcome; input and recovery remain in their originating surface.",
          action: fields.command.map((value) => value.getText(tree)).join(", ") || fields.action.map((value) => value.getText(tree)).join(", ") || (options && !ts.isObjectLiteralExpression(options) ? "Conditional options; see source" : "None"),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { rows, problems };
}

export function collectNotifications(root) {
  const rows = [], problems = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) {
        const result = scanNotifications(readFileSync(path, "utf8"), relative(root, path).replaceAll("\\", "/"));
        rows.push(...result.rows);
        problems.push(...result.problems);
      }
    }
  }
  walk(join(root, "packages", "core", "src"));
  return { rows, problems };
}

export function renderInventory(rows) {
  return [
    START,
    "| Call ID | Message key or expression | Shown when (source) | Type | Reason | Action |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.id} | ${cell(row.message)} | ${row.file}:${row.line} | ${row.type} | ${cell(row.reason)} | ${cell(row.action)} |`),
    END,
  ].join("\n");
}

export function withInventory(doc, rows) {
  const start = doc.indexOf(START), end = doc.indexOf(END);
  if (start < 0 || end < start) throw new Error("Notification inventory markers are missing");
  return doc.slice(0, start) + renderInventory(rows) + doc.slice(end + END.length);
}

export function lintInventory(doc, rows) {
  if (!doc.includes(START) || !doc.includes(END)) return ["Notification inventory markers are missing"];
  return withInventory(doc, rows) === doc ? [] : ["Notification inventory is out of date: every call needs its exact message, dismissal type and reason; run node tools/notification-inventory.mjs --write"];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const { rows, problems } = collectNotifications(root);
  const path = join(root, DOC);
  const doc = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (process.argv.includes("--write") && !problems.length) writeFileSync(path, withInventory(doc, rows));
  else problems.push(...lintInventory(doc, rows));
  if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
  else console.log(`Notification inventory: ${rows.length} calls covered, ${rows.filter((row) => row.type === "must-read").length} reasoned must-read calls`);
}
