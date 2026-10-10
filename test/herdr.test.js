"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { chmodSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { spawn } = require("node:child_process");

const { MAX_TIMEOUT_MS, request, requestTimeoutMs } = require("../src/herdr");

function listen(server, socketPath) {
  return new Promise((resolve) => server.listen(socketPath, resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function runNode(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

test("request sends one newline-delimited pane.focus request", async () => {
  if (process.platform === "win32") {
    return;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "herdr-easymotion-"));
  const socketPath = path.join(dir, "herdr.sock");
  let received;

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.once("data", (chunk) => {
      received = chunk;
      const parsed = JSON.parse(chunk.trim());
      socket.write(JSON.stringify({ id: parsed.id, result: { type: "pane_focus", focused_pane_id: parsed.params.pane_id } }) + "\n");
    });
  });

  await listen(server, socketPath);

  try {
    const response = await request("pane.focus", { pane_id: "w1:p2" }, { socketPath, id: "test-focus" });
    assert.deepEqual(JSON.parse(received.trim()), {
      id: "test-focus",
      method: "pane.focus",
      params: { pane_id: "w1:p2" },
    });
    assert.equal(response.result.focused_pane_id, "w1:p2");
  } finally {
    await close(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("request skips blank frames and accepts a fragmented response", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "herdr-easymotion-"));
  const socketPath = path.join(dir, "herdr.sock");
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.once("data", (chunk) => {
      const requestPayload = JSON.parse(chunk.trim());
      const response = JSON.stringify({ id: requestPayload.id, result: { ok: true } }) + "\n";
      socket.write("\n" + response.slice(0, 8));
      socket.end(response.slice(8));
    });
  });

  await listen(server, socketPath);
  try {
    const response = await request("pane.focus", {}, { socketPath, id: "blank-frame" });
    assert.deepEqual(response.result, { ok: true });
  } finally {
    await close(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("request times out when the server does not respond", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "herdr-easymotion-"));
  const socketPath = path.join(dir, "herdr.sock");
  const server = net.createServer((socket) => socket.resume());

  await listen(server, socketPath);
  try {
    await assert.rejects(request("pane.focus", {}, { socketPath, timeoutMs: 20 }), /timed out after 20ms/);
  } finally {
    await close(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("requestTimeoutMs clamps values beyond Node's timer limit", () => {
  assert.equal(requestTimeoutMs({ timeoutMs: MAX_TIMEOUT_MS + 1 }, {}), MAX_TIMEOUT_MS);
  assert.equal(requestTimeoutMs({}, { HERDR_REQUEST_TIMEOUT_MS: "0" }), 5000);
});

test("open-picker opens an overlay pane", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "herdr-easymotion-"));
  const fakeHerdrPath = path.join(dir, "fake-herdr.js");
  const logPath = path.join(dir, "args.json");

  writeFileSync(
    fakeHerdrPath,
    `#!/usr/bin/env node\nconst fs = require("fs");\nconst args = process.argv.slice(2);\nif (args[0] === "pane" && args[1] === "layout") {\n  process.stdout.write(JSON.stringify({ result: { layout: { focused_pane_id: "w1:p1", zoomed: false, panes: [{ pane_id: "w1:p1", rect: { x: 0, y: 0, width: 80, height: 24 } }, { pane_id: "w1:p2", rect: { x: 80, y: 0, width: 80, height: 24 } }] } } }));\n  process.exit(0);\n}\nif (args[0] === "plugin" && args[1] === "pane" && args[2] === "open") {\n  fs.writeFileSync(process.env.TEST_ARGS_FILE, JSON.stringify(args));\n  process.exit(0);\n}\nprocess.exit(1);\n`,
  );
  chmodSync(fakeHerdrPath, 0o755);

  try {
    const result = await runNode(path.join(__dirname, "..", "src", "open-picker.js"), {
      ...process.env,
      HERDR_BIN_PATH: fakeHerdrPath,
      HERDR_PANE_ID: "w1:p1",
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: "w1:p1" }),
      TEST_ARGS_FILE: logPath,
    });

    assert.equal(result.code, 0);
    const args = JSON.parse(require("node:fs").readFileSync(logPath, "utf8"));
    assert.ok(args.includes("--placement"));
    assert.ok(args.includes("overlay"));
    assert.ok(!args.includes("popup"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("open-picker does not open an overlay when jumping is unavailable", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "herdr-easymotion-"));
  const fakeHerdrPath = path.join(dir, "fake-herdr.js");
  writeFileSync(
    fakeHerdrPath,
    `#!/usr/bin/env node\nconst args = process.argv.slice(2);\nif (args[0] === "pane" && args[1] === "layout") {\n  process.stdout.write(JSON.stringify({ result: { layout: JSON.parse(process.env.TEST_LAYOUT_JSON) } }));\n  process.exit(0);\n}\nprocess.stderr.write("picker should not open");\nprocess.exit(1);\n`,
  );
  chmodSync(fakeHerdrPath, 0o755);

  const layouts = [
    {
      focused_pane_id: "w1:p1",
      zoomed: true,
      panes: [
        { pane_id: "w1:p1", rect: { x: 0, y: 0, width: 80, height: 24 } },
        { pane_id: "w1:p2", rect: { x: 80, y: 0, width: 80, height: 24 } },
      ],
    },
    {
      focused_pane_id: "w1:p1",
      zoomed: false,
      panes: [{ pane_id: "w1:p1", rect: { x: 0, y: 0, width: 80, height: 24 } }],
    },
  ];

  try {
    for (const layout of layouts) {
      const result = await runNode(path.join(__dirname, "..", "src", "open-picker.js"), {
        ...process.env,
        HERDR_BIN_PATH: fakeHerdrPath,
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: "w1:p1" }),
        TEST_LAYOUT_JSON: JSON.stringify(layout),
      });

      assert.equal(result.code, 0);
      assert.equal(result.stderr, "");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
