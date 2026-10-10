"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GLYPHS,
  HINT_COLORS,
  MAX_SCALE,
  ansiBg,
  ansiReset,
  colorForIndex,
  computeScale,
  cursorTo,
  renderOverlay,
  renderHints,
  renderPaneFrame,
  renderPaneHint,
  terminalBounds,
} = require("../src/renderer");

function rgbDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

test("GLYPHS defines all shortcut characters", () => {
  const expected = "123456789abcdefghijklmnopqrstuvwxyz".split("");
  for (const ch of expected) {
    assert.ok(GLYPHS[ch], `missing glyph for "${ch}"`);
    assert.equal(GLYPHS[ch].length, 7);
    assert.equal(GLYPHS[ch][0].length, 5);
  }
});

test("hint colors use high-contrast ANSI neighbors", () => {
  assert.equal(HINT_COLORS.length, 12);
  for (let index = 0; index < HINT_COLORS.length; index += 1) {
    const next = (index + 1) % HINT_COLORS.length;
    assert.ok(rgbDistance(colorForIndex(index), colorForIndex(next)) >= 190);
  }
});

test("colorForIndex wraps around", () => {
  assert.deepEqual(colorForIndex(0), HINT_COLORS[0]);
  assert.deepEqual(colorForIndex(HINT_COLORS.length), HINT_COLORS[0]);
});

test("ansiBg / cursorTo produce expected escape codes", () => {
  assert.equal(ansiBg(255, 128, 0), "\x1b[48;2;255;128;0m");
  assert.equal(ansiReset(), "\x1b[0m");
  assert.equal(cursorTo(0, 0), "\x1b[1;1H");
  assert.equal(cursorTo(5, 10), "\x1b[6;11H");
});

test("computeScale caps scale at MAX_SCALE for large panes", () => {
  const scale = computeScale({ width: 120, height: 80 }, { cols: Infinity, rows: Infinity }, 5, 7);
  assert.equal(scale, MAX_SCALE);
});

test("computeScale shrinks for small panes and never goes below 1", () => {
  const small = computeScale({ width: 12, height: 10 }, { cols: Infinity, rows: Infinity }, 5, 7);
  assert.equal(small, 1);

  const tiny = computeScale({ width: 6, height: 8 }, { cols: Infinity, rows: Infinity }, 5, 7);
  assert.equal(tiny, 1);
});

test("computeScale also respects terminal bounds", () => {
  const scale = computeScale({ width: 200, height: 200 }, { cols: 20, rows: 14 }, 5, 7);
  assert.ok(scale <= Math.floor(20 / 5));
  assert.ok(scale <= Math.floor(14 / 7));
});

