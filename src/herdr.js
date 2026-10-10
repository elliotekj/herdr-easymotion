"use strict";

const { spawnSync } = require("node:child_process");
const net = require("node:net");

const MAX_TIMEOUT_MS = 2_147_483_647;

class HerdrRequestError extends Error {
  constructor(code, message) {
    super(code ? `${code}: ${message || "Herdr request failed"}` : message || "Herdr request failed");
    this.name = "HerdrRequestError";
    this.code = code || null;
  }
}

function herdrBin(env = process.env) {
  return env.HERDR_BIN_PATH || "herdr";
}

function requestTimeoutMs(options, env) {
  const value = options.timeoutMs ?? env.HERDR_REQUEST_TIMEOUT_MS ?? 5000;
  const timeoutMs = Number(value);
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, MAX_TIMEOUT_MS) : 5000;
}

function runHerdrJson(args, options = {}) {
  const env = options.env || process.env;
  const result = spawnSync(herdrBin(env), args, {
    cwd: options.cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? `: ${result.stderr.trim()}` : "";
    throw new Error(`herdr ${args.join(" ")} failed with exit ${result.status}${stderr}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`herdr ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

function runHerdr(args, options = {}) {
  const env = options.env || process.env;
  const result = spawnSync(herdrBin(env), args, {
    cwd: options.cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? `: ${result.stderr.trim()}` : "";
    throw new Error(`herdr ${args.join(" ")} failed with exit ${result.status}${stderr}`);
  }

  return result.stdout;
}

function request(method, params = {}, options = {}) {
  const env = options.env || process.env;
  const socketPath = options.socketPath || env.HERDR_SOCKET_PATH;
  if (!socketPath) {
    return Promise.reject(new Error("HERDR_SOCKET_PATH is not set"));
  }

  const id = options.id || `herdr-easymotion:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const payload = JSON.stringify({ id, method, params }) + "\n";
  const timeoutMs = requestTimeoutMs(options, env);

  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    let timeout;

    const socket = net.createConnection(socketPath);

    function finish(error, value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    function handleLine(line) {
      if (!line.trim()) {
        return;
      }

      let response;
      try {
        response = JSON.parse(line);
      } catch (error) {
        finish(new Error(`Herdr returned invalid JSON: ${error.message}`));
        return;
      }

      if (response.id !== id) {
        finish(new Error(`Herdr returned response for unexpected id ${response.id}`));
        return;
      }

      if (response.error) {
        finish(new HerdrRequestError(response.error.code, response.error.message));
        return;
      }

      finish(null, response);
    }

    socket.setEncoding("utf8");
    timeout = setTimeout(() => finish(new Error(`Herdr request ${method} timed out after ${timeoutMs}ms`)), timeoutMs);
    socket.on("connect", () => {
      socket.write(payload);
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      while (!settled) {
        const lineEnd = buffer.indexOf("\n");
        if (lineEnd === -1) {
          break;
        }

        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        handleLine(line);
      }
    });

    socket.on("error", finish);
    socket.on("end", () => {
      if (!settled) {
        finish(new Error("Herdr socket closed before a response was received"));
      }
    });
    socket.on("close", () => {
      if (!settled) {
        finish(new Error("Herdr socket closed before a response was received"));
      }
    });
  });
}

function paneLayout(paneId, env = process.env) {
  const args = ["pane", "layout"];
  if (paneId) {
    args.push("--pane", paneId);
  } else {
    args.push("--current");
  }

  const response = runHerdrJson(args, { env });
  return response.result?.layout ?? response.layout ?? response.result;
}

function paneList(env = process.env) {
  return runHerdrJson(["pane", "list"], { env });
}

function focusPane(paneId, env = process.env) {
  return request("pane.focus", { pane_id: paneId }, { env });
}

module.exports = {
  focusPane,
  HerdrRequestError,
  herdrBin,
  MAX_TIMEOUT_MS,
  paneLayout,
  paneList,
  request,
  requestTimeoutMs,
  runHerdr,
  runHerdrJson,
};
