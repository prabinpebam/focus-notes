import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiService } from "../src/main/ai-rewrite.ts";

const crypt = { available: () => true, encrypt: (text: string) => Buffer.from(`sealed:${text}`), decrypt: (data: Buffer) => data.toString().replace(/^sealed:/, "") };
const setup = (fetcher: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }))) => {
  const file = join(mkdtempSync(join(tmpdir(), "fn-ai-commits-")), "ai.json");
  let refuseWrite = false;
  const ai = new AiService(file, crypt, async (path, text) => {
    if (refuseWrite) throw new Error("storage refused");
    writeFileSync(path, text);
  }, fetcher);
  return { ai, file, refuse: (value: boolean) => { refuseWrite = value; } };
};

it("saves independent incomplete connection details without a key or a provider request", async () => {
  let calls = 0;
  const t = setup(async () => { calls++; throw new Error("Details must not contact a provider"); });
  const created = await t.ai.saveDetail({ provider: "openai", field: "name", value: "Writing" });
  const id = created.id;
  expect(created.connections[0]).toMatchObject({ name: "Writing", model: "", hasKey: false });
  expect(created.writer).toBe("");
  await Promise.all([
    t.ai.saveDetail({ id, provider: "openai", field: "model", value: "model-a" }),
    t.ai.saveDetail({ id, provider: "openai", field: "name", value: "New name" }),
  ]);
  expect((await t.ai.settings()).connections[0]).toMatchObject({ id, model: "model-a", name: "New name", hasKey: false });
  expect(calls).toBe(0);
  await expect(t.ai.saveDetail({ id, provider: "openai", field: "key", value: "never accepted" })).rejects.toThrow("invalid-field");
  expect(readFileSync(t.file, "utf8")).not.toContain("never accepted");
  const incomplete = await t.ai.saveDetail({ provider: "compatible", field: "model", value: "model-b" });
  expect(incomplete.writer).toBe("");
  const missingModel = await t.ai.saveDetail({ provider: "openai", field: "name", value: "Incomplete" });
  await expect(t.ai.test(missingModel.id)).rejects.toThrow("invalid-model");
  expect(calls).toBe(0);
});

it("checks a key synthetically before persistence, seals it and never returns it", async () => {
  let answer!: (response: Response) => void;
  let sent!: RequestInit;
  const t = setup(async (_url, init) => { sent = init!; return new Promise(resolve => { answer = resolve; }); });
  const { id } = await t.ai.saveDetail({ provider: "openai", field: "model", value: "model-a" });
  const before = readFileSync(t.file, "utf8");
  const saving = t.ai.saveKey({ id, key: "synthetic-secret" });
  await expect.poll(() => Boolean(answer)).toBe(true);
  expect(readFileSync(t.file, "utf8")).toBe(before);
  expect(JSON.parse(sent.body as string)).toMatchObject({ messages: [{ role: "system", content: "Reply with the single word OK." }, { role: "user", content: "Connection test." }] });
  answer(new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] })));
  const result = await saving;
  expect(result.connections[0]).toMatchObject({ hasKey: true, lastTest: { ok: true } });
  expect(result.writer).toBe(id);
  expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  expect(JSON.parse(readFileSync(t.file, "utf8")).connections[0].key).toBe(Buffer.from("sealed:synthetic-secret").toString("base64"));
});

it("keeps the previous key after a provider check or durable write fails", async () => {
  let status = 200;
  const t = setup(async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status }));
  const saved = await t.ai.save({ provider: "openai", model: "model-a", key: "old-synthetic-key" });
  const id = saved.connections[0]!.id;
  const before = readFileSync(t.file, "utf8");
  status = 401;
  await expect(t.ai.saveKey({ id, key: "bad-synthetic-key" })).rejects.toThrow("unauthorized");
  expect(readFileSync(t.file, "utf8")).toBe(before);
  status = 200; t.refuse(true);
  await expect(t.ai.saveKey({ id, key: "new-synthetic-key" })).rejects.toThrow("storage refused");
  expect(readFileSync(t.file, "utf8")).toBe(before);
  t.refuse(false);
  await t.ai.saveKey({ id, key: "new-synthetic-key" });
  expect((await t.ai.settings()).connections[0]!.hasKey).toBe(true);
});

it("lets details save during a key check, but refuses to attach the key to changed configuration", async () => {
  let answer!: (response: Response) => void;
  const t = setup(async () => new Promise(resolve => { answer = resolve; }));
  const { id } = await t.ai.saveDetail({ provider: "compatible", field: "model", value: "model-a" });
  await t.ai.saveDetail({ id, provider: "compatible", field: "endpoint", value: "https://old.example.test/v1" });
  const saving = t.ai.saveKey({ id, key: "synthetic-secret" });
  await expect.poll(() => Boolean(answer)).toBe(true);
  await t.ai.saveDetail({ id, provider: "compatible", field: "endpoint", value: "https://new.example.test/v1" });
  answer(new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] })));
  await expect(saving).rejects.toThrow("connection-unavailable");
  expect((await t.ai.settings()).connections[0]).toMatchObject({ endpoint: "https://new.example.test/v1", hasKey: false });
});

it("invalid detail changes leave the saved configuration untouched and a new address drops its old key", async () => {
  const t = setup();
  const saved = await t.ai.save({ provider: "compatible", endpoint: "https://old.example.test/v1", model: "model-a", key: "old-synthetic-key" });
  const id = saved.connections[0]!.id;
  const before = readFileSync(t.file, "utf8");
  await expect(t.ai.saveDetail({ id, provider: "compatible", field: "endpoint", value: "http://public.example.test" })).rejects.toThrow("invalid-url");
  expect(readFileSync(t.file, "utf8")).toBe(before);
  const changed = await t.ai.saveDetail({ id, provider: "compatible", field: "endpoint", value: "https://new.example.test/v1" });
  expect(changed.connections[0]).toMatchObject({ endpoint: "https://new.example.test/v1", hasKey: false });
  expect(JSON.parse(readFileSync(t.file, "utf8")).connections[0].key).toBeUndefined();
});