test("renderPaneHint bounds a large pane to a small glyph", () => {
  const target = { shortcut: "2", paneId: "w1:p2", rect: { x: 100, y: 40, width: 95, height: 110 } };
  const output = renderPaneHint(target, 1, { cols: 190, rows: 110 });

  const maxRows = 7 * MAX_SCALE;
  const rowAnchors = (output.match(/\x1b\[\d+;\d+H/g) || []).length;
  assert.ok(rowAnchors > 0, "should emit cursor positioning");
  assert.ok(rowAnchors <= maxRows, `expected at most ${maxRows} drawn rows, got ${rowAnchors}`);

  // No drawn row may target a terminal row/column beyond the bounds.
  for (const match of output.matchAll(/\x1b\[(\d+);(\d+)H/g)) {
    const row = Number(match[1]) - 1;
    const col = Number(match[2]) - 1;
    assert.ok(row >= 0 && row < 110, `row ${row} out of bounds`);
    assert.ok(col >= 0 && col < 190, `col ${col} out of bounds`);
  }
});

test("renderHints never writes past the terminal bounds", () => {
  const targets = [
    { shortcut: "1", paneId: "w1:p1", rect: { x: 0, y: 0, width: 95, height: 110 } },
    { shortcut: "2", paneId: "w1:p2", rect: { x: 95, y: 0, width: 95, height: 110 } },
  ];
  const output = renderHints(targets, { cols: 190, rows: 110 });
  for (const match of output.matchAll(/\x1b\[(\d+);(\d+)H/g)) {
    const row = Number(match[1]) - 1;
    const col = Number(match[2]) - 1;
    assert.ok(row >= 0 && row < 110);
    assert.ok(col >= 0 && col < 190);
  }
});

test("renderPaneHint skips panes too small for a hint", () => {
  assert.equal(renderPaneHint({ shortcut: "1", rect: { x: 0, y: 0, width: 5, height: 24 } }, 0), "");
  assert.equal(renderPaneHint({ shortcut: "1", rect: { x: 0, y: 0, width: 24, height: 7 } }, 0), "");
  assert.equal(renderPaneHint({ shortcut: "1", rect: { x: 0, y: 0 } }, 0), "");
});

test("terminalBounds falls back to Infinity when size is unknown", () => {
  assert.deepEqual(terminalBounds({ stdout: {} }), { cols: Infinity, rows: Infinity });
  assert.deepEqual(terminalBounds({ cols: 80, rows: 24 }), { cols: 80, rows: 24 });
});

test("renderPaneFrame draws a rectangle outline within bounds", () => {
  const output = renderPaneFrame({ x: 2, y: 2, width: 10, height: 6 }, { cols: 80, rows: 24 });
  const anchors = [...output.matchAll(/\x1b\[(\d+);(\d+)H/g)].map((m) => [Number(m[1]) - 1, Number(m[2]) - 1]);
  assert.ok(anchors.length > 0);
  for (const [row, col] of anchors) {
    assert.ok(row >= 2 && row <= 7, `row ${row} outside frame`);
    assert.ok(col >= 2 && col <= 11, `col ${col} outside frame`);
  }
});

test("renderOverlay draws a frame and a bounded badge for every pane", () => {
  const targets = [
    { shortcut: "1", paneId: "a", rect: { x: 0, y: 0, width: 90, height: 28 } },
    { shortcut: "2", paneId: "b", rect: { x: 90, y: 0, width: 90, height: 28 } },
  ];
  const output = renderOverlay(targets, { cols: 180, rows: 28 });

  const anchors = [...output.matchAll(/\x1b\[(\d+);(\d+)H/g)].map((m) => [Number(m[1]) - 1, Number(m[2]) - 1]);
  assert.ok(anchors.some(([, c]) => c >= 90), "second pane must be drawn");
  assert.ok(anchors.some(([, c]) => c < 90), "first pane must be drawn");
  for (const [row, col] of anchors) {
    assert.ok(row >= 0 && row < 28);
    assert.ok(col >= 0 && col < 180);
  }
  assert.ok(output.includes(ansiBg(...HINT_COLORS[0])));
  assert.ok(output.includes(ansiBg(...HINT_COLORS[1])));
});

test("renderOverlay draws panes at their ORIGINAL coordinates (no scaling)", () => {
  const targets = [
    { shortcut: "1", paneId: "a", rect: { x: 0, y: 0, width: 90, height: 28 } },
    { shortcut: "2", paneId: "b", rect: { x: 90, y: 0, width: 90, height: 28 } },
  ];
  const output = renderOverlay(targets, { cols: 180, rows: 28 });

  const anchors = [...output.matchAll(/\x1b\[(\d+);(\d+)H/g)].map((m) => [Number(m[1]) - 1, Number(m[2]) - 1]);
  // Second pane's frame must appear at its true x (>= 90), proving no downscale.
  assert.ok(anchors.some(([, c]) => c >= 90 && c < 180), "second pane at original coords");
  assert.ok(anchors.some(([, c]) => c < 90), "first pane at original coords");
  // Rightmost drawn column stays near the layout's real right edge (~179), not
  // compressed toward the middle.
  const maxCol = Math.max(...anchors.map(([, c]) => c));
  assert.ok(maxCol >= 170, `expected near-full width, max col was ${maxCol}`);
  for (const [row, col] of anchors) {
    assert.ok(row >= 0 && row < 28);
    assert.ok(col >= 0 && col < 180);
  }
  assert.ok(output.includes(ansiBg(...HINT_COLORS[0])));
  assert.ok(output.includes(ansiBg(...HINT_COLORS[1])));
});

test("renderOverlay clamps to the live grid without rescaling geometry", () => {
  // A full layout rendered into a grid that is a couple cells narrower (the
  // 100% popup's border inset): geometry must stay true, only the far edge clips.
  const targets = [
    { shortcut: "1", paneId: "a", rect: { x: 0, y: 0, width: 80, height: 40 } },
    { shortcut: "2", paneId: "b", rect: { x: 80, y: 0, width: 100, height: 40 } },
  ];
  const cols = 178, rows = 40; // area was 180x40
  const output = renderOverlay(targets, { cols, rows });

  const anchors = [...output.matchAll(/\x1b\[(\d+);(\d+)H/g)].map((m) => [Number(m[1]) - 1, Number(m[2]) - 1]);
  for (const [row, col] of anchors) {
    assert.ok(row >= 0 && row < rows, `row ${row} out of grid`);
    assert.ok(col >= 0 && col < cols, `col ${col} out of grid`);
  }
  // Left pane still at x=0, second still starts near x=80 (not scaled down).
  assert.ok(anchors.some(([, c]) => c < 10));
  assert.ok(anchors.some(([, c]) => c >= 78 && c <= 82), "second pane not rescaled");
});
