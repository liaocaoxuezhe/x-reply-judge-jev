# Slop Prompt 无缓存复测 · 2026-10-20

用户反馈改完 Prompt 后截图仍为低分。通过 Tabbit 原生界面打开当前扩展设置页，表单已载入 slop-aware 新默认；明确点击 Save 后显示 Saved，再点击 Clear cache 后显示 Cache cleared。表单显示新默认本身不足以证明截图生成时的已保存配置，因此不能断言先前截图仅由旧缓存造成。

通过扩展内测试页直接请求官方 TypeSafe API，绕开缓存，对 5 条公开回复分别用 previous（contrast）与 slop 两版问题评分。实际模型均为 jev-1.13.0，无 API 错误。密钥未导出。原始结果在 slop-check-results.json。

| 回复 | previous 新请求 | slop 新请求 |
| --- | ---: | ---: |
| 飞书加载问题（额外参照） | 16% | 15% |
| 周小码：认同、复述发布流程 | 25% | 32% |
| leehoo：复述唯一正文源 | 24% | 24% |
| Pluto：博客中转站＋接口提问 | 19% | 20% |
| 俯仰：唯一源头＋泛泛建议 | 27% | 23% |

结论：新版 Prompt 在这些评论上仍给出低分，不能把问题仅归因于缓存或未生效；本轮没有证据说明新增 slop 特征解决了实际漏判。没有人为抬高分数或降低判定阈值。这些回复未独立验证作者来源，不能据此计算准确率。

当前 data.js 临时固定为这 5 条回复及 previous/slop 两版，应用 contrast 的按钮自动禁用。此前 final-results.json 和 final-fixtures.json 不变。要复现此前最终留出集，请将 EVAL_FIXTURES 换成 final-fixtures.json，EVAL_PROMPTS 使用 round2-prompts.json 的 baseline/contrast，并保留原始报告不覆盖。

此次只改动本地测试产物，保存当前浏览器 Prompt 并清理旧评分缓存；未推送、未合并。
