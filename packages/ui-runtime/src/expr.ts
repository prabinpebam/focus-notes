/**
 * The restricted expression language for views (D-60): a JSON Logic subset with Focus Notes
 * reads. No arithmetic, strings, arrays, dates, regular expressions, or custom operations.
 */
import { isRead } from "./types.ts";

export const ALLOWED_OPS = ["==", "!=", "!", "and", "or", "<", "<=", ">", ">=", "in", "if"] as const;
export const MAX_DEPTH = 3;

export function checkExpression(e: unknown, depth = 0, problems: string[] = []): string[] {
  if (depth > MAX_DEPTH) {
    problems.push(`expression is deeper than ${MAX_DEPTH} levels; move the logic into a view-model selector`);
    return problems;
  }
  if (e === null || typeof e !== "object") return problems;
  if (isRead(e)) return problems;
  if (Array.isArray(e)) {
    for (const x of e) checkExpression(x, depth, problems);
    return problems;
  }
  const keys = Object.keys(e);
  if (keys.length !== 1) {
    problems.push(`expression objects have exactly one operator (found ${keys.join(", ") || "none"})`);
    return problems;
  }
  const op = keys[0]!;
  if (!(ALLOWED_OPS as readonly string[]).includes(op)) problems.push(`operator "${op}" is not allowed in views`);
  const args = (e as Record<string, unknown>)[op];
  for (const a of Array.isArray(args) ? args : [args]) checkExpression(a, depth + 1, problems);
  return problems;
}

/** Collects every read path an expression uses. */
export function readsOf(e: unknown, out: string[] = []): string[] {
  if (e === null || typeof e !== "object") return out;
  if (isRead(e)) {
    out.push(e.get);
    return out;
  }
  for (const v of Array.isArray(e) ? e : Object.values(e)) readsOf(v, out);
  return out;
}

export function evaluate(e: unknown, read: (path: string) => unknown): unknown {
  if (e === null || typeof e !== "object") return e;
  if (isRead(e)) return read(e.get);
  if (Array.isArray(e)) return e.map((x) => evaluate(x, read));
  const [op] = Object.keys(e);
  const raw = (e as Record<string, unknown>)[op!];
  const args = Array.isArray(raw) ? raw : [raw];
  const v = (i: number) => evaluate(args[i], read);
  switch (op) {
    case "==": return v(0) === v(1);
    case "!=": return v(0) !== v(1);
    case "!": return !v(0);
    case "and": return args.every((_, i) => Boolean(v(i)));
    case "or": return args.some((_, i) => Boolean(v(i)));
    case "<": return (v(0) as number) < (v(1) as number);
    case "<=": return (v(0) as number) <= (v(1) as number);
    case ">": return (v(0) as number) > (v(1) as number);
    case ">=": return (v(0) as number) >= (v(1) as number);
    case "in": { const hay = v(1); return Array.isArray(hay) ? hay.includes(v(0)) : typeof hay === "string" ? hay.includes(String(v(0))) : false; }
    case "if": {
      for (let i = 0; i + 1 < args.length; i += 2) if (v(i)) return v(i + 1);
      return args.length % 2 === 1 ? v(args.length - 1) : null;
    }
    default: throw new Error(`Operator ${op} is not allowed`);
  }
}
