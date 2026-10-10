"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { keyToShortcut } = require("../src/picker");

test("keyToShortcut handles select and cancel keys", () => {
  assert.equal(keyToShortcut("1"), "1");
  assert.equal(keyToShortcut("A"), "a");
  assert.equal(keyToShortcut("q"), null);
  assert.equal(keyToShortcut("\u001b"), null);
  assert.equal(keyToShortcut("\u0003"), null);
});
