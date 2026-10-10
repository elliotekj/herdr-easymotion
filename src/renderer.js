"use strict";

const GLYPHS = {
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  a: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  b: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  c: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  d: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  e: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  f: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  g: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
  h: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  i: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  j: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  k: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  l: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  m: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  n: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  o: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  p: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  r: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  s: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  t: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  u: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  v: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  w: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  x: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

const HINT_COLORS = [
  [255, 80, 80],
  [80, 160, 255],
  [255, 180, 50],
  [80, 220, 255],
  [255, 50, 50],
  [100, 180, 255],
  [255, 220, 70],
  [30, 200, 240],
  [240, 100, 240],
  [50, 220, 130],
  [220, 80, 220],
  [80, 240, 130],
];

// Upper bound on glyph scale so a shortcut stays a small centered label
// regardless of how large the pane or terminal is. Without this cap the glyph
// scale grows to fill the whole pane, producing enormous overlapping glyphs.
const MAX_SCALE = 3;

// A glyph at scale 1 is 5x7 cells; a pane must clear at least this much room
// before a framed hint is meaningful.
const MIN_PANE_COLS = 6;
const MIN_PANE_ROWS = 8;

// Box-drawing used to sketch each pane region on the (opaque) overlay so the
// number → pane mapping stays legible without see-through.
const FRAME_FG = "\x1b[38;5;242m";
const BOX = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" };

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function colorForIndex(index) {
  return HINT_COLORS[index % HINT_COLORS.length];
}

function ansiBg(r, g, b) {
  return `\x1b[48;2;${r};${g};${b}m`;
}

function ansiReset() {
  return "\x1b[0m";
}

function cursorTo(row, col) {
  return `\x1b[${row + 1};${col + 1}H`;
}

function terminalBounds(options = {}) {
  const stdout = options.stdout || (typeof process !== "undefined" ? process.stdout : undefined);
  const cols = options.cols ?? stdout?.columns;
  const rows = options.rows ?? stdout?.rows;
  return {
    cols: positiveInteger(cols) ? cols : Infinity,
    rows: positiveInteger(rows) ? rows : Infinity,
  };
}

function computeScale(rect, bounds, glyphCols, glyphRows) {
  const fitCols = Math.floor((rect.width - 2) / glyphCols);
  const fitRows = Math.floor((rect.height - 2) / glyphRows);
  const fitByPane = Math.min(fitCols, fitRows);
  const fitByTerminal = Math.min(
    Math.floor(bounds.cols / glyphCols),
    Math.floor(bounds.rows / glyphRows),
  );
  return Math.max(1, Math.min(MAX_SCALE, fitByPane, fitByTerminal));
}

// Draw the rectangle outline of a pane region in a dim color so the overlay
// reads as a blueprint of the real layout.
function renderPaneFrame(rect, bounds) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(bounds.cols - 1, rect.x + rect.width - 1);
  const y1 = Math.min(bounds.rows - 1, rect.y + rect.height - 1);
  if (x1 < x0 || y1 < y0) {
    return "";
  }

  let out = "";

  const putCell = (row, col, glyph) => cursorTo(row, col) + FRAME_FG + glyph + ansiReset();
  const runCells = (row, colStart, colEnd, glyph) =>
    cursorTo(row, colStart) + FRAME_FG + glyph.repeat(Math.max(0, colEnd - colStart + 1)) + ansiReset();

  if (y0 === y1) {
    out += runCells(y0, x0, x1, BOX.h);
    return out;
  }
  if (x0 === x1) {
    for (let row = y0; row <= y1; row++) {
      out += putCell(row, x0, BOX.v);
    }
    return out;
  }

  out += cursorTo(y0, x0) + FRAME_FG + BOX.tl + BOX.h.repeat(x1 - x0 - 1) + BOX.tr + ansiReset();
  for (let row = y0 + 1; row < y1; row++) {
    out += putCell(row, x0, BOX.v) + putCell(row, x1, BOX.v);
  }
  out += cursorTo(y1, x0) + FRAME_FG + BOX.bl + BOX.h.repeat(x1 - x0 - 1) + BOX.br + ansiReset();
  return out;
}

