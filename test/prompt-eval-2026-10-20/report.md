# Jev Prompt 实测报告 · 2026-10-20

通过 Tabbit 的扩展内测试页，使用用户已有 TypeSafe 配置运行。密钥未输出、未导出、未写入仓库。实际响应模型全部为 `jev-1.13.0`；没有切换模型或改动颜色阈值。

## 结论

采用 `contrast` 英文对比版。它要求同时考虑人类和 AI 对整段措辞的解释，避免把口语、个人经历当作真人证明，也避免把正式文案和列表直接当作 AI。新 Prompt 只能证明在这次小样本中有小幅改善，不能宣称真实 X 时间线准确率达到相同比例。

## 最终独立验证（48 条）

24 条标注为 human、24 条标注为 AI；均未参与前面调优。以 50% 为评估分界，保持原界面 31/70 的颜色分界不变。

| 指标 | 原 Prompt | contrast |
| --- | ---: | ---: |
| 判断正确 | 33/48（68.8%） | 35/48（72.9%） |
| 真人误报为 AI | 6/24 | 4/24 |
| AI 漏报为真人 | 9/24 | 9/24 |
| 真人被打到 ≥70% | 1/24 | 0/24 |
| AI 被打到 ≥70% | 12/24 | 12/24 |
| Brier 分数（越小越好） | 0.2204 | 0.1945 |

全部变化仅为 2 条真人文本从约 68% 降到 45–46%；改善有限，样本不足以证明统计显著。口语化 AI 的漏报仍是主要限制。

## 实验过程

共 **174 次真实 API 请求，522 个候选评分，6 版不同 Prompt**。多版 Prompt 作为不同 Noul 问题放在同一请求中，待测 `state` 仅含原文，不含标签、来源或 ID。没有手工改分、缩放概率、挑选最好的一次重跑，也没有重试失败请求。输入 token 总计 141,545；按官方当日文档 $0.042/M 输入 token 估算约 $0.0059，不代表账户最终账单。

1. `dev-results.json`：12 对中文 HC3 问答，比较 baseline / cautious / balanced。
2. `holdout-results.json`：另 12 对中文 HC3 问答。谨慎版看似更好，但这不是最终结论。
3. `stress-results.json`：12 条额外短真人文本、12 条本助手现场生成的现代 AI 回复、6 条来源未知的真实 X 回复。谨慎版把 12 条短 AI 全部漏掉，故否决。
4. `round2-results.json`：将首轮开发集与补充集中有标签的样本合成 48 条调优集，比较 baseline / zh_brief / zh_criteria / contrast。直接改中文没有稳定提升；contrast 为 31/48，原版 29/48。
5. `final-results.json`：在选定 contrast 前已锁定的 48 条全新样本，仅对比原版与 contrast，结果见上表。

原版在多轮重叠样本上偶有不同分数，未将单次分数视为确定事实。第一次的 24 条留出集在被观察后不再作为最终独立验证；最终验证使用完全不同的样本。

## 样本来源和限制

- [HC3 官方项目](https://github.com/Hello-SimpleAI/chatgpt-comparison-detection)：[中文数据集 ModelScope 镜像](https://www.modelscope.cn/datasets/simpleai/HC3-Chinese)。以数据集原始 human/ChatGPT 标注为准，没有独立核实作者；这是 2023 年问答数据，不是现代 X 分布，亦可能已进入模型训练。
- HC3 样本原文未截断、未改写；固定随机种子，按长度范围与配对长度比筛选，排除显式 AI 自我介绍。详情见 `provenance.json`、`prepare.py`。源语料按上游说明的许可使用，此处保留出处。
- 现代 AI 短回复由本助手生成，包含口语化虚构经历与工整论述各半；不代表所有生成模型。它们与人类短文本的题材并不完全匹配。
- 6 条真实 X 回复摘自 https://x.com/vista8/status/2112436033690480918 。作者来源未知，仅观察分数，完全排除准确率指标。
- 这是小样本探索，不是盲测基准或可推广的真实准确率。仅凭短文本无法可靠确定作者是否使用 AI。

## 生效和回归

默认 Prompt 在 `api.js`；`store.js` 只迁移与旧默认完全一致的已保存提示词，保留自定义提示词、密钥、模型和 endpoint。本次通过测试页的明确“应用”按钮，将 contrast 保存到当前浏览器配置并清理旧评分缓存；该操作不写入密钥，也不改动模型及其他字段。旧设置页刷新后曾出现空白，故先使用这一扩展内操作完成保存；从测试页新开正式设置页后可正常显示，已核对完整新 Prompt，并通过正式“Test connection”（318 ms，实际模型 jev-1.13.0，示例文本 50%）。之后刷新 X。旧分数不能与新 Prompt 混用。

`test/prompt-settings.test.js` 验证旧默认迁移、自定义提示词保留和真实 API 请求使用加载后的 Prompt。`npm test`、`npm run check` 包含这些测试及手动对比页面脚本。

## 复现

历史最终验证对应 `final-fixtures.json` 和 baseline / contrast 两版。后续 slop 调整后，当前 `data.js` 已切换为 5 条公开回复的 previous / slop 无缓存复测；结果见 `slop-check.md`。扩展设置中已保存有效密钥后，打开 `chrome-extension://<当前扩展 ID>/test/prompt-eval-2026-10-20/index.html`，运行并下载 JSON。每次运行会调用真实 API；报告含原文、标签、全部分数、实际模型和 token 用量，不含密钥。

`prepare.py`、`add-stress.py`、`round2.py`、`prepare-final.py` 保留了此前各阶段的固定选样方法。`prepare.py` 需先从 `provenance.json` 中的 URL 将公开语料下载为同目录 `hc3-open-qa.jsonl`（已 gitignore）。复现顺序是 prepare → add-stress → prepare-final → round2；各阶段 JSON 报告已保存，不能把重跑后的分数冒充本报告原始结果。

## 后续原则式试验

用户随后要求以简短原则替代长篇特征清单。当前默认及 data.js 已切换为原则式试用，结果见 [principle-notes.md](principle-notes.md)；对照没有证明准确率提高。前述 35/48 仅为历史 contrast 版本结果。
