const API_FIELDS = ["baseUrl", "path", "authHeader", "authScheme", "model", "questionKey", "responsePath"];
const TEXT_FIELDS = [...API_FIELDS, "instructions", "provider", "cloudflareAccountId", "clefModel"];
const NUMBER_FIELDS = ["concurrency", "maxReplies", "dailyAutoLimit"];
const DEFAULT_ORIGIN = "https://api.typesafe.ai/*";
const $ = (id) => document.getElementById(id);

function setStatus(text, kind = "") {
  $("status").textContent = text;
  $("status").className = kind;
}

async function render() {
  const settings = await loadSettings();
  $("apiKey").value = settings.apiKey;
  $("cloudflareApiKey").value = settings.cloudflareApiKey;
  for (const field of [...TEXT_FIELDS, ...NUMBER_FIELDS]) $(field).value = settings[field];
  const mode = settings.triggerMode === "manual" ? "manual" : "auto";
  $("triggerModeAuto").checked = mode === "auto";
  $("triggerModeManual").checked = mode === "manual";
  $("autoUsage").textContent = `Auto-scan used today: ${await todayAutoCount()}`;
  renderProvider();
}

function renderProvider() {
  const cloudflare = $("provider").value === "cloudflare";
  $("cloudflareSettings").hidden = !cloudflare;
  $("jevSettings").hidden = cloudflare;
  $("jevEndpoint").hidden = cloudflare;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function readForm() {
  const settings = {};
  for (const field of TEXT_FIELDS) settings[field] = $(field).value.trim();
  for (const field of TEXT_FIELDS) {
    if (!settings[field] && field !== "authScheme") settings[field] = DEFAULT_SETTINGS[field];
  }
  settings.concurrency = clampInt($("concurrency").value, 1, 16, DEFAULT_SETTINGS.concurrency);
  settings.maxReplies = clampInt($("maxReplies").value, 1, 200, DEFAULT_SETTINGS.maxReplies);
  settings.dailyAutoLimit = clampInt($("dailyAutoLimit").value, 0, 10000, DEFAULT_SETTINGS.dailyAutoLimit);
  settings.triggerMode = $("triggerModeManual").checked ? "manual" : "auto";
  return settings;
}

async function save() {
  const settings = readForm();
  if (!JevApi.originPattern(JevApi.effectiveBaseUrl(settings))) {
    setStatus("Base URL must be a valid http(s) URL.", "err");
    return false;
  }
  try { JevApi.buildUrl(settings); } catch (error) {
    setStatus(error.message, "err");
    return false;
  }
  const previous = await loadSettings();
  const judgmentChanged = TEXT_FIELDS.some((field) => settings[field] !== previous[field]);
  await chrome.storage.local.set({ settings, apiKey: $("apiKey").value.trim(), cloudflareApiKey: $("cloudflareApiKey").value.trim() });
  if (judgmentChanged) await clearScoreCache();
  await render();
  setStatus(judgmentChanged ? "Saved. Model / prompt settings updated and old scores cleared. Reload X to scan again." : "Saved.", "ok");
  return true;
}

// Must run from the click handler (user gesture) for chrome.permissions.request.
async function ensureHostPermission() {
  const origin = JevApi.originPattern(JevApi.effectiveBaseUrl(readForm()));
  if (!origin || origin === DEFAULT_ORIGIN) return true;
  return chrome.permissions.request({ origins: [origin] });
}

$("provider").addEventListener("change", renderProvider);
$("save").addEventListener("click", async () => {
  const granted = await ensureHostPermission();
  if (!granted) return setStatus("Host permission was not granted.", "err");
  return save();
});

$("test").addEventListener("click", async () => {
  const granted = await ensureHostPermission();
  if (!granted) return setStatus("Host permission was not granted.", "err");
  if (!(await save())) return;
  setStatus("Testing…");
  const result = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION" });
  if (result?.ok) {
    setStatus(`OK in ${result.ms} ms. Sample reply scored AI ${result.probability}%${result.model ? ` (model ${result.model})` : ""}.`, "ok");
  } else {
    setStatus(`Failed: ${result?.error || "unknown error"}`, "err");
  }
});

$("clearCache").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CACHE" });
  setStatus("Cache cleared.", "ok");
});

$("reset").addEventListener("click", () => {
  for (const field of API_FIELDS) $(field).value = DEFAULT_SETTINGS[field];
  setStatus("Endpoint defaults restored. Click Save to keep them.");
});

$("resetPrompt").addEventListener("click", () => {
  $("instructions").value = DEFAULT_SETTINGS.instructions;
  setStatus("Default prompt restored. Click Save to apply it.");
});

render();
