const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { getBattleState, performBattleAction, resetBattleState } = require("./src/battle/engine");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 9910);
const serviceName = process.env.SERVICE_NAME || "star-link2-page";
const indexPath = path.join(__dirname, "index.html");
const appScriptPath = path.join(__dirname, "app.js");

function readIndex() {
  return fs.readFileSync(indexPath);
}

function readAppScript() {
  return fs.readFileSync(appScriptPath);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return req.socket.remoteAddress || "";
}

function writeJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function writeText(res, statusCode, contentType, body) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Length": body.length,
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/request-info") {
    writeJson(res, 200, {
      ok: true,
      serviceName,
      listenPort: port,
      method: req.method,
      path: req.url,
      host: req.headers.host || "",
      clientIp: getClientIp(req),
      userAgent: req.headers["user-agent"] || "",
      headers: req.headers,
      serverTime: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/healthz") {
    writeJson(res, 200, {
      ok: true,
      serviceName,
      listenPort: port,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/battle-state" && req.method === "GET") {
    writeJson(res, 200, getBattleState());
    return;
  }

  if (url.pathname === "/api/battle-reset" && req.method === "POST") {
    writeJson(res, 200, {
      ok: true,
      state: resetBattleState(),
    });
    return;
  }

  if (url.pathname === "/api/battle-action" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const state = performBattleAction(payload);

      writeJson(res, 200, {
        ok: true,
        state,
      });
    } catch (error) {
      writeJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (url.pathname === "/app.js" && req.method === "GET") {
    writeText(res, 200, "application/javascript; charset=utf-8", readAppScript());
    return;
  }

  if (url.pathname !== "/") {
    writeJson(res, 404, {
      ok: false,
      error: "Not Found",
      path: url.pathname,
    });
    return;
  }

  writeText(res, 200, "text/html; charset=utf-8", readIndex());
});

server.listen(port, host, () => {
  console.log(`[star-link2] listening on http://${host}:${port}`);
});
