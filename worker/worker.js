/* =====================================================================
 *  GAHLENDORF-SYNC-WORKER v2.0 (Cloudflare Worker)
 *  ---------------------------------------------------------------
 *  NEU IN v2.0 (24.11.2026): Die Arbeitsmappe liegt als EINE DATEI JE BLATT im
 *  privaten Repo (meta.json + sheets/*.json, App ab 1.1.0). Gespeichert wird mit
 *  EINEM Commit über die Git-Daten-API (Blobs → Tree → Commit → Ref), der nur die
 *  geänderten Blätter enthält. Das Repo wächst dadurch nur um das, was sich
 *  wirklich ändert – vorher war jeder Speichervorgang ein 4-MB-Commit.
 *
 *  SICHERHEIT (unverändert gegenüber v1):
 *   · Daten im PRIVATEN Repo; LESEN und SCHREIBEN nur mit Schlüssel
 *     (X-Read-Key = READ_KEY, X-Write-Key = WRITE_KEY), Vergleich in konstanter Zeit.
 *   · Schreibbar nur: meta.json, sheets/*.json, bilder/aufgaben/* (Fotos).
 *   · Konfliktschutz: Der Ref wird OHNE force gesetzt. Hat inzwischen jemand
 *     anderes committet (anderes Gerät, Claude-Chat), antwortet der Worker 409 –
 *     die App holt dann frisch und wendet ihre Änderungen erneut an.
 *
 *  ENDPUNKTE
 *   GET  ?manifest=1             -> {ok, commit, files:{pfad: blobSha}}
 *   GET  ?fresh=1&path=…[&ref=]  -> Rohinhalt der Datei (Stand ref bzw. main)
 *   POST ?commit=1  Body JSON {base, message, files:[{path, text}|{path, base64}|{path, delete:true}]}
 *                               -> {ok, commit} | 409
 *  KONFIG (Secrets): GITHUB_TOKEN (fine-grained, nur Gahlendorf-Daten, Contents RW),
 *                    READ_KEY, WRITE_KEY
 * ===================================================================== */
const CFG = {
  REPO: "Golftraining-Lars/Gahlendorf-Daten",
  BRANCH: "main",
  ORIGINS: ["https://golftraining-lars.github.io", "http://localhost:8080", "http://127.0.0.1:8080"],
  WRITE: [/^meta\.json$/, /^sheets\/[a-z0-9-]+\.json$/, /^bilder\/aufgaben\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/],
  READ: [/^meta\.json$/, /^sheets\/[a-z0-9-]+\.json$/, /^bilder\/[A-Za-z0-9._\/-]+$/, /^workbook\.json$/, /^images\.json$/],
  MAX_BYTES: 25 * 1024 * 1024
};
const cfg = (env, k) => (env && env[k]) || CFG[k] || "";
const API = p => `https://api.github.com/repos/${CFG.REPO}${p}`;
function cors(req) {
  const o = req.headers.get("Origin") || "";
  return { "Access-Control-Allow-Origin": CFG.ORIGINS.includes(o) ? o : CFG.ORIGINS[0],
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Read-Key,X-Write-Key",
    "Access-Control-Expose-Headers": "X-Repo-Commit", "Vary": "Origin" };
}
const gh = (env, accept) => ({ "Authorization": "Bearer " + cfg(env, "GITHUB_TOKEN"), "Accept": accept || "application/vnd.github+json",
  "User-Agent": "gahlendorf-sync-worker", "X-GitHub-Api-Version": "2022-11-28" });
