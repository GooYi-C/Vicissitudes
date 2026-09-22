# VS-02 验收单 —— DayLog 日结补账（S-07～S-11）

**批次卡**：`rebuild-v2.0/src/51-build-rings.md` §二十九.7（VS-02 卡，`:164-193`）；契约权威 `rebuild-v2.0/REBUILD.md` S-07～S-12
**编排裁决**（Lead，会话内拍板「方案 C」）：`dayClose`/`monthClose` 写成自包含纯函数（互不引用、零同层 import），顺序编排住组合根 `src/App.vue`；`events.ts` 导出纯函数 `duePromiseSituations`，由 L4 `monthRunner` 下引并批（单次提交）。**不扩豁免面、$0 共享文件改动。**
**完成判据**：本批门禁全绿 ＋ 九条失败判据各有**可失败**测试（9/9 注入验证，§3）＋ L3 人眼现象（历程面板逐日翻查、刷新读档 facts 完好、带 API 两回合）。
**当前状态（2026-09-22，HEAD `a015ae8`）**：L2 全绿（§4.1 数字）；**L3 人眼现象与真实 API 回合未测**——钥匙/端点须由用户在本机提供，程序见 §4.2。**本单不宣称 L3 完成。**

---

## 1. 范围对账

| # | 项 | 状态 |
|---|---|---|
| 1 | `src/turn/dayClose.ts`（新建 189 行）：日结判定与 DayLog 生成 —— 引擎侧 facts 从提交 ops 确定性导出（零 LLM）＋ S-08 五行边界 ＋ 规则日叙 | ✅ |
| 2 | `src/turn/monthClose.ts`（新建 127 行）：月关账 —— 当月日叙串联压缩为月志（~200 字，超限置 `truncated`）＋ `pastDigest` 预算档滚动（1200/1800/2400），**只压 narrative 不碰 facts** | ✅ |
| 3 | `src/turn/monthRunner.ts`（改 133 行）：S-10 约定到期并批进同一次提交；`isTerminalMonth` 语义＝年关账月（月关账每月一次，由组合根在日结后调用） | ✅ |
| 4 | `src/engine/events.ts`（改 297 行，S-10 段 `:179-297`）：`duePromiseSituations` 台账机检（纯函数、零提交权），到期/逾期入队处境，缺失/不可解析 `dueDate` → 不入队＋注记 | ✅ |
| 5 | `src/stores/saveSchema.ts`（改 157 行）：`dayLogs`/`monthLogs` 由 `z.unknown()` 收紧为 S-07/S-09 逐字段 Schema（DayFact 六 kind 判别联合 `:77-92`）＋ 编译期形状同步守卫 `:95-99` | ✅ |
| 6 | `src/App.vue`（改 630 行）：组合根编排 —— 月初快照（提交前）→ `tickWorld` → `closeDay` → `closeMonth`（`:234-267`）；持久化/读档带上三日志（`:84-128`）；历程逐日条目 `:180-194`；`<StoryView :entries="story" :digest="pastDigest" />`（`:500-502`） | ✅ |
| 7 | `tests/unit/turn/dayClose.test.ts`（新建 234 行 / 17 项） | ✅ |
| 8 | `tests/unit/turn/monthClose.test.ts`（新建 / 16 项＝15 项月关账 ＋ 1 项判据⑦ 组合根挂载取证） | ✅ |
| 9 | `tests/unit/engine/promise-due.spec.ts`（新建 259 行 / 15 项） | ✅ |
| 10 | `baseline/layer-graph.json`：+8 条新增边人工登记（§2） | ✅ |
| 11 | 本文件 `docs/acceptance-vs02.md` | ✅ |
| 12 | 断言条目（SAV/BIL/MEM 组）新增列表 | ⏳ 已交 Lead，由 Lead 写 `baseline/assertions-v2.json` 并跑 `tools/ledger.mjs --merge`（账本不在本批写面） |

**代码覆盖**：批次卡要求的三个测试文件与全部产出文件齐备；L3 人眼现象留待 §4.2 程序实做。

## 2. 豁免与硬依赖台账（审计面）

