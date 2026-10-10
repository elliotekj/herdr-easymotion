#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const { spawn } = require("node:child_process");
const path = require("node:path");
const {
  buildTargets,
  createStatus,
  parsePluginContext,
  resolvePaneIdFromContext,
} = require("./core");
const { renderOverlay } = require("./renderer");
const { paneLayout } = require("./herdr");

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function hideCursor() {
  process.stdout.write("\x1b[?25l");
}

function showCursor() {
  process.stdout.write("\x1b[?25h");
}

function renderStatus(status) {
  clearScreen();
  process.stdout.write(`${status.title}\n\n`);
  process.stdout.write(`${status.message}\n`);
  if (status.detail) {
    process.stdout.write(`${status.detail}\n`);
  }
  process.stdout.write("\nPress any key to close.");
}

function readKey() {
  return new Promise((resolve) => {
    process.stdin.once("data", (chunk) => resolve(chunk.toString("utf8")));
  });
}

function setupTerminal() {
  if (!process.stdin.isTTY) {
    return () => {};
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  hideCursor();
  clearScreen();

  return () => {
    showCursor();
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}

async function waitForDismiss() {
  if (process.stdin.isTTY) {
    await readKey();
  }
}

function keyToShortcut(key) {
  if (key === "\u0003" || key === "\u001b" || key.toLowerCase() === "q") {
    return null;
  }

  return key.toLowerCase();
}

function scheduleFinish(targetPaneId, env = process.env) {
  const child = spawn(
    process.execPath,
    [path.join(__dirname, "finish-selection.js"), targetPaneId || ""],
    {
      cwd: path.join(__dirname, ".."),
      detached: true,
      env,
      stdio: "ignore",
    },
  );
  child.unref();
}

async function main() {
  const restore = setupTerminal();

  try {
    const startupStatus = parsePluginContext(process.env.HERDR_JUMP_STATUS_JSON);
    if (startupStatus?.message) {
      renderStatus(startupStatus);
      await waitForDismiss();
      return;
    }

    const context = parsePluginContext(process.env.HERDR_PLUGIN_CONTEXT_JSON);
    const sourcePaneId = resolvePaneIdFromContext(context, process.env);
    const snapshotLayout = parsePluginContext(process.env.HERDR_JUMP_LAYOUT_JSON);
    const layout = snapshotLayout?.panes ? snapshotLayout : paneLayout(sourcePaneId, process.env);
    const targets = buildTargets(layout, new Map(), sourcePaneId, { includeCurrent: true });
    const status = createStatus(layout, layout?.panes?.length > 1 ? targets : [], sourcePaneId);

    if (status) {
      renderStatus(status);
      await waitForDismiss();
      return;
    }

    const draw = () => {
      clearScreen();
      process.stdout.write(
        renderOverlay(targets, { cols: process.stdout.columns, rows: process.stdout.rows }),
      );
      const footerRow = Math.max(0, (process.stdout.rows || 24) - 1);
      process.stdout.write(`\x1b[${footerRow + 1};1H\x1b[2K Press a key to jump · Esc to cancel`);
    };

    // Rendered into a 100% popup, so the grid matches the layout and panes draw
    // at their original coordinates. If the grid ever changes, re-draw.
    draw();
    process.stdout.on("resize", draw);

    const shortcutMap = new Map(targets.map((target) => [target.shortcut, target]));
    const key = process.stdin.isTTY ? await readKey() : targets[0].shortcut;
    const selected = shortcutMap.get(keyToShortcut(key));

    scheduleFinish(selected?.paneId || "", process.env);
  } finally {
    clearScreen();
    restore();
  }
}

if (require.main === module) {
  main().catch((error) => {
    clearScreen();
    showCursor();
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  keyToShortcut,
  scheduleFinish,
};
