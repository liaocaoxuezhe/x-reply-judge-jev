const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function background(stored = {}) {
  const calls = [];
  const context = vm.createContext({
    URL, Date,
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      action: { onClicked: { addListener() {} } },
      storage: { local: {
        get: async () => ({ ...stored }),
        set: async (values) => Object.assign(stored, values)
      } }
    }
  });
  context.importScripts = (...files) => {
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), context);
  context.JevApi.detectText = async (text) => { calls.push(text); return { probability: 87 }; };
  return { analyze: (items, mode) => context.analyzeItems(items, mode), calls, stored };
}

for (const mode of ["lookup", "manual", "auto"]) {
  test(`${mode}: short text gets 20 without credentials or API calls, overriding old cached scores`, async () => {
    const worker = background({ scoreCache: { ten: { probability: 99, savedAt: Date.now() } } });
    const result = await worker.analyze([
      { id: "ten", text: "一二三四五六七八九十" },
      { id: "emoji", text: "😀".repeat(10) },
      { id: "spaces", text: " 谢 谢\n " }
    ], mode);
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(result.results, (r) => [r.id, r.probability]), [["ten", 20], ["emoji", 20], ["spaces", 20]]);
    assert.equal(worker.calls.length, 0);
    assert.equal(worker.stored.autoUsage, undefined);
  });
}

test("mixed auto batch: 11-character text uses the API; short text does not consume the one-item quota", async () => {
  const long = "一二三四五六七八九十一";
  const worker = background({ apiKey: "existing-key", settings: { dailyAutoLimit: 1 } });
  const result = await worker.analyze([{ id: "short", text: "谢谢分享" }, { id: "long", text: long }], "auto");
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.results, (r) => [r.id, r.probability]), [["short", 20], ["long", 87]]);
  assert.deepEqual(worker.calls, [long]);
  assert.deepEqual(Array.from(result.batchIds), ["long"]);
  assert.equal(worker.stored.autoUsage.count, 1);
});

test("short scores remain available when the auto quota is exhausted", async () => {
  const worker = background({ apiKey: "existing-key", settings: { dailyAutoLimit: 0 } });
  const result = await worker.analyze([{ id: "short", text: "不错" }, { id: "long", text: "一二三四五六七八九十一" }], "auto");
  assert.equal(result.limitReached, true);
  assert.equal(result.results[0]?.probability, 20);
  assert.equal(worker.calls.length, 0);
});