function renderPaneHint(target, index, options = {}) {
  const { rect, shortcut } = target;
  if (!positiveInteger(rect?.width) || !positiveInteger(rect?.height)) {
    return "";
  }
  if (rect.width < MIN_PANE_COLS || rect.height < MIN_PANE_ROWS) {
    return "";
  }

  const bounds = terminalBounds(options);
  const glyph = GLYPHS[shortcut] || GLYPHS["1"];
  const glyphRows = glyph.length;
  const glyphCols = glyph[0].length;

  const scale = computeScale(rect, bounds, glyphCols, glyphRows);
  const renderW = glyphCols * scale;
  const renderH = glyphRows * scale;

  const offsetX = rect.x + Math.floor((rect.width - renderW) / 2);
  const offsetY = rect.y + Math.floor((rect.height - renderH) / 2);

  let output = "";

  for (let row = 0; row < renderH; row++) {
    const termRow = offsetY + row;
    if (termRow < 0 || termRow >= bounds.rows) {
      continue;
    }

    const glyphRow = Math.floor(row / scale);
    const line = glyph[glyphRow] || "00000";
    let lineOut = "";

    for (let col = 0; col < renderW; col++) {
      const termCol = offsetX + col;
      if (termCol < 0 || termCol >= bounds.cols) {
        continue;
      }
      const glyphCol = Math.floor(col / scale);
      if (line[glyphCol] === "1") {
        lineOut += ansiBg(...colorForIndex(index)) + " " + ansiReset();
      } else {
        lineOut += " ";
      }
    }

    if (!lineOut) {
      continue;
    }

    const firstVisibleCol = Math.max(0, offsetX);
    output += cursorTo(termRow, firstVisibleCol) + lineOut;
  }

  return output;
}

// Fit the source layout coordinates into the overlay's actual grid WITHOUT
// distorting anything: pick a single uniform scale (same for x and y) and center
// the map. When the grid matches the layout (the normal full-zoom case) the
// scale is 1.0 and every pane keeps its exact original size; if the grid is
// smaller, all panes shrink by the same factor so their proportions are preserved
// rather than stretched.
function fitScale(area, bounds) {
  if (!area || !positiveInteger(area.width) || !positiveInteger(area.height)) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  if (!Number.isFinite(bounds.cols) || !Number.isFinite(bounds.rows)) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(bounds.cols / area.width, bounds.rows / area.height);
  const offsetX = Math.floor((bounds.cols - area.width * scale) / 2);
  const offsetY = Math.floor((bounds.rows - area.height * scale) / 2);
  return { scale, offsetX, offsetY };
}

function mapRect(rect, fit) {
  if (fit.scale === 1 && fit.offsetX === 0 && fit.offsetY === 0) {
    return rect;
  }
  return {
    x: fit.offsetX + Math.round(rect.x * fit.scale),
    y: fit.offsetY + Math.round(rect.y * fit.scale),
    width: Math.max(1, Math.round(rect.width * fit.scale)),
    height: Math.max(1, Math.round(rect.height * fit.scale)),
  };
}

// Full overlay: frame every pane region, then draw each pane's bounded number
// badge inside it. Used when herdr can only give the plugin an opaque surface.
function renderOverlay(targets, options = {}) {
  const bounds = terminalBounds(options);
  const fit = fitScale(options.area, bounds);
  const fitted = targets.map((target) => ({ ...target, rect: mapRect(target.rect, fit) }));

  let output = "";
  for (let i = 0; i < fitted.length; i++) {
    output += renderPaneFrame(fitted[i].rect, bounds);
  }
  for (let i = 0; i < fitted.length; i++) {
    output += renderPaneHint(fitted[i], i, {
      ...options,
      stdout: undefined,
      cols: bounds.cols,
      rows: bounds.rows,
    });
  }
  return output;
}

// Badge-only rendering (no frame), kept for tests and the non-framed path.
function renderHints(targets, options = {}) {
  let output = "";
  for (let i = 0; i < targets.length; i++) {
    output += renderPaneHint(targets[i], i, options);
  }
  return output;
}

module.exports = {
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
  fitScale,
  mapRect,
  terminalBounds,
};