const ok = (p, list) => typeof p === "string" && !p.includes("..") && list.some(re => re.test(p));
function same(a, b) { if (!a || !b || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
async function ghJson(env, url, init) { const r = await fetch(url, Object.assign({ headers: gh(env) }, init || {})); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { r, j, t }; }
async function headCommit(env) { const { r, j } = await ghJson(env, API(`/git/ref/heads/${CFG.BRANCH}`)); if (!r.ok) throw new Error("ref " + r.status); return j.object.sha; }
const TYPES = { json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
export default {
  async fetch(req, env) {
    const C = cors(req);
    const J = (s, o, h) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...C, ...(h || {}) } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: C });
    const url = new URL(req.url); const q = url.searchParams;
    if (req.method === "GET" && !q.get("manifest") && !q.get("fresh")) return J(200, { ok: true, worker: "gahlendorf-sync v2.0" });
    if (!same(req.headers.get("X-Read-Key") || "", cfg(env, "READ_KEY"))) return J(401, { ok: false, error: "key" });
    try {
      if (req.method === "GET" && q.get("manifest") === "1") {
        const commit = await headCommit(env);
        const { r: rc, j: c } = await ghJson(env, API(`/git/commits/${commit}`)); if (!rc.ok) throw new Error("commit " + rc.status);
        const { r: rt, j: t } = await ghJson(env, API(`/git/trees/${c.tree.sha}?recursive=1`)); if (!rt.ok) throw new Error("tree " + rt.status);
        const files = {}; for (const e of t.tree || []) if (e.type === "blob" && ok(e.path, CFG.READ)) files[e.path] = e.sha;
        return J(200, { ok: true, commit, files }, { "X-Repo-Commit": commit });
      }
      if (req.method === "GET" && q.get("fresh") === "1") {
        const p = q.get("path") || ""; if (!ok(p, CFG.READ)) return J(403, { ok: false, error: "path" });
        const ref = /^[0-9a-f]{40}$/.test(q.get("ref") || "") ? q.get("ref") : CFG.BRANCH;
        const r = await fetch(API(`/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`), { headers: gh(env, "application/vnd.github.raw") });
        if (r.status === 404) return J(404, { ok: false, error: "no data" }); if (!r.ok) return J(502, { ok: false, error: "raw " + r.status });
        return new Response(r.body, { status: 200, headers: { "Content-Type": TYPES[(p.split(".").pop() || "").toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", ...C } });
      }
      if (req.method !== "POST" || q.get("commit") !== "1") return J(405, { ok: false, error: "method" });
      if (!cfg(env, "WRITE_KEY") || !same(req.headers.get("X-Write-Key") || "", cfg(env, "WRITE_KEY"))) return J(401, { ok: false, error: "key" });
      const len = Number(req.headers.get("Content-Length") || 0); if (len > CFG.MAX_BYTES) return J(413, { ok: false, error: "zu gross" });
      const body = await req.json();
      if (!body || !/^[0-9a-f]{40}$/.test(body.base || "") || !Array.isArray(body.files) || !body.files.length) return J(400, { ok: false, error: "body" });
      for (const f of body.files) if (!ok(f.path, CFG.WRITE)) return J(403, { ok: false, error: "path " + f.path });
      // Basis muss noch der aktuelle Stand sein – sonst 409 (App holt frisch und wendet neu an)
      const head = await headCommit(env); if (head !== body.base) return J(409, { ok: false, error: "stale base", head });
      const { r: rc, j: c } = await ghJson(env, API(`/git/commits/${head}`)); if (!rc.ok) throw new Error("commit " + rc.status);
      const tree = [];
      for (const f of body.files) {
        if (f.delete) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
        if (typeof f.base64 === "string") {
          const { r, j } = await ghJson(env, API("/git/blobs"), { method: "POST", headers: gh(env), body: JSON.stringify({ content: f.base64, encoding: "base64" }) });
          if (!r.ok) throw new Error("blob " + r.status); tree.push({ path: f.path, mode: "100644", type: "blob", sha: j.sha });
        } else if (typeof f.text === "string") tree.push({ path: f.path, mode: "100644", type: "blob", content: f.text });
        else return J(400, { ok: false, error: "inhalt " + f.path });
      }
      const { r: rt, j: t } = await ghJson(env, API("/git/trees"), { method: "POST", headers: gh(env), body: JSON.stringify({ base_tree: c.tree.sha, tree }) });
      if (!rt.ok) throw new Error("tree " + rt.status);
      const msg = String(body.message || "Arbeitsmappe aktualisiert (App)").slice(0, 300);
      const { r: rn, j: n } = await ghJson(env, API("/git/commits"), { method: "POST", headers: gh(env), body: JSON.stringify({ message: msg, tree: t.sha, parents: [head] }) });
      if (!rn.ok) throw new Error("new commit " + rn.status);
      const { r: ru } = await ghJson(env, API(`/git/refs/heads/${CFG.BRANCH}`), { method: "PATCH", headers: gh(env), body: JSON.stringify({ sha: n.sha, force: false }) });
      if (ru.status === 422 || ru.status === 409) return J(409, { ok: false, error: "stale base (race)" });
      if (!ru.ok) throw new Error("ref " + ru.status);
      return J(200, { ok: true, commit: n.sha }, { "X-Repo-Commit": n.sha });
    } catch (e) { return J(502, { ok: false, error: String(e && e.message || e) }); }
  }
};
