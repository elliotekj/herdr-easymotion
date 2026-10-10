"use strict";

const path = require("node:path");

const SHORTCUTS = "123456789abcdefghijklmnoprstuvwxyz".split("");

function parsePluginContext(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolvePaneIdFromContext(context, env = process.env) {
  const candidates = [
    env.HERDR_JUMP_SOURCE_PANE_ID,
    context?.focused_pane?.pane_id,
    context?.focused_pane_id,
    context?.pane?.pane_id,
    context?.pane_id,
    context?.target_pane_id,
    env.HERDR_PANE_ID,
  ];

  return candidates.find((candidate) => typeof candidate === "string" && candidate.length > 0) ?? null;
}

function paneSortKey(pane) {
  const rect = pane.rect ?? {};
  return {
    y: Number.isFinite(rect.y) ? rect.y : 0,
    x: Number.isFinite(rect.x) ? rect.x : 0,
    paneId: pane.pane_id ?? "",
  };
}

function sortLayoutPanes(panes) {
  return [...panes].sort((left, right) => {
    const a = paneSortKey(left);
    const b = paneSortKey(right);

    return a.y - b.y || a.x - b.x || a.paneId.localeCompare(b.paneId);
  });
}

function basename(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  return path.basename(value) || value;
}

function formatPaneLabel(layoutPane, paneInfo) {
  const title =
    paneInfo?.label ||
    paneInfo?.terminal_title_stripped ||
    paneInfo?.terminal_title ||
    paneInfo?.display_title ||
    null;

  if (title) {
    return String(title);
  }

  if (paneInfo?.agent) {
    const status = paneInfo.agent_status && paneInfo.agent_status !== "unknown" ? ` ${paneInfo.agent_status}` : "";
    return `${paneInfo.agent}${status}`;
  }

  const cwdName = basename(paneInfo?.foreground_cwd) || basename(paneInfo?.cwd);
  if (cwdName) {
    return cwdName;
  }

  return layoutPane?.pane_id ?? "pane";
}

function truncateMiddle(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }

  const keep = maxLength - 1;
  const left = Math.ceil(keep / 2);
  const right = Math.floor(keep / 2);
  return `${text.slice(0, left)}.${text.slice(text.length - right)}`;
}

function buildTargets(layout, paneInfoById = new Map(), sourcePaneId = null, options = {}) {
  const currentPaneId = sourcePaneId || layout?.focused_pane_id || null;
  const includeCurrent = Boolean(options.includeCurrent);
  const visiblePanes = Array.isArray(layout?.panes) ? sortLayoutPanes(layout.panes) : [];

  return visiblePanes
    .filter((pane) => pane.pane_id && (includeCurrent || pane.pane_id !== currentPaneId))
    .slice(0, SHORTCUTS.length)
    .map((pane, index) => {
      const rect = pane.rect ?? {};
      const info = paneInfoById.get(pane.pane_id);

      return {
        shortcut: SHORTCUTS[index],
        paneId: pane.pane_id,
        label: formatPaneLabel(pane, info),
        focused: Boolean(pane.focused),
        rect: {
          x: Number.isFinite(rect.x) ? rect.x : 0,
          y: Number.isFinite(rect.y) ? rect.y : 0,
          width: Number.isFinite(rect.width) ? rect.width : 0,
          height: Number.isFinite(rect.height) ? rect.height : 0,
        },
      };
    });
}

function createStatus(layout, targets, sourcePaneId) {
  if (layout?.zoomed) {
    return {
      title: "Jump",
      message: "Only the zoomed pane is visible.",
      detail: "Unzoom the tab to jump to hidden panes.",
    };
  }

  if (!sourcePaneId && !layout?.focused_pane_id) {
    return {
      title: "Jump",
      message: "No source pane was available.",
      detail: "Invoke the action from a tiled pane.",
    };
  }

  if (targets.length === 0) {
    return {
      title: "Jump",
      message: "No other visible panes.",
      detail: "Split this tab to create another jump target.",
    };
  }

  return null;
}

module.exports = {
  SHORTCUTS,
  buildTargets,
  createStatus,
  formatPaneLabel,
  parsePluginContext,
  resolvePaneIdFromContext,
  sortLayoutPanes,
  truncateMiddle,
};