| 项 | 内容 | 登记处 |
|---|---|---|
| 不扩豁免面 | `dayClose.ts`/`monthClose.ts` 是 L4 自包含纯函数：互不引用、不引任何同层文件、不引 L7（L4→L7 非法）。`static-checks.mjs:156-157` 对豁免面外文件只输出提示行不失败，实际输出：`[ok] LAYER-5 LAYER-004 豁免面外文件（dayClose.ts, monthClose.ts, resolves.ts）——互引仍被 lint/graph 拦截` | `eslint.config.js` LAYER_EXEMPT 未改；`EXEMPT:LAYER-004` 无需新增 |
| layer-graph 8 边人工登记 | `App.vue→turn/dayClose.ts`、`App.vue→turn/monthClose.ts`、`App.vue→validation/calendar.ts`、`engine/events.ts→validation/calendar.ts`、`turn/dayClose.ts→validation/calendar.ts`、`turn/dayClose.ts→validation/effects.ts`、`turn/monthRunner.ts→engine/events.ts`、`turn/monthRunner.ts→validation/effects.ts`。全部为「组合根→层」（不查层向）或**下引**（L4→L2/L1、L2→L1）；无跨层上引、无同层互引 | `baseline/layer-graph.json`（`gate:graph` PASS，291 条边／去重键 286） |
| S-10 契约冲突留痕（不自行改契约） | 卡文 S-10 写「L2 events 读 `SaveRecord.dayLogs[*].facts`」，但 `dayLogs` 住 L7、`Tree` 不含它、`TickContext`（`src/engine/types.ts`）无该通道 → L2→L7 越层非法。处置：判定逻辑仍住 L2（零 LLM／零提交权），把 `dayLogs` 作**显式入参**，由 L4 `monthRunner` 调用并与月推进效果同批单次提交。原文注释见 `src/engine/events.ts:180-183` | 本单 §5 与代码注释；契约文本未改 |
| `SAVE_SCHEMA_VERSION` 不递增（=1） | 论证（`src/stores/saveSchema.ts:5-12` 注释）：三个字段自 v1 起已在 `SaveRecordSchema` 内且既有档恒为空数组；本次仅把 `z.unknown()` 收紧为逐字段 Schema —— 对空数组恒真，属非破坏性变更。若实测出现旧档不过校验，按 S-05 **递增拒载**（宁拒载不猜测），不做投影 | `gate:static` SAV-4/U-2 全绿；编译期守卫 `DayFactShapeSynced/DayLogShapeSynced/MonthLogShapeSynced` |
| S-11 月初快照 | 快照调用先于 `tickWorld`（`src/App.vue:236-238`），每月恰一次（台账去重），`slotId=auto-{月}` → 同月幂等 put、跨月由 `writeAutoSave` 滚动保留 12 | 判据⑦ 挂载测试（§3） |
| 受限项：对话侧 facts 无生产通道 | `advanceTurn({ dialogFacts? })` 已接且含坏条降级（`src/turn/dayClose.ts` 对话侧分支），但 `src/parser/blocks.ts:6` 的 `BlockTag` 是封闭集、无 DayFact 类标签，扩标签＝新增机制（不在本批）→ 实际运行时该入参恒为空；`promise` 类 facts 只由测试直接构造 `dayLogs` 验证机检。**不得记为「已覆盖」** | 本单 §5 |

## 3. 验收判据逐行状态（九条，均有可失败测试）

注入验证＝临时改写实现 → 跑对应用例 → 还原（`git status` 复核无残留），**9/9 CAUGHT**。

