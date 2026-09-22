# L3 真实回合证据

## `l3-real-12turns-prefix-2026-09-22.json`（36,511 B）

**这是什么**：VS-01 真实 L3 的**契约修复前**基线快照。用户 m00445 裁定「入档」。

**来源与口径**：由仓内真实模块（`buildChatMessages` → `callChatCompletion` → `runModelTurn` → `tickWorld`）在 **Node 侧**对真实服务商跑出，12 回合、1921-07 → 1922-06。模型 `deepseek-flash`，base `https://tokenrhythm.studio/v1`，预算档 `standard`。**不是**浏览器腿（浏览器腿按 CORS 被拒，见 `docs/acceptance-vs01.md` §4.2）。

**脱敏**：全文经扫描，**0 处** key/Bearer/api-key 命中；不含玩家真实输入以外的隐私内容。

**它证明了什么**（已在 `acceptance-vs01.md` §4.1 引用）：

| 事实 | 数值 |
|---|---|
| V17 token | prompt 883–1261（均 1150.1）、completion 171–773（均 465.4），合计 **19386**；`usageComplete` 12/12 |
| V18 缓存 | 10/12 次报 `cached_prompt_tokens`＝**恒 768**；可计数样本 7680/11383＝**67.5%**；`headHash` 恒 `ac768f48` |
| V19 意图/提议 | `blocksTotal`/`blocksApplied`/`proposeSeen`/`proposeUsable` **全 0** → 两率均 0% |
| 架构面 | `commitOk` 12/12 true；无重试、无连接失败；坏块逐条注记不中断 |
| 次生缺陷 | 10/12 回合 `narrativeChars == 0`（叙事单点依赖 `<Resolve>`） |

**为什么是「prefix（修复前）」**：V19 全 0 的根因是**静态头载荷契约缺口**（只列标签名、不规定载荷 JSON 形态）。该缺口已由用户拍板修复（`src/llm/prompt.ts` 的 `SEG_STYLE`），修复后静态头 `headHash` 由 `ac768f48` 变为 **`404e2aaf`**。因此本文件是**缺口存在的证据**，不是修复后的成绩单；修复后的复测另存为 `l3-real-12turns-postfix-*.json`（若已跑）。

**未留存项**：原始 12 条玩家输入文本**未逐条留档**（本快照的 `turns[].userText` 即当轮输入；复测所用脚本化输入集见 `tests/unit/llm/_l3-measure.spec.ts` 的 `INPUTS`，与原始输入**非同一集合**，复测须如实标注）。
