// Local storage: settings, per-reply probability cache (keyed by tweet id, 7 days), daily auto-scan counter.

const SETTINGS_KEY = "settings";
const API_KEY_KEY = "apiKey";
const CLOUDFLARE_KEY_KEY = "cloudflareApiKey";
const SCORE_CACHE_KEY = "scoreCache";
const AUTO_USAGE_KEY = "autoUsage";
const SCORE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_SETTINGS = Object.freeze({
  ...JevApi.DEFAULT_API_SETTINGS,
  provider: "cloudflare",
  cloudflareAccountId: "",
  clefModel: "@cf/cloudflare/clef",
  concurrency: 4,
  maxReplies: 30,
  // "auto" = scan feed posts and status-page replies on arrival; "manual" = click only.
  triggerMode: "auto",
  dailyAutoLimit: 100
});

async function loadSettings() {
  const { [SETTINGS_KEY]: saved = {}, [API_KEY_KEY]: apiKey = "", [CLOUDFLARE_KEY_KEY]: cloudflareApiKey = "" } =
    await chrome.storage.local.get([SETTINGS_KEY, API_KEY_KEY, CLOUDFLARE_KEY_KEY]);
  const merged = { ...DEFAULT_SETTINGS, ...saved, apiKey, cloudflareApiKey };
  // Keep existing installations on Jev until the user selects Cloudflare.
  if (!saved.provider && (Object.keys(saved).length || apiKey)) merged.provider = "jev";
  if (!["jev", "cloudflare"].includes(merged.provider)) merged.provider = "jev";
  // Upgrade only known shipped defaults. User-authored prompts must survive updates.
  if (saved.instructions && [
    JevApi.LEGACY_AI_INSTRUCTIONS, JevApi.PREVIOUS_AI_INSTRUCTIONS,
    JevApi.PREVIOUS_SLOP_INSTRUCTIONS, JevApi.PREVIOUS_PRINCIPLE_INSTRUCTIONS
  ].includes(saved.instructions)) {
    merged.instructions = DEFAULT_SETTINGS.instructions;
  }
  // Migrate the old "auto-scan own posts only" toggle into triggerMode.
  if (saved.triggerMode == null && typeof saved.autoScanOwn === "boolean") {
    merged.triggerMode = saved.autoScanOwn ? "auto" : "manual";
  }
  if (merged.triggerMode !== "auto" && merged.triggerMode !== "manual") {
    merged.triggerMode = DEFAULT_SETTINGS.triggerMode;
  }
  return merged;
}

function todayKey(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Non-expired cache: tweet id -> { probability, savedAt }.
function judgmentFingerprint(settings) {
  const fields = settings.provider === "cloudflare"
    ? ["provider", "cloudflareAccountId", "clefModel", "questionKey", "instructions"]
    : ["provider", "baseUrl", "path", "authHeader", "authScheme", "model", "questionKey", "responsePath", "instructions"];
  return JSON.stringify(fields.map((key) => settings[key]));
}

async function loadScoreCache(fingerprint) {
  const { [SCORE_CACHE_KEY]: cache = {} } = await chrome.storage.local.get(SCORE_CACHE_KEY);
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(cache).filter(([, entry]) => now - entry.savedAt < SCORE_CACHE_TTL &&
      (fingerprint === undefined || entry.fingerprint === fingerprint))
  );
}

async function saveScores(results, fingerprint) {
  if (!results.length) return;
  const cache = await loadScoreCache();
  const savedAt = Date.now();
  for (const { id, probability } of results) cache[id] = { probability, savedAt, fingerprint };
  await chrome.storage.local.set({ [SCORE_CACHE_KEY]: cache });
}

async function clearScoreCache() {
  await chrome.storage.local.remove(SCORE_CACHE_KEY);
}

async function todayAutoCount() {
  const { [AUTO_USAGE_KEY]: usage } = await chrome.storage.local.get(AUTO_USAGE_KEY);
  return usage?.date === todayKey() ? usage.count : 0;
}

async function addAutoCount(amount) {
  const count = await todayAutoCount();
  await chrome.storage.local.set({ [AUTO_USAGE_KEY]: { date: todayKey(), count: count + amount } });
}
