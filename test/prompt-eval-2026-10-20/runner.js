/* Manual live evaluation harness. Credentials never enter the report. */
const el = (id) => document.getElementById(id);
let report;
for (const option of el("split").options) {
  const count = EVAL_FIXTURES.filter((item) => item.split === option.value).length;
  option.textContent = `${option.value}（${count} 条）`;
  option.disabled = count === 0;
}
el("split").value = Array.from(el("split").options).find((option) => !option.disabled)?.value || "";
loadSettings().then((cfg) => {
  el("config").textContent = `模型：${cfg.model}；API：${cfg.baseUrl}；密钥：${cfg.apiKey ? "已配置" : "缺失"}`;
  el("activePrompt").textContent = `当前 Prompt：${cfg.instructions}`;
});
el("apply").disabled = !EVAL_PROMPTS.contrast;
el("apply").addEventListener("click", async () => {
  try {
    const { apiKey, ...settings } = await loadSettings();
    await chrome.storage.local.set({ settings: { ...settings, instructions: EVAL_PROMPTS.contrast } });
    await clearScoreCache();
    el("activePrompt").textContent = `当前 Prompt：${EVAL_PROMPTS.contrast}`;
    el("status").textContent = "已保存 contrast Prompt，并清除旧评分缓存。请刷新 X 后重新扫描。密钥、模型及其他设置保持原值。";
  } catch (error) { el("status").textContent = `应用失败：${error.message}`; }
});
function metrics(rows, name) {
  const scored = rows.filter((r) => r.label === "human" || r.label === "ai");
  const human = scored.filter((r) => r.label === "human");
  const ai = scored.filter((r) => r.label === "ai");
  const fp = human.filter((r) => r.scores[name] >= 50).length;
  const fn = ai.filter((r) => r.scores[name] < 50).length;
  const brier = scored.reduce((s, r) => s + (r.scores[name] / 100 - (r.label === "ai" ? 1 : 0)) ** 2, 0) / scored.length;
  return { n: scored.length, correct: scored.length - fp - fn, falsePositive: fp, falseNegative: fn, humanCount: human.length, aiCount: ai.length, highConfidenceFalsePositive: human.filter((r) => r.scores[name] >= 70).length, brier: +brier.toFixed(4) };
}
el("run").addEventListener("click", async () => {
  el("run").disabled = true;
  el("download").disabled = true;
  const cfg = await loadSettings();
  const split = el("split").value;
  report = { date: new Date().toISOString(), round: typeof EVAL_ROUND === "undefined" ? "r1" : EVAL_ROUND, split, requestedModel: cfg.model, prompts: EVAL_PROMPTS, rows: [], errors: [] };
  try {
    if (!cfg.apiKey) throw new Error("请先在设置页配置 API key。");
    if (cfg.baseUrl !== "https://api.typesafe.ai" || cfg.path !== "/v1/systemone") throw new Error("仅允许现有的官方 TypeSafe endpoint。");
    const fixtures = EVAL_FIXTURES.filter((r) => r.split === split);
    if (!fixtures.length) throw new Error("没有该测试集。");
    // A single request evaluates all candidates against exactly the same text.
    for (const item of fixtures) {
      el("status").textContent = `运行 ${report.rows.length + 1}/${fixtures.length}：${item.id}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      let json;
      try {
        const response = await fetch(JevApi.buildUrl(cfg), {
          method: "POST", headers: JevApi.buildHeaders(cfg.apiKey, cfg), signal: controller.signal,
          body: JSON.stringify({ model: cfg.model, state: item.text, questions: Object.fromEntries(Object.entries(EVAL_PROMPTS).map(([key, instructions]) => [key, { type: "noul", instructions }])) })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}（停止，不自动重试）`);
        json = await response.json();
      } finally { clearTimeout(timer); }
      const scores = Object.fromEntries(Object.keys(EVAL_PROMPTS).map((key) => [key, JevApi.parseProbability(json, { responsePath: `answers.${key}.noul`, questionKey: key })]));
      report.rows.push({ ...item, scores, actualModel: json.model, usage: json.usage });
      report.metrics = Object.fromEntries(Object.keys(EVAL_PROMPTS).map((key) => [key, metrics(report.rows, key)]));
      el("summary").textContent = JSON.stringify(report.metrics, null, 2);
      el("output").value = JSON.stringify(report, null, 2);
    }
    el("status").textContent = `完成 ${report.rows.length}/${fixtures.length}；实际模型 ${report.rows[0]?.actualModel}`;
  } catch (error) {
    report.errors.push(error.message);
    el("status").textContent = `停止：${error.message}；已完成 ${report.rows.length}`;
  } finally {
    el("output").value = JSON.stringify(report, null, 2);
    el("download").disabled = false;
    el("run").disabled = false;
  }
});
el("download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `jev-prompt-${report.split}-20261020-${report.round}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
