importScripts("api.js", "store.js");

const BADGE_CLEAR_DELAY = 2500;
const DEFAULT_ORIGIN = "https://api.typesafe.ai/*";

function sendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(response);
    });
  });
}

async function showBadge(tabId, text, color) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), BADGE_CLEAR_DELAY);
}

// Returns a human-readable config problem, or null when ready.
async function configProblem(settings) {
  if (!activeApiKey(settings)) return "No API key set. Open the options page to add the selected provider's key.";
  try { JevApi.buildUrl(settings); } catch (error) { return error.message; }
  const origin = JevApi.originPattern(JevApi.effectiveBaseUrl(settings));
  if (!origin) return "API base URL is not a valid http(s) URL.";
  if (origin !== DEFAULT_ORIGIN && !(await chrome.permissions.contains({ origins: [origin] }))) {
    return "Custom API host is not authorized yet. Click \"Test connection\" in options.";
  }
  return null;
}

function activeApiKey(settings) {
  return settings.provider === "cloudflare" ? settings.cloudflareApiKey : settings.apiKey;
}

// mode:
// - lookup: cache only, never calls the API
// - auto: feed/status auto-scan when triggerMode is "auto", subject to the daily limit
// - manual: user clicked the scan button / toolbar icon, no daily limit
// items: [{ id, text }] - only `text` is ever sent to the API.
async function analyzeItems(items, mode) {
  const settings = await loadSettings();
  const fingerprint = judgmentFingerprint(settings);
  const cache = await loadScoreCache(fingerprint);
  const cached = [];
  const misses = [];
  for (const item of items) {
    // Local short-text rule wins over old cached scores and never enters the API batch.
    // Count Unicode code points, ignoring whitespace (including line breaks).
    if (Array.from(item.text.replace(/\s/gu, "")).length <= 10) {
      cached.push({ id: item.id, probability: 20 });
    } else if (cache[item.id]) cached.push({ id: item.id, probability: cache[item.id].probability });
    else misses.push(item);
  }
  if (mode === "lookup" || !misses.length) return { ok: true, results: cached, batchIds: [] };

  let batch = misses.slice(0, settings.maxReplies);

  if (mode === "auto") {
    if (settings.triggerMode !== "auto") {
      return { ok: true, results: cached, batchIds: [], autoDisabled: true };
    }
    const remaining = settings.dailyAutoLimit - (await todayAutoCount());
    if (remaining <= 0) return { ok: true, results: cached, batchIds: [], limitReached: true };
    batch = batch.slice(0, remaining);
  }

  const problem = await configProblem(settings);
  if (problem) return { ok: false, needsConfig: true, error: problem, results: cached, batchIds: [] };

  const batchIds = batch.map((item) => item.id);
  const outcomes = await JevApi.mapWithConcurrency(batch, settings.concurrency, (item) =>
    JevApi.detectText(item.text, activeApiKey(settings), settings)
  );

  const fresh = [];
  let firstError = null;
  outcomes.forEach((outcome, index) => {
    if (outcome.ok) fresh.push({ id: batch[index].id, probability: outcome.value.probability });
    else firstError = firstError || outcome.error;
  });
  if (mode === "auto") await addAutoCount(batch.length);
  if (judgmentFingerprint(await loadSettings()) !== fingerprint) {
    return { ok: true, results: [], batchIds, analyzed: 0, failed: 0, remaining: misses.length, settingsChanged: true };
  }
  await saveScores(fresh, fingerprint);

  const base = {
    results: [...cached, ...fresh],
    batchIds,
    analyzed: fresh.length,
    failed: batch.length - fresh.length,
    remaining: misses.length - batch.length
  };
  if (!fresh.length && firstError) {
    return { ok: false, error: firstError.message || "Analysis failed", needsConfig: firstError.status === 401, ...base };
  }
  return { ok: true, ...base, warning: firstError ? firstError.message : undefined };
}

// Options page "Test connection": one fake reply, nothing is cached.
async function testConnection() {
  const settings = await loadSettings();
  const problem = await configProblem(settings);
  if (problem) return { ok: false, error: problem };
  const startedAt = Date.now();
  try {
    const result = await JevApi.detectText("Great insight! Thanks for sharing this valuable perspective.", activeApiKey(settings), settings, { maxRetries: 0 });
    return { ok: true, ms: Date.now() - startedAt, probability: result.probability, model: result.model };
  } catch (error) {
    return { ok: false, error: error.message || "Connection failed" };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TEST_CONNECTION") {
    testConnection().then(sendResponse);
    return true;
  }
  if (message?.type === "CLEAR_CACHE") {
    clearScoreCache().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "ANALYZE_ITEMS") {
    const items = (message.items || [])
      .filter((item) => item && item.id && typeof item.text === "string" && item.text.trim())
      .map((item) => ({ id: String(item.id), text: item.text }));
    analyzeItems(items, message.mode || "manual")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || "Analysis failed" }));
    return true;
  }
  if (message?.type === "OPEN_OPTIONS") chrome.runtime.openOptionsPage();
});

// Toolbar icon click: scan replies on the current page.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https:\/\/(x\.com|twitter\.com)\//.test(tab.url || "")) {
    if (tab.id) await showBadge(tab.id, "!", "#e0245e");
    return;
  }
  try {
    let result;
    try {
      result = await sendMessage(tab.id, { type: "SCAN_REPLIES" });
    } catch (_error) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["page-detect.js", "reply-cleaner.js", "ai-detector.js"]
      });
      result = await sendMessage(tab.id, { type: "SCAN_REPLIES" });
    }
    await showBadge(tab.id, result?.ok ? "✓" : "!", result?.ok ? "#1d9bf0" : "#e0245e");
  } catch (_error) {
    await showBadge(tab.id, "!", "#e0245e");
  }
});
