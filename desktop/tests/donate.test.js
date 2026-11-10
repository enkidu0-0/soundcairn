const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), vm = require("vm"), path = require("path");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/donate.js"), "utf8"), sandbox);
const D = sandbox.window.DONATE;

test("payment ID looks like a UPI ID", () => {
  assert.match(D.upi, /^[\w.\-]{2,}@[a-z]{2,}$/);
});

test("amounts are whole rupees within the UPI limit", () => {
  for (const t of D.tiers) assert.ok(Number.isInteger(t.amount) && t.amount >= 1 && t.amount <= 100000, t.label);
});

test("config is frozen so nothing can change it at runtime", () => {
  assert.ok(Object.isFrozen(D) && Object.isFrozen(D.tiers) && D.tiers.every(Object.isFrozen));
  assert.throws(() => { "use strict"; D.upi = "x@y"; }, TypeError);
});

test("the page uses donate.js and holds no payment ID of its own", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8");
  assert.ok(html.includes('src="donate.js"'));
  assert.ok(!/@(upi|kotak|okicici|ybl|paytm|oksbi)\b/.test(html));
});
