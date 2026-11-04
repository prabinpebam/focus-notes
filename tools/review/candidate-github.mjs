import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function startGitHub(candidate) {
  const file = join(candidate, "local-github.json");
  let state;
  try { state = JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = { owner: "review-user", repositories: [], calls: [] };
  }
  const save = () => writeFile(file, JSON.stringify(state, null, 2));
  const server = createServer(async (req, res) => {
    const respond = (status, value) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(value));
    try {
      const path = new URL(req.url, "http://127.0.0.1").pathname;
      if (req.headers.authorization !== "Bearer focus-notes-local-candidate") {
        respond(401, { message: "Only the synthetic candidate credential is accepted." }); return;
      }
      if (req.method === "GET" && path === "/user") {
        respond(200, { login: state.owner, id: 1, name: "Review user" }); return;
      }
      if (req.method === "POST" && path === "/user/repos") {
        let text = "";
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 4096) { respond(413, { message: "Metadata only." }); return; }
        }
        const body = JSON.parse(text);
        if (body.private !== true || body.auto_init !== false || typeof body.name !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(body.name) || body.name.startsWith(".") || body.description !== "Private notes for Focus Notes" || Object.keys(body).some(key => !["name", "description", "private", "auto_init"].includes(key))) {
          respond(422, { message: "Only an empty private repository can be created." }); return;
        }
        if (state.repositories.some(repo => repo.name.toLowerCase() === body.name.toLowerCase())) {
          respond(422, { message: "Repository name already exists." }); return;
        }
        const repository = { name: body.name, owner: { login: state.owner }, private: true, default_branch: "main", permissions: { push: true } };
        state.repositories.push(repository);
        state.calls.push({ method: "POST", path, body });
        await save();
        respond(201, repository); return;
      }
      const repository = state.repositories.find(repo => path === `/repos/${state.owner}/${repo.name}`);
      if (req.method === "GET" && repository) { respond(200, repository); return; }
      respond(404, { message: "No content, publishing or sharing API exists on this fake." });
    } catch (error) {
      console.error("Local candidate GitHub request failed:", error.message);
      respond(500, { message: "Local candidate GitHub request failed." });
    }
  });
  await save();
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((accept, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : accept()); }),
  };
}