| # | 判据 | 证据（测试） | 注入验证（注入 → 结果） | 状态 |
|---|---|---|---|---|
| ① | 月关账早于日结（S-08 不变量 1，**报错级**） | `monthClose.test.ts:42-70` 三项（顺序违反抛错／悬空月外抛错／抛错路径零副作用）；实现 `monthClose.ts:57-81`；正确顺序由 `src/App.vue:242-258` 保证 | 摘除 `assertDayCloseFirst` 调用 → 3 项失败 ✓ | L2 ✅ |
| ② | 月关账后任一日 facts 减少（SAV-2，本批最核心） | `monthClose.test.ts:72-101`（在 `truncated=true` 前提下 dayLogs 逐字节原样、facts 与输入同一引用） | `dayLogs: input.dayLogs.map(d => ({...d, facts: []}))` → 失败 ✓ | L2 ✅ |
| ③ | 在途 7 日生成 7 条 DayLog（SAV-11） | `dayClose.test.ts:58`「整段只 1 条、date 记起始日并标 transit」 | 在合并锚点前按 `span` 生成 N 条 → 失败 ✓ | L2 ✅ |
| ④ | 空日缺条目（历程逐日必有条目） | `dayClose.test.ts:75/82`（空日照落＋不覆盖既有正文）；`monthClose.test.ts:127`（全空月一行「本月平静。」）；逐日映射 `src/App.vue:180-194` | 空 facts 时不落 DayLog → 失败 ✓ | L2 ✅ |
| ⑤ | 同存档重放 facts 序列不一致 | `dayClose.test.ts:147-171`（两次重放逐字节一致＋「改 fact 必变」对照）；`promise-due.spec.ts:203` | 模块级计数器渗入规则日叙 → 3 项失败 ✓ | L2 ✅ |
| ⑥ | promise 到期处境挤占合池配额或受单轮 ≤2 约束（S-10 不变量 1） | `promise-due.spec.ts:86-121`（队列满 10 且合池 ≤2 之上：3 条到期一次性全入）；`:215` 整合（与月推进同批单次提交、既有 eventCD 不被覆盖） | 给机检加 `injectedKeys.length >= 2` 闸 → 失败 ✓ | L2 ✅ |
| ⑦ | 月初快照为提交后状态（S-11 不变量 1） | `monthClose.test.ts` 末 describe「判据⑦ 组合根顺序」（`createApp` 挂载：`auto-1921-07` 档 `world.date=1921-07`、`dayLogs` 为空；当前档已 `1921-08` 且日结/月志落账；零网络调用）；实现 `src/App.vue:236-238` | 把 `snapshotMonthStart` 挪到 `tickWorld` 之后 → 失败 ✓（快照月份变 `1921-08`，`auto-1921-07` 不再出现） | L2 ✅ |
| ⑧ | 对话侧抽取失败导致引擎侧 facts 缺失（S-07 降级语义） | `dayClose.test.ts:173-212`（整批坏块 → 逐条注记且引擎侧照常；`undefined ≡ []`） | 坏条时提前 return 丢弃引擎 facts → 失败 ✓ | L2 ✅ |
| ⑨ | narrative 文本内容进入任何机制分支（S-08 红线：结构判定零语义） | `dayClose.test.ts:214-234`（只换文本 → 结构投影逐字节一致＋敏感性对照） | 依 note 文本内容追加 situation fact → 失败 ✓ | L2 ✅ |

## 4. 实测程序与数字

### 4.1 本批 L2 复核（2026-09-22，`vicissitudes/`）

| 命令 | 实测结果 |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 46 文件／517 项：**516 通过**；1 失败＝`tests/unit/llm/_l3-measure.spec.ts`（`AssertionError: 需要 L3_KEY 环境变量`，未跟踪文件、非本批产物，见 §5） |
| `pnpm test` 排除该文件（`--exclude '**/_l3-measure.spec.ts'`） | 45 文件／516 项**全过** |
| `pnpm test:data` | 2 文件／29 项全过，exit 0 |
| `pnpm gate:static` | `PASS（21 项全绿）`，exit 0 |
| `pnpm gate:graph` | `PASS —— 快照一致（291 条边），无非法边`，exit 0（快照去重键 286） |
| `pnpm gate` | **exit 1**：唯一失败＝上述 `_l3-measure.spec.ts`（Lead 的临时工装）；`typecheck`/`lint` 均已 exit 0，`&&` 链在 test 步中断，故 `test:data`/`gate:static` 由单跑补证。**本批判据口径（Lead 裁决）**：以「排除该工装」的 516 全过 ＋ 各分步 exit 0 为本批证据；待工装移除后由 Lead 补跑整体 `pnpm gate` |

