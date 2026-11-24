/* =====================================================================
 *  GAHLENDORF-SYNC-WORKER v1.0 (Cloudflare Worker) – Kopie des Golf-Workers v2.12,
 *  angepasst für PRIVATE Daten:
 *   · Daten liegen im PRIVATEN Repo (CFG.REPO). Der Worker liest mit dem Token.
 *   · ANDERS als beim Golf-Worker braucht hier auch das LESEN einen Schlüssel
 *     (X-Read-Key = READ_KEY). Sonst könnte jeder mit der Worker-Adresse
 *     Finanzen, Grundbuch und Kontakte abrufen.
 *   · Schreiben wie beim Golf-Worker: SHA-Türsteher, Client merged lokal (409).
 *   · Erlaubt: workbook.json und Bilder unter bilder/ (nur lesen).
 *  ENDPUNKTE
 *   GET  ?sha=1[&path=]     -> {ok,sha}
 *   GET  ?fresh=1[&path=]   -> Rohinhalt + X-Repo-Sha
 *   POST (X-Path, X-Base-Sha, X-Write-Key) -> {ok,sha} | 409
 *  KONFIG (Wrangler-Secrets): GITHUB_TOKEN, READ_KEY, WRITE_KEY
 *   Token: fine-grained, NUR Repo Gahlendorf-Daten, Contents: Read and write.
 * ===================================================================== */
const CFG = {
  REPO: "Golftraining-Lars/Gahlendorf-Daten",
  BRANCH: "main",
  ORIGINS: ["https://golftraining-lars.github.io", "http://localhost:8080", "http://127.0.0.1:8080"],
  WRITE_PATHS: ["workbook.json"],
  READ_PREFIX: ["workbook.json", "bilder/"],
  MAX_BYTES: 25 * 1024 * 1024
};
const cfg = (env, k) => (env && env[k]) || CFG[k] || "";
function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": CFG.ORIGINS.includes(o) ? o : CFG.ORIGINS[0],
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Read-Key,X-Write-Key,X-Path,X-Base-Sha,X-Force,X-Encoding",
    "Access-Control-Expose-Headers": "X-Repo-Sha",
    "Vary": "Origin"
  };
}
const gh = (env, accept) => ({ "Authorization": "Bearer " + cfg(env, "GITHUB_TOKEN"), "Accept": accept,
  "User-Agent": "gahlendorf-sync-worker", "X-GitHub-Api-Version": "2022-11-28" });
function okPath(p, list) { return typeof p === "string" && !p.includes("..") && !p.startsWith("/") && list.some(x => x.endsWith("/") ? p.startsWith(x) : p === x); }
function same(a, b) { if (!a || !b || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
async function ghSha(env, path) {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const r = await fetch(`https://api.github.com/repos/${CFG.REPO}/contents/${dir}?ref=${CFG.BRANCH}`, { headers: gh(env, "application/vnd.github+json") });
  if (!r.ok) throw new Error("GitHub LIST " + r.status);
  const arr = await r.json(); const e = (arr || []).find(x => x.path === path); return e ? e.sha : null;
}
async function ghRaw(env, path) {
  const r = await fetch(`https://api.github.com/repos/${CFG.REPO}/contents/${path}?ref=${CFG.BRANCH}`, { headers: gh(env, "application/vnd.github.raw") });
  if (r.status === 404) return null; if (!r.ok) throw new Error("GitHub RAW " + r.status); return r;
}
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
const TYPES = { json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
export default {
  async fetch(req, env) {
    const C = cors(req);
    const J = (s, o, h) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...C, ...(h || {}) } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: C });
    const url = new URL(req.url);
    if (req.method === "GET" && !url.searchParams.get("sha") && !url.searchParams.get("fresh")) return J(200, { ok: true, worker: "gahlendorf-sync v1.0" });
    if (!same(req.headers.get("X-Read-Key") || "", cfg(env, "READ_KEY"))) return J(401, { ok: false, error: "key" });
    if (req.method === "GET") {
      const p = url.searchParams.get("path") || "workbook.json";
      if (!okPath(p, CFG.READ_PREFIX)) return J(403, { ok: false, error: "path" });
      try {
        if (url.searchParams.get("sha") === "1") return J(200, { ok: true, sha: (await ghSha(env, p)) || "" });
        const [sha, raw] = await Promise.all([p === "workbook.json" ? ghSha(env, p) : Promise.resolve(""), ghRaw(env, p)]);
        if (!raw) return J(404, { ok: false, error: "no data" });
        const ext = (p.split(".").pop() || "").toLowerCase();
        return new Response(raw.body, { status: 200, headers: { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store", "X-Repo-Sha": sha || "", ...C } });
      } catch (e) { return J(502, { ok: false, error: String(e) }); }
    }
    if (req.method !== "POST") return J(405, { ok: false, error: "method" });
    if (!cfg(env, "WRITE_KEY") || !same(req.headers.get("X-Write-Key") || "", cfg(env, "WRITE_KEY"))) return J(401, { ok: false, error: "key" });
    const p = req.headers.get("X-Path");
    if (!okPath(p, CFG.WRITE_PATHS)) return J(403, { ok: false, error: "path" });
    /* Der Client schickt den Inhalt BEREITS als Base64 (X-Encoding: base64). So muss der
       Worker 4–5 MB nicht selbst kodieren – das spart CPU-Zeit im Free-Tier (10 ms). */
    const pre = req.headers.get("X-Encoding") === "base64";
    let content;
    if (pre) { content = (await req.text()).replace(/\s+/g, "");
      if (content.length < 4) return J(400, { ok: false, error: "empty" });
      if (content.length > CFG.MAX_BYTES * 4 / 3) return J(413, { ok: false, error: "zu gross" });
      try { if (!atob(content.slice(0, 64)).trim().startsWith("{")) return J(400, { ok: false, error: "kein JSON" }); } catch (e) { return J(400, { ok: false, error: "kein Base64" }); }
    } else { const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length < 2) return J(400, { ok: false, error: "empty" });
      if (bytes.length > CFG.MAX_BYTES) return J(413, { ok: false, error: "zu gross" });
      if (!new TextDecoder().decode(bytes.subarray(0, 64)).trim().startsWith("{")) return J(400, { ok: false, error: "kein JSON" });
      content = b64(bytes); }
    try {
      const force = req.headers.get("X-Force") === "1";
      const sha = force ? await ghSha(env, p) : (req.headers.get("X-Base-Sha") || null);
      const body = { message: "Arbeitsmappe aktualisiert (PWA)" + (force ? " – autoritativ" : ""), content, branch: CFG.BRANCH };
      if (sha) body.sha = sha;
      const r = await fetch(`https://api.github.com/repos/${CFG.REPO}/contents/${p}`, { method: "PUT", headers: gh(env, "application/vnd.github+json"), body: JSON.stringify(body) });
      if (r.ok) { let ns = ""; try { const j = await r.json(); ns = (j && j.content && j.content.sha) || ""; } catch (e) {} return J(200, { ok: true, sha: ns }, ns ? { "X-Repo-Sha": ns } : undefined); }
      if (r.status === 409 || r.status === 422) return J(409, { ok: false, error: "stale base – frisch holen, neu anwenden" });
      return J(502, { ok: false, error: "write " + r.status });
    } catch (e) { return J(502, { ok: false, error: String(e) }); }
  }
};
