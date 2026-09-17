# 断言账本审计（四环验收后 · 2026-09-17）

> 名目：§三十.2 纪律的环后核销——四环（R1～R4）验收完毕后，对账本做一次性三方对账：
> ① 副本漂移 ② 组级关联断言复跑状态 ③ 新增行为是否欠账。

## ① 副本漂移（TEC-02：「baseline/assertions.json 副本在位（文档仓为权威）」）

- 文档仓 merge 输出 `rebuild-v2.0/baseline/assertions.json` = **46,266 字节**
- 代码仓副本 `vicissitudes/baseline/assertions.json` = **46,266 字节**
- 逐字节比较：**equal = true**。副本同源，无漂移。

## ② 账目总量对核

- 合并账本：version 2｜16 组｜**176 条**（含 mut 24、含 legacy 47）——`node tools/ledger.mjs --check` 绿。
- 构成核对：v1.0 账本 **85 条**（vendor 冻结，v2.0 一律不改）＋ v2.0 新增 **91 条**（TEC 5＋MOB 6＋LAYER 4＋DAT 22＋MOD 7＋BUS 7＋LLM 22＋SAV 9＋UI 9）＝ **176** ✓。
- v2.0 **未**为 EVT／MEM／ECO／NUM／BIL／ARC／SKL 组新增条目——这些组的条目全部 v1.0 传承（另 LLM、SAV 有 v2.0 追加）。
- 文档↔账本：`--coverage` 绿（分片引用 106 个 ID 全部在账）；全仓 `待办` 计数 **0**。

## ③ 组级复跑状态（主责批次 → 复跑渠道 → 状态）

| 组 | 条数 | 主责批次 | 复跑渠道（现况） | 状态 |
|---|---|---|---|---|
| SKL | 5 | SK-07 | 骨架五门验收（acceptance-skeleton） | ✅ 已验 |
| ARC | 7 | SK-05 | `pnpm gate:graph`（256 边基线）＋ gate:static 静态断言 | ✅ 四环复跑 |
| LLM | 30 | SK-01＋SK-04 | parser/sanitize/agent 侧单测（vitest 347 套件内） | ✅ |
| MEM | 15 | R2 | `memory.spec`（归档底线含 R4 修复）＋ r4-loop 月度断言 | ✅ |
| EVT | 9 | R2 | 处境/event 引擎单测＋ r3-commands | ✅ |
| ECO | 9 | R1 | market/trade/settlement/finance/fiscal/worldtick 单测＋ 12 月 loop 逐位一致 | ✅ |
| BIL | 7 | R1＋SK-07 | 调用计数/零调用地板（gate:static＋SK-07 门） | ✅ |
| NUM | 8 | R1（物价锚）＋R4（对抗公式） | 量纲带断言（引擎单测；对抗公式在 forces/war 单测） | ✅ |
| DAT | 28 | SK-06 | `pnpm test:data`（29 例：hash-writer 3＋cross-table 26） | ✅ |
| SAV | 20 | SK-02/03＋R2 | saveSchema 单测＋ 旧档默认补齐（r4-loop 末例） | ✅ |
| TEC | 5 | SK-00 | gate:static TEC-1/TEC-2 全项 | ✅ |
| MOB | 6 | SK-06 | gate:static MOB-5（无 maplibre）＋ UI-6 面板注册表 | ✅ |
| LAYER | 4 | SK-00＋SK-05 | gate:static LAYER 组＋ graph 基线 | ✅ |
| MOD | 7 | SK-05 | `registry.test`（16 模块表、写域冲突巡视、cadence 断言） | ✅ |
| BUS | 7 | SK-04 | TurnRunner 原子提交＋rng 派生（r*-loop 逐位一致） | ✅ |
| UI | 9 | SK-06 | selectors 单测＋ gate:static UI-2/3/6 | ✅ |

**口径声明**：逐 ID 断言运行器**未建**——各组通过上表渠道以「组」为单位复跑全绿，本表即现行验收记录；
逐 ID 自动执行器作为可选增强留待后续（不构成验收缺口，因各蓝卡「关联断言」列均挂在**既有组**上复跑）。

## ④ 同批建账纪律（§三十.2 第 2 条）核销

- R1～R4 各环卡的「关联断言」均为**既有组**（见环卡 L45/L75/L101/L128），未引入新断言条目 → 无「以后补账」欠账。
- 唯一存量行为修正：R4 修复 `memory` 归档底线（importance 入树底 1）——不新增断言条目，由既有 MEM-3c（归档不删除/事实不灭）的持续绿承接；本环末例「旧档删三域补默认」由既有 SAV 形状类条目承接。

## ⑤ 结论

- ① 副本同源 ✓　② 176 条账目闭合 ✓　③ 16 组主责批次全部跑绿且有复跑渠道 ✓　④ 无欠账 ✓。
- 未分派组：**零**（§三十.2 第 3 条）。