本批新增测试 **48 项**（dayClose 17 ＋ monthClose 16 ＋ promise-due 15）全绿；注入验证 9/9（§3）。
`_l3-measure.spec.ts` 的存在与否**不影响本批判定**：排除后本批 45 文件 / 516 项零失败。

### 4.2 手工 L3 程序（用户本机；key 不得进聊天/命令行/文档/日志）

1. **免 API 开局 → 过 3 个月**：不填 upstream，开局后连续过月，其间触发一次旅行（跨 2 个月以上）与一次处境；打开历程面板逐日翻查：每个活跃日恰一条、空日为「本月平静。」、跨多日在途只有一条且日期记起始日。
2. **刷新读档**：刷新页面 → 历程条目／`pastDigest` 文本／逐日 facts 完好；DevTools → IndexedDB `vicissitudes` → `autoSaves` 可见 `auto-{月}` 档，其 `variables.world.date` 为该月月初**提交前**状态、`dayLogs` 中不含该月后续回合的日结。
3. **零调用地板 ＋ 带 API 两回合**：清空配置后 Network 面板应零请求（BIL-3）；随后填 upstream 跑 2 回合，核对 LLM 日叙与结构块落账——对话侧 facts 通道当前无 parser 块标签（§2 受限项），`dialogFacts` 恒空；引擎侧 deal/move/situation facts 照常。
4. 以上任一步骤失败须按原样记录，不得把未测项改成通过；缺服务商维度时记受限项并交主理人裁定验收口径。

## 5. 已知缺口＋下一批提醒（不在本批范围——「顺手做了按事故处理」）

- **工作区内存在 Lead 的临时 L3 工装 `tests/unit/llm/_l3-measure.spec.ts`（未跟踪、非本批交付件、测完即删），故 `pnpm gate` 全链在本轮被该工装拦住，待其移除后由 Lead 补跑整体 gate**（Lead 裁决：本批证据取「排除该文件」口径，见 §4.1）。该工装不在本批写面内，本批自始至终未碰它。
- **对话侧 facts 无生产通道（受限项）**：`advanceTurn({ dialogFacts? })` 已接好并含降级语义，但 `src/parser/blocks.ts:6` 块标签为封闭集，新增 DayFact 类标签属新增机制 → 本批不做；运行时恒空，`promise` 类 facts 仅测试直接构造验证。
- **判据⑦ 取证位置**：组合根挂载用例住在 `tests/unit/turn/monthClose.test.ts` 末（该文件首行加 `// @vitest-environment happy-dom`），未新增测试文件、未外扩写面；若要求独立为 `tests/unit/ui/month-snapshot.test.ts`，迁移成本≈一次文件移动。
- 范围外：向量索引与 daylog namespace（LL-18/S-18）、split 模式日叙触发判定（LL-14）、报纸三阶注入、回溯分叉语义（S-12）、死亡完结档冻结（S-13）、月志/往事记要的 LLM 压缩质感（当前为规则拼接）。
- `rebuild-v2.0/` 未改一字；`SAVE_SCHEMA_VERSION` 不递增的论证见 §2。

## 6. 目录核对（提交前）

- 本批 11 个文件：新建 3（`src/turn/dayClose.ts`、`src/turn/monthClose.ts`、`docs/acceptance-vs02.md`）＋ 新建测试 3 ＋ 修改 4（`src/App.vue`、`src/engine/events.ts`、`src/turn/monthRunner.ts`、`src/stores/saveSchema.ts`）＋ `baseline/layer-graph.json`（+8 边）
- 未碰：`rebuild-v2.0/**`、`src/llm/**`、`src/parser/**`、`src/gameCommands/**`、`src/orchestration/**`、`src/components/**`、`baseline/assertions.json`（账本由 Lead 统一写）
- 工作区另有一个既存未跟踪文件 `tests/unit/llm/_l3-measure.spec.ts`（非本批）
- 回滚面：删 `dayClose.ts`/`monthClose.ts`，还原 `App.vue`/`events.ts`/`monthRunner.ts`/`saveSchema.ts` 与 `layer-graph.json` 的 8 条边
