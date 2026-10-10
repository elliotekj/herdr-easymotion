#!/usr/bin/env node
"use strict";

const { buildTargets, createStatus, parsePluginContext, resolvePaneIdFromContext } = require("./core");
const { paneLayout, runHerdr } = require("./herdr");

async function main() {
  const env = process.env;
  const pluginId = env.HERDR_PLUGIN_ID || "com.elliotekj.herdr-easymotion";
  const context = parsePluginContext(env.HERDR_PLUGIN_CONTEXT_JSON);
  const sourcePaneId = resolvePaneIdFromContext(context, env);
  const layout = paneLayout(sourcePaneId, env);
  const targets = buildTargets(layout, new Map(), sourcePaneId, { includeCurrent: true });
  const status = createStatus(layout, layout?.panes?.length > 1 ? targets : [], sourcePaneId);
  if (status) {
    return;
  }

  const args = [
    "plugin",
    "pane",
    "open",
    "--plugin",
    pluginId,
    "--entrypoint",
    "picker",
    "--placement",
    "overlay",
    "--focus",
    "--env",
    `HERDR_JUMP_LAYOUT_JSON=${JSON.stringify(layout)}`,
  ];

  if (sourcePaneId) {
    args.push("--env", `HERDR_JUMP_SOURCE_PANE_ID=${sourcePaneId}`);
  }

  runHerdr(args, { env });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
