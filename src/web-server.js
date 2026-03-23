import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getReviewState,
  approveAndSchedule,
  rejectPending,
  savePendingDraft,
  listPendingBatches,
} from "./review-actions.js";
import { runDailyIdeasBatch } from "./daily-workflow.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {http.IncomingMessage} req
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * @param {http.ServerResponse} res
 * @param {number} code
 * @param {unknown} obj
 */
function json(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

/**
 * @param {string} secret
 * @param {URL} url
 * @param {Record<string, unknown>} [body]
 */
function authorized(secret, url, body) {
  if (!secret) return true;
  if (url.searchParams.get("token") === secret) return true;
  if (body && body.token === secret) return true;
  return false;
}

/**
 * @param {{ port?: number; openBrowser?: boolean }} opts
 */
export function startWebServer(opts = {}) {
  const portRaw =
    opts.port !== undefined
      ? String(opts.port)
      : process.env.PORT
        ? String(process.env.PORT)
        : "3847";
  const parsedPort = Number.parseInt(portRaw, 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3847;
  const hostRaw = opts.host ?? process.env.HOST ?? "127.0.0.1";
  const host = String(hostRaw).trim() || "127.0.0.1";
  const secret = process.env.REVIEW_UI_TOKEN || "";
  const allowDaily = process.env.XAUTO_UI_ALLOW_GENERATE === "1";
  const publicDir = path.join(__dirname, "..", "public");
  const indexPath = path.join(publicDir, "dashboard.html");

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || `127.0.0.1:${port}`;
      const url = new URL(req.url || "/", `http://${host}`);

      if (req.method === "GET" && url.pathname === "/") {
        if (!authorized(secret, url)) {
          res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("REVIEW_UI_TOKEN が設定されています。URL に ?token=（.env の値）を付けてアクセスしてください。");
          return;
        }
        const html = fs.readFileSync(indexPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/batches") {
        if (!authorized(secret, url)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        json(res, 200, { batches: listPendingBatches() });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        if (!authorized(secret, url)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        const batch = url.searchParams.get("batch") || undefined;
        const state = getReviewState(batch);
        json(res, 200, {
          ...state,
          needsToken: !!secret,
          allowDailyGenerate: process.env.XAUTO_UI_ALLOW_GENERATE === "1",
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/approve") {
        const raw = await readBody(req);
        const body = /** @type {Record<string, unknown>} */ (JSON.parse(raw || "{}"));
        if (!authorized(secret, url, body)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        const localId = Number(body.localId);
        const content = String(body.content ?? "");
        const r = approveAndSchedule(localId, content);
        json(res, r.ok ? 200 : 400, r);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reject") {
        const raw = await readBody(req);
        const body = /** @type {Record<string, unknown>} */ (JSON.parse(raw || "{}"));
        if (!authorized(secret, url, body)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        const r = rejectPending(Number(body.localId));
        json(res, r.ok ? 200 : 400, r);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/draft") {
        const raw = await readBody(req);
        const body = /** @type {Record<string, unknown>} */ (JSON.parse(raw || "{}"));
        if (!authorized(secret, url, body)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        const r = savePendingDraft(Number(body.localId), String(body.content ?? ""));
        json(res, r.ok ? 200 : 400, r);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/daily") {
        const raw = await readBody(req);
        const body = /** @type {Record<string, unknown>} */ (JSON.parse(raw || "{}"));
        if (!authorized(secret, url, body)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        if (!allowDaily) {
          json(res, 403, {
            error:
              "ブラウザからの一括生成は無効です。ターミナルで node cli.js daily を実行するか、.env に XAUTO_UI_ALLOW_GENERATE=1 を設定してください。",
          });
          return;
        }
        try {
          const out = await runDailyIdeasBatch({ refreshCompetitors: body.refresh !== false });
          json(res, 200, { ok: true, batchId: out.batchId });
        } catch (e) {
          console.error(e);
          json(res, 500, { ok: false, error: String(/** @type {Error} */ (e).message || e) });
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        json(res, 200, { ok: true });
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (e) {
      console.error(e);
      json(res, 500, { error: String(/** @type {Error} */ (e).message || e) });
    }
  });

  server.on("error", (e) => {
    console.error("[xauto] web server error", e);
  });

  server.listen(port, host, () => {
    if ((host === "0.0.0.0" || host === "::") && !secret) {
      console.warn("[xauto] 警告: REVIEW_UI_TOKEN 未設定。承認UIが誰でも開けます。");
    }
    const tok = secret ? `?token=${encodeURIComponent(secret)}` : "";
    const localHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    const local = `http://${localHost}:${port}${tok}`;
    console.log(`\n承認UI: ${local}`);
    const pub = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
    if (pub) console.log(`公開URL: ${pub}${tok}`);
    if (host === "127.0.0.1" || host === "::1") {
      console.log("（ローカルのみ。終了は Ctrl+C）\n");
    } else {
      console.log("（クラウド: REVIEW_UI_TOKEN 必須推奨。終了はプロセス停止）\n");
    }
    const openUrl = pub ? `${pub}${tok}` : local;
    if (opts.openBrowser && process.platform === "darwin") {
      spawn("open", [openUrl], { stdio: "ignore", detached: true });
    }
  });

  return server;
}
