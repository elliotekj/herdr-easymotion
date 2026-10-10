"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTargets,
  createStatus,
  formatPaneLabel,
  parsePluginContext,
  resolvePaneIdFromContext,
  SHORTCUTS,
  sortLayoutPanes,
  truncateMiddle,
} = require("../src/core");

test("parsePluginContext tolerates missing and invalid context", () => {
  assert.deepEqual(parsePluginContext(""), {});
  assert.deepEqual(parsePluginContext("not json"), {});
  assert.deepEqual(parsePluginContext('{"focused_pane_id":"w1:p1"}'), { focused_pane_id: "w1:p1" });
});

test("resolvePaneIdFromContext prefers explicit source env then context pane ids", () => {
  assert.equal(
    resolvePaneIdFromContext(
      { focused_pane: { pane_id: "w1:p2" }, pane_id: "w1:p3" },
      { HERDR_JUMP_SOURCE_PANE_ID: "w1:p1", HERDR_PANE_ID: "w1:p4" },
    ),
    "w1:p1",
  );
  assert.equal(resolvePaneIdFromContext({ focused_pane_id: "w1:p5" }, {}), "w1:p5");
  assert.equal(resolvePaneIdFromContext({}, {}), null);
});

test("sortLayoutPanes sorts row-major by y then x", () => {
  const panes = [
    { pane_id: "right", rect: { x: 90, y: 10 } },
    { pane_id: "top", rect: { x: 0, y: 0 } },
    { pane_id: "left", rect: { x: 0, y: 10 } },
  ];

  assert.deepEqual(sortLayoutPanes(panes).map((pane) => pane.pane_id), ["top", "left", "right"]);
});

test("buildTargets excludes the current pane and assigns shortcuts", () => {
  const layout = {
    focused_pane_id: "w1:p1",
    panes: [
      { pane_id: "w1:p2", rect: { x: 80, y: 0, width: 40, height: 20 } },
      { pane_id: "w1:p1", rect: { x: 0, y: 0, width: 80, height: 20 } },
      { pane_id: "w1:p3", rect: { x: 0, y: 20, width: 120, height: 20 } },
    ],
  };
  const info = new Map([
    ["w1:p2", { pane_id: "w1:p2", label: "server" }],
    ["w1:p3", { pane_id: "w1:p3", terminal_title_stripped: "tests" }],
  ]);

  assert.deepEqual(
    buildTargets(layout, info, "w1:p1").map((target) => ({
      shortcut: target.shortcut,
      paneId: target.paneId,
      label: target.label,
    })),
    [
      { shortcut: "1", paneId: "w1:p2", label: "server" },
      { shortcut: "2", paneId: "w1:p3", label: "tests" },
    ],
  );
});

test("SHORTCUTS reserves q for cancel", () => {
  assert.equal(SHORTCUTS.includes("q"), false);
});

test("buildTargets can include the current pane for visual hint mode", () => {
  const layout = {
    focused_pane_id: "w1:p1",
    panes: [
      { pane_id: "w1:p2", rect: { x: 80, y: 0, width: 40, height: 20 } },
      { pane_id: "w1:p1", rect: { x: 0, y: 0, width: 80, height: 20 } },
    ],
  };

  assert.deepEqual(
    buildTargets(layout, new Map(), "w1:p1", { includeCurrent: true }).map((target) => ({
      shortcut: target.shortcut,
      paneId: target.paneId,
    })),
    [
      { shortcut: "1", paneId: "w1:p1" },
      { shortcut: "2", paneId: "w1:p2" },
    ],
  );
});

test("createStatus handles zoomed and single-pane layouts", () => {
  assert.equal(createStatus({ zoomed: true }, [{ paneId: "w1:p2" }], "w1:p1").message, "Only the zoomed pane is visible.");
  assert.equal(createStatus({ focused_pane_id: "w1:p1", zoomed: false }, [], "w1:p1").message, "No other visible panes.");
  assert.equal(createStatus({ focused_pane_id: "w1:p1", zoomed: false }, [{ paneId: "w1:p2" }], "w1:p1"), null);
});

test("formatPaneLabel falls back through title, agent, cwd, and pane id", () => {
  assert.equal(formatPaneLabel({ pane_id: "w1:p1" }, { label: "api" }), "api");
  assert.equal(formatPaneLabel({ pane_id: "w1:p1" }, { agent: "codex", agent_status: "idle" }), "codex idle");
  assert.equal(formatPaneLabel({ pane_id: "w1:p1" }, { foreground_cwd: "/tmp/project" }), "project");
  assert.equal(formatPaneLabel({ pane_id: "w1:p1" }, {}), "w1:p1");
});

test("truncateMiddle preserves bounds", () => {
  assert.equal(truncateMiddle("abcdef", 6), "abcdef");
  assert.equal(truncateMiddle("abcdefghij", 7), "abc.hij");
});
