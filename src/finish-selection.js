#!/usr/bin/env node
"use strict";

const { focusPane } = require("./herdr");

async function main() {
  const targetPaneId = process.argv[2] || "";

  await new Promise((resolve) => setTimeout(resolve, 50));

  if (targetPaneId) {
    await focusPane(targetPaneId, process.env);
  }
}

main().catch(() => {
  process.exit(1);
});
