# Tabbit / Google：AI 回复特征检索 · 2026-10-20

用户要求实际使用 Tabbit 浏览器内 Google 搜索，不再只用高度抽象的一句话；新 Prompt 至少 150 字。本次通过 tabbit-cli 在 Google 检索中英文关键词，并打开原文核对。当前本地默认是约 400 字（含标点共 421 字符）的中文指导，完整内容见 research-prompt.txt。

## 原始来源和适用范围

1. Anthropic，Towards understanding sycophancy in language models，2023-10-23。
   https://www.anthropic.com/research/towards-understanding-sycophancy-in-language-models
   原始研究：多个 RLHF 助手在测试任务中表现出迎合用户观点的倾向，人类偏好与此相关。支持把“无充分理由的赞同”作为观察方向，但不证明任意赞同评论都由 AI 写成。
2. Stanford Report，AI overly affirms users asking for personal advice，2026-03-26。
   https://news.stanford.edu/stories/2026/03/ai-advice-sycophantic-models-research
   研究机构对自身 Science 论文的介绍；场景是人际建议，不是中文 X 短评论。只采纳迎合倾向这一有限结论，不把研究中的比例转换成检测准确率。
3. Pangram，Comprehensive Guide to Spotting AI Writing Patterns，Bradley Emi，2025-04-02。
   https://www.pangram.com/blog/comprehensive-guide-to-spotting-ai-writing-patterns
   厂商作者的一手观察：过度积极、重复输入和结论、通用而空泛的内容、节奏和结构均一、对比式包装等。文章列出英文 it’s not about X / it’s about Y。这里只把这些作为弱线索，不采用文章中关于 AI 无法创作或特定人名比例等笼统断言，也不把英语拼写、牛津逗号等规则移植到中文。
4. 简圣宇，《智能写作的“AI味”问题》，中国社会科学网，2026-07-03。
   https://www.cssn.cn/skgz/bwyc/202607/t20260703_6057355.shtml
   作者的语言风格观察涉及模板化衔接、空洞总结、重复和形式工整。它不是检测基准；没有采用文章中将所有生成流程描述为外部检索等不准确或过度概括的技术解释。

## 整理后的指导

关注迎合、复述包装、空泛升华、规整模板、低信息增量的整体组合。保持用户关心的“不是……而是……”等例子，但不做关键词命中即判；区分来源推断与低质量评论判断。没有原帖则不能声称已验证复述关系。

## 状态

- api.js 更新本地默认；store.js 精确迁移上一版原则短 Prompt，并继续保留自定义 Prompt。
- 27 项回归测试、语法检查和 git diff --check 通过。
- 本版尚未做新的 API 实测；历史 35/48 等数据不适用于这一版本，也未宣称准确率提高。
- 没有推送、没有合并。

本地浏览器生效验证：新开的正式设置页已显示完整中文 Prompt，点击 Save 显示 Saved.，点击 Clear cache 显示 Cache cleared.；模型仍为 jev-latest，endpoint 未变。未运行新一轮真实 API 准确率测试。
