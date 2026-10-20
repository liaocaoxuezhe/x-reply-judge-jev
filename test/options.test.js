const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function optionsPage() {
  const html = fs.readFileSync(path.join(__dirname, "../options.html"), "utf8");
  const fields = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], {
    value: "", checked: false, textContent: "", className: "", handlers: {},
    addEventListener(event, handler) { this.handlers[event] = handler; }
  }]));
  let stored = { settings: { instructions: "我的自定义判断规则", baseUrl: "https://api.typesafe.ai" }, apiKey: "existing-key", scoreCache: { tweet: { probability: 20, savedAt: Date.now() } } };
  const context = vm.createContext({
    URL,
    document: { getElementById: (id) => fields[id] },
    chrome: { storage: { local: {
      get: async () => ({ ...stored }),
      set: async (values) => { stored = { ...stored, ...values }; },
      remove: async (key) => { delete stored[key]; }
    } } }
  });
  for (const file of ["api.js", "store.js", "options.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  await vm.runInContext("render()", context);
  return { fields, context, stored: () => stored };
}

test("saving an edited Chinese prompt persists it and invalidates old scores", async () => {
  const page = await optionsPage();
  page.fields.instructions.value = "新的中文规则\n保留段落与具体例子。";
  await page.fields.save.handlers.click();
  assert.equal(page.stored().settings.instructions, "新的中文规则\n保留段落与具体例子。");
  assert.equal(page.stored().apiKey, "existing-key");
  assert.equal(page.stored().scoreCache, undefined);
  assert.match(page.fields.status.textContent, /reload x/i);
});

test("saving other settings keeps scores when the prompt is unchanged", async () => {
  const page = await optionsPage();
  page.fields.concurrency.value = "2";
  await page.fields.save.handlers.click();
  assert.equal(page.stored().settings.concurrency, 2);
  assert.equal(page.stored().scoreCache.tweet.probability, 20);
});

test("endpoint reset preserves a customized detection prompt", async () => {
  const page = await optionsPage();
  await page.fields.reset.handlers.click();
  assert.equal(page.fields.instructions.value, "我的自定义判断规则");
});

test("prompt reset leaves endpoint edits intact until Save", async () => {
  const page = await optionsPage();
  page.fields.baseUrl.value = "https://example.com";
  assert.ok(page.fields.resetPrompt, "A separate prompt reset control is available");
  await page.fields.resetPrompt.handlers.click();
  assert.equal(page.fields.instructions.value, page.context.JevApi.DEFAULT_API_SETTINGS.instructions);
  assert.equal(page.fields.baseUrl.value, "https://example.com");
  assert.equal(page.stored().settings.instructions, "我的自定义判断规则");
});
