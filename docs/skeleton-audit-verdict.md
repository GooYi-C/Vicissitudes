# 骨架期审计结论合并版（外部审计 × 四路独立核验）

**快照锚点**：`2026-09-23 00:05:34 +08:00` ｜ HEAD `a015ae8`（ahead 1）｜ 工作树 11 modified + 11 untracked
**性质**：只读核验记录。本文件不修改任何代码、不改 `rebuild-v2.0/**`、不动账本。
**方法**：外部只读审计出 P0/P1/P2 清单 → Lead 开四路独立核验（时代/身份、命令链、UI/面板、计数/卫生），每路各自回源码复核，对每条给「属实／部分属实／不实」，并标出审计本身的错误。全部结论均带 文件:行号。

> **口径警告**：本次审计窗口内（23:15–00:03）代码仓仍在被并发写入，最新写入距快照仅 2 分 24 秒。下文所有数字绑定上述快照时刻，**不保证对后续提交成立**。

---

## 一、总账

审计共 14 条。核验后：**属实 8 条、部分属实 5 条、不实 1 条**；另由核验过程**新增 6 条**审计未抓到的问题（其中 3 条比原条目更严重）。

### P0（阻断「可玩」）

| # | 结论 | 证据锚点 |
|---|---|---|
| **P0-1** | **九个面板恒空；11 面板中只有生涯面板渲染真实数据**。根因是两套独立缺陷叠加：7 处 `v-for` 迭代函数引用（缺 `()`）+ 2 处 `v-if="false"` + 5 处 selector 写死空值 | `panels/*.vue:22`、`selectors/index.ts:48-52,81,82,84,85-88` |
| **P0-2** | **五个时代一律从 `1921-07` 开局**，与所选时代无关；且 `EraSchema` 无开局月份字段，无数据源可派生 | `App.vue:42,200`、`dataSchemas.ts:8-14`、`REBUILD.md:326` |
| **P0-3** | **`SK-07` 骨架验收门第 2 条与代码实况矛盾**（门已标「已验收 2026-09-15」） | `REBUILD.md:5288`、`:4151`、`:4158`、`docs/acceptance-skeleton.md:25` |

### P1（"躯干"在，但"肌肉"没接到骨头上）

| # | 结论 | 证据锚点 |
|---|---|---|
| **P1-1** | 白名单/prompt 向模型放行 6 个命令，引擎只编译 `Travel`；失败被吞成**玩家看不到原因**的诊断，且文案**归因错误** | `compiler.ts:261-275`、`authorize.ts:10-17`、`prompt.ts:38`、`turnLoop.ts:69-75`、`App.vue:311` |
| **P1-2** | 身份不落地：无身份选择 UI、`identityId` 被丢弃、开局钱恒 0、40 条身份表 + `startCity` 全死数据；LLM 看到「未名／未知／0」 | `OpeningDossier.vue:29`、`gameCommands/index.ts:21`、`tree.ts:373`、`prompt.ts:106-113` |
| **P1-3** | **1921–1935 领土层全空 ⇒ 占领命令引导死锁**（需要「已控制城」才能占领，而控制权唯一来源就是占领本身） | `tree.ts:360`、`occupation.ts:41-46`、`factions.ts:110`、`history.ts:55` |
| **P1-4** | 实业整套机制是空壳：`finance.businesses` 无任何播种者 ⇒ `financePost` 永不可达 | `finance.ts:40,65`、`tree.ts:366` |
| **P1-5** | 设置 9 字段 7 个无实现，但契约标「生效」、断言账目挂着**不存在的实现** | `settings.ts:11-33,43-46`、`REBUILD.md:3098,3498`、`assertions.json:161,681` |
| **P1-6** | `R3-3` 命令实现（Occupation/Scout）与回合链**零接线**，全仓调用点只有测试；`adjacency` 传递不可达 | `gameCommands/{occupation,scout}.ts:26/29`、`r3-commands.spec.ts:4-5` |
| **P1-7** | 四表无消费者（talents 15／business 8／toponyms 13／prologue 5）；`stores/meta.ts` 全仓零引用 ⇒ 成就永不落盘 | `loader.ts:9,13,16,17`、`meta.ts:26,34` |
| **P1-8** | 五表条目数大幅低于契约锚：timeline 29/58、toponyms **13/311**、worldbook 12/36、events 12/32、situationTemplates 8/19 | `21-contract-data.md:96,98,100,103,104` |

### P2（卫生与口径）

- `layer-graph.json` 含 **26 条重复边**仍 PASS（`graph-check.mjs:110-113` 用 Set 比对，`:127` 打印未去重条数）
- 文档/提交信息硬编码计数全部过时：声称 468/283/187，实测 **524/291/192**
- `HANDOFF.md:13,14,15,91` 大面积过时（"代码仓还不存在"）
- 无 CI（`.github` 不存在）、无 wrangler 配置、无任何部署痕迹
- `loader.ts:27-29` 注释引用了不存在的 `vite.config` polyfill；`node:crypto` 在浏览器侧被外置，仅告警不失败
- 11 modified + 11 untracked 未提交；**11 个文件是这两天新产出的**

---

## 二、P0-1 详情：面板恒空是**渲染 bug**，不是"数据没接上"

外部审计报「6 个恒空」；核验后为 **9 个恒空 + 1 个挂起，仅 1 个正常**。

### 缺陷一：`v-for` 迭代的是函数本身，不是返回值（7 处）

写法：`const goals = () => evaluate(goalsList, ...)`，模板写 `v-for="g in goals"` —— **少了 `()`**。
Vue `renderList` 只认 Array/string/number/object，函数不落任何分支（`@vue/runtime-core` 源码）。以仓内 `vue@3.5.42` + `@vue/compiler-sfc@3.5.42` 实证：

```
typeof fn = function
renderList(fn)        = []      # ← 函数 → 空
renderList(undefined) = []      # ← book.items（MemoryPanel）
renderList([1,2])     = [1,2]
```

### 缺陷二：`v-if="false"` 永不求值（2 处）

编译产物为 `false ? (...) : _createCommentVNode("v-if", true)`，条件字面 `false`，分支 100% 不显示。
**附带隐患**：该死分支若被打开会**直接抛错** —— `sheets` 是函数，`_ctx.sheets.income.length` ⇒ `undefined.length` ⇒ `TypeError`。

### 逐面板矩阵（11/11）

| 面板 | 判定 | 证据 |
|---|---|---|
| 生涯 Career | ✅ **唯一正常** | `CareerPanel.vue:18` `{{ data().money }}` —— **全仓唯一带 `()` 的调用** |
| 状态 Status | ❌ `v-if="false"` | `StatusPanel.vue:18` |
| 账本 Finance | ❌ `v-if="false"` ＋ selector 写死 | `FinancePanel.vue:18`、`selectors/index.ts:48-52` |
| 目标 Goals | ❌ `v-for` 函数 ＋ selector 写死 `[]` | `GoalsPanel.vue:22`、`selectors/index.ts:81` |
| 史册 History | ❌ 同上 | `HistoryPanel.vue:22`、`:85-88` |
| 人脉 Relations | ❌ 同上 | `RelationsPanel.vue:22`、`:84` |
| 记忆 Memory | ❌ `v-for` 函数 ＋ `book.items` 也是函数 | `MemoryPanel.vue:22`、`:82` |
| **报夹 Press** | ❌ **仅 `v-for` 缺陷**（selector 数据是真的） | `PressPanel.vue:22`、`:83` |
| **情报 Intel** | ❌ **仅 `v-for` 缺陷** | `IntelPanel.vue:22`、`:55-59` |
| **世界 World** | ❌ **仅 `v-for` 缺陷** | `WorldPanel.vue:22`、`:27-34` |
| 地图 Map | ⏸ 挂起占位（设计如此） | `MapPanel.vue:11-13` |

### 关键区分：「域为空」只对 memory/relations 成立，对 goals/timeline **必须**用「selector 写死」解释

零 API 流程（`App.vue:238` `tickWorld` → `monthRunner.ts:46` → `scheduler.ts`）下各域真实状态：

| 域 | 写者 | 零 API 下是否有数据 |
|---|---|---|
| `goals` | `engine/goals.ts:96-123`，首月即抽满池 | **有** |
| `timeline` | `engine/history.ts:49`，落账 `compiler.ts:209` | **有** |
| `memory` | 唯一生产者是 `turn/resolves.ts:97`，仅 `llm/turnLoop.ts` 调用 | **空** |
| `relations` | `consistency.ts:33-40` 由 `memory.items[*].people` 注册 | **空** |

### 为什么 523 项测试全绿也拦不住

`.vue` 在**面板层面零测试引用**。`Panels` 的渲染无人断言（对 `GoalsPanel|PressPanel|WorldPanel|IntelPanel|MemoryPanel` 的测试 grep 命中 0）。
更正审计的一处错误：`.vue` 共 **17** 个（非 16），`App.vue` 被 2 个测试 import、`OpeningDossier.vue` 被 2 处 `vi.mock`；零引用的是**其余 15 个**（含全部 11 面板）。

### 与验收门的直接矛盾

- `REBUILD.md:5288`（SK-07 门 2 的 L3 观察列）：「11 面板全部挂载且显示引擎真实数据（非占位文本）；LLM 调用计数 = 0」
- `REBUILD.md:4158`：「骨架门「面板有内容」不达即**验收门失败**」
- `REBUILD.md:5277`：该门标 **已验收（2026-09-15）**
- `docs/acceptance-skeleton.md:25` 声称「生涯面板显示真实数据，**报夹来自史实报名表**」—— 报夹那条在当前代码下**不成立**（`pressRack` 数据对，但 `PressPanel.vue:22` 渲染 0 行）

---

## 三、P0-2 详情：时代日期

### 事实

- `App.vue:200` `startGame({ eraId, identityId: kind || 'student', date: '1921-07' })` —— **字面量**，与 `eraId` 无关
- `App.vue:42` 第二处同款字面量：`initialTree('era-warlord', '1921-07')`（开局前占位树）
- `src/data/eras.ts:5-11` 五条字段只有 `{id, name, fromYear, toYear, desc}`
- `src/validation/dataSchemas.ts:8-14` `EraSchema` 同样**无月份/开局日期字段** ⇒ **五个时代零个带开局月份**，不是"有数据选错了"，而是**没有可派生的数据源**
- `dist/assets/*.js` 打包产物确认线上就是这个硬编码
- 模型路径不可触发：`authorize.ts:20` 把 `startGame` 列入 `SYSTEM_COMMANDS`

### 被违反的契约与不可能通过的验收

- `REBUILD.md:326`：「玩家从哪个时代开局，世界就从哪年哪月开始推演」—— 被违反
- `vicissitudes/baseline/assertions.json:538`：「五时代双向差异：相邻时代同身份推 12 个月，处境池差异非空」
- `:932`：「史实锚定校准：五时代开局各推 12 月」
- 事件池按 `world.date` 年份开门（`engine/events.ts:44-48` `eraGate`、`:61-69` activeThemes）⇒ 五时代全停 1921 ⇒ **处境池完全相同** ⇒ **`:538` 在当前 UI 下不可能通过**

### 为什么自动化漏掉

- `scripts/browser-smoke.mjs:49-53` 只点第一个「军阀」按钮，断言 `1921-07`
- `tests/e2e/gates/gate3-months.spec.ts:15-16` 写死 `initialTree('era-warlord','1921-07')`
- 引擎单测**手工配对**正确日期（`events.spec.ts:144-145`、`market.spec.ts:53-55`、`factions.spec.ts:16,34-35`）

### 一条方向相反的偏差（新发现）

`REBUILD.md:331`／`:5611` 明写「era 字段唯一职责=出身标签、**运行时没有任何逻辑按 era 字段分支**」，但实现里：
- `src/engine/factions.ts:98` `AGGRESSION[tree.era?.eraId]` —— **按 era 分支**
- `src/engine/market.ts:105` `WAR_FACTOR`（resistance 2.5）—— **按 era 分支**

⇒ 该分支的地方（开局日期）没分支，说不该分支的地方分支了。符合蓝图的修法是：**开局日期按时代派生**（需先补时代级开局年月数据），**运行时行为全部由 `world.date` 推导**。

### 修法前提（需产品/数值侧给值）

`EraSchema` 需扩字段以承载「每个时代的开局年月」。蓝图目前**没有**逐时代月份表，只有"各时代开局日跑 12 月"的校准要求（`vendor/v1.0/REBUILD-附录E-数值设计书.md:177,226`）。

---

## 四、P0-3 之外的引擎层：P1-3 占领引导死锁（审计未抓到的最严重一条）

### 死锁链

```
occupation.ts:41  playerCities = cities.filter(c => activeControllerForCity(tree, c.id) === 'player')
occupation.ts:43  hasAdjacency = playerCities.some(pc => adj.hopDistance(pc.id, input.cityId) <= 1)
occupation.ts:44  if (!hasAdjacency) return { ok:false, reason:'no-adjacency',
                                    message:'目标城不与你的控制区接壤（邻接前置不满足）' }
```

- `controller:'player'` 的**唯一生产者**就是 `occupation.ts:69` **自己**
- `tree.ts:360` `territoryControl: { claims: [] }` 开局为空
- `history.ts:55` `if (e.from <= lastCursor || e.from > nowISO) continue` ⇒ 1921–1935 任一月，唯一条目 `from=1936-01-01 > nowISO` 全被跳过
- `factions.ts:110` `if (!controller || controller === 'none') continue` ⇒ 每座城都跳过
- ⇒ `playerCities = ∅` ⇒ `hasAdjacency` 恒 false ⇒ **占领命令 100% 不可达；史实通道也要等到 1936-01**
- ⇒ **默认开局（`era-warlord` 1921-07）的整整 15 年里，玩家永远无法建立第一块控制区**

### 期间仍在动的部分（限定"空转"的范围）

`factions.ts:167-168` 仍发 `forcesPost`（兵力 +5–15%/月）与 `warPost`，但这些兵力找不到出口；`timeline`（29 条）与 `events` 仍照常触发。
⇒ **准确表述应限定为「领土/势力层空转」**，不是全系统静止。

### 数据口径更正

`src/data/political-1936.json`：`coverage 1936-01-01..1936-12-31`、`groups = 4`（north 3/east 3/south 3/northeast 1）、**polity 条目 = 10**、distinct `polityId` = **9**（`vic.guangdong` 出现两次：1936-01~07 `zhiyuan`、1936-07~12 `guomin`）。
⇒ 审计写「4 组 9 条」：**4 组对、条数应为 10**（9 是去重后数）。
另：`history.ts:11` 注释写半开区间 `[1936-01, 1937-01)`，数据逐条写 `to = "1936-12-31"`，引擎判活用 `from <= iso && iso < to` ⇒ 两处表述不等价，属可补的口径瑕疵。

---

## 五、P1-1 详情：命令集 6 放行 / 1 可编译

- `compiler.ts:261-275` `compileCommand`：只有 `case 'Travel'`(`:264`)、`case 'startGame'`(`:266`)，`default:`(`:272`) 抛 `CompileError('未知命令: X（命令登记见 SX-06）')`
- **易混淆点**：同文件 `compile()`(`:22-259`) 有约 25 个 `DomainEffect` case —— 那是**效果编译器**，不是命令编译器
- `CommandInput.cmd` 类型是裸 `string`（`validation/effects.ts:62`），**无联合类型收窄** ⇒ 类型系统拦不住
- `authorize.ts:10-17` 白名单放行 6 个，`:59-62` 硬判定；`prompt.ts:38` 同样告知模型 6 个
- 失败路径：`turnLoop.ts:69-75` 的逐块 try/catch → **`break`**（非 `continue`）→ 记 `命令编译失败：…` → 0 个 DomainEffect → 世界零变更
- 若整回合仅此一块：`effects=[]` → `compile([])=[]` → `applyPatch(tree,[])` 经 `TreeSchema` 通过 → 回合 `ok:true` ⇒ **静默空转**

### 玩家可见性的真实情况（更正审计）

唯一渲染 diagnostics 的 `.vue` 是 `App.vue:311`：

```ts
if (turn.diagnostics.length) entry.text += `\n（回合注记 ${turn.diagnostics.length} 条——叙事照常，越界已剥除）`
```

⇒ 玩家**只看到条数**，看不到失败原因；且该文案把**编译失败错误归因为「越界已剥除」**；全仓无 DebugPanel（`App.vue:309` 注释自认「DebugPanel 未建位」）。

### 连带发现

`App.vue:275` `if (text.includes('出趟远门')) void travel('1921-08', tree.value)` —— **唯一被支持的命令，其 UI 路径也 `void` 丢弃 effects**，日期还写死 `'1921-08'`。

---

## 六、P1-2 详情：身份不落地（审计的关键场景描述**不实**）

### 事实链

1. `OpeningDossier.vue:7` `defineEmits<{ start: [eraId: string, kind: string] }>()`
2. `:25-33` 只 `v-for` 时代按钮，`:29` `@click="emit('start', e.id, '')"` ⇒ **`kind` 恒为空串**
3. `:36` `v-if="idList('era-warlord').length"` —— 只用身份列表做**真值计数**；`:39` 提示文案静态；**全文无 `startMoney` 引用**
4. `App.vue:196` 收到 `kind = ''`；`:200` `identityId: kind || 'student'` ⇒ 恒为 `'student'`
5. `gameCommands/index.ts:21` `const variables = initialTree(params.eraId, params.date)` —— **`identityId` 在此被丢弃**
6. `validation/tree.ts:351` `initialTree(eraId: string, date: GameDate)` —— **连形参都没有**
7. `tree.ts:373` `career: { money: 0, reputation: 0, health: 100 }, // E-0.2 初值（开局钱由身份表 startMoney 覆写 —— SK-06 命令层）` —— 覆写者不存在
8. `App.vue:90` 与 `:164` 两条存档路径写死 `identityId: 'student'`；`restore()` **从不读回**

### 更正审计

审计称「开局卡写着实业家 200 银元、进游戏身家 0」——**该落差不会发生**，因为**根本没有身份选择 UI**（连实业家都选不到）。
其真实性质是**未完成的功能缺口**，不是已上线的数值错误。建议 P0-2 降为 P1。

### 数据侧

- `src/data/identities.ts` 40 条（5 era × 8 kind），每 era 的 `startMoney` 恒为 **5, 5, 50, 10, 15, 8, 20, 200**（学生5/工人5/商人50/记者10/士兵15/教师8/医生20/实业家200）—— 审计漏了第二个 5
- `startCity`（beijing/shanghai/…）全仓**零消费**
- 生产侧唯一读 `startMoney` 的是 `selectors/index.ts:77`（投影给开局卡），其消费者只有测试

### 最严重的一处玩家可见后果

`prompt.ts:106-113` `segWorldState` 读 `career.name`→`'未名'`、`career.city`→`'未知'`、`career.money`→0，拼出：
> 「⑥世界状态：1921-07，你在**未知**，**未名**，银元**0**，健康100。」

而 `CareerSchema`（`tree.ts:153-157`）**只有 money/reputation/health，没有 name/city 字段** ⇒ 身份、初始城市、初始钱**三者同时缺席**，被直接喂进 LLM。

---

## 七、P1-4 详情：实业空壳

- `finance.ts:38-40`：`entries = Object.values(businesses)`；`if (entries.length === 0) return []`
- `:47-55` 只遍历**既有键**，`:65` 回写 `financePost`
- **全 `src` 无任何代码新建实业主键**：写 `finance.businesses` 的只有 `finance.ts` 自身、`compiler.ts:130-134`（value 即 finance 产出的 `next`，仍只含旧键）、`goals.ts:40`（只读）、`settlement.ts:47`（只读）
- L0-07 `business` 表只在 `loader.ts:38,64` 与 `dataSchemas.ts:81,213` 挂载，**无消费方实例化**
- ⇒ `tree.ts:366 finance: { businesses: {} }` 恒空 ⇒ `financePost` **永不可达**，"实业"整套机制是空壳

### 内容表 payload 现状（更正审计一处措辞）

实测 `src/data` 下 op 取值**唯一 = `modifyPlayer`**，共 41 处（events 12＋situationTemplates 14＋talents 15）。
但审计称「无人能产出 `claimTerritory`」**字面不成立** —— 有三个实际生产者：
- `gameCommands/occupation.ts:68-69`（玩家占领）
- `engine/factions.ts:156`（势力攻城：预警挂满 `LEAD_MONTHS=1` 且攻方 > `garrison×1.3`，contested 满 `CONTESTED_MONTHS=2` 后并入）
- `engine/history.ts:57`（史实覆盖层）

准确表述应为：「**内容表**只能产 `modifyPlayer`，领土通路不依赖内容表」。

---

## 八、P1-5 详情：设置字段 = 承诺未兑现（不是"未接线"）

`settings.ts:11-33` 9 字段的真实读写面（`src/` 内）：

| 字段 | 状态 |
|---|---|
| `upstream` | ✅ 生产在用（`App.vue:79-80,222,228,295,393,402,412,433`） |
| `promptBudget` | ✅ 生产在用（`App.vue:257,290,293` → `prompt.ts:80-81,152-153`） |
| `extractorMode` | ⚠️ 只被 `settings.ts:44` 读，所在 `resolveExtractorMode` **全仓零调用** |
| `billingMode` | ⚠️ 同上（`settings.ts:45`） |
| `turnCallMode`／`historyWindow`／`intentFallback`／`cameoEgg`／`embedding` | ❌ 零读写 |

- `resolveExtractorMode`（`settings.ts:43-46`）全仓唯一匹配就是定义处
- UI 可操作项仅 baseUrl/model/apiKey/保存/读模型列表/`includeUsage`（**后者是组件本地 ref，非 Settings 字段**）；`promptBudget` 自身也无控件

### 严重性所在：断言的账目挂空

- `REBUILD.md:3098` 把 `LL-14 调用模式`标成 **「生效」**；`:3498` 的 `S-04` 承诺「输出 = 各链路读取的配置」
- `assertions.json:161` `LLM-8`（三调用模式计数）、`:681` `BIL-4`（切换即时生效），另有 `BIL-5`、`SAV-8`
- 全仓 grep：`LLM-8`／`BIL-4`／`BIL-5`／`SAV-8` **只出现在 `baseline/assertions.json` 声明里**，无任何测试或 `scripts/*.mjs` 实现（`scripts/mut-check.mjs` 未覆盖）

⇒ 这是**账目上挂着不存在实现**，比"待接线"重一档。

---

## 九、P1-6 详情：R3 命令零接线

- 独立实现确存在：`scout.ts:26 scoutCommand`（产 `intelPost`）、`occupation.ts:29 occupationCommand`（产 `claimTerritory`）
- **全仓调用点只有测试**：`tests/unit/engine/r3-commands.spec.ts:4-5,56,63,70,78,91,104,115,121,140`
- `src/App.vue:14` 只 import `{ startGame, travel }`；`gameCommands/index.ts` **未再导出** scout/occupation
- `src/gameCommands/index.ts:35-37` 的 `runCommand` 也 `return compileCommand(input, state)`（非分派），且在 `src/` 内零调用者
- ⇒ 模型发 `Scout` 只会走 `turnLoop` 失败；`Occupation` 更早被 `authorize.ts:56-58` 提议门拒掉
- 连带：`engine/adjacency.ts` 的 `buildAdjacency` 只被这两个死文件 import ⇒ 传递不可达
- **与批次卡矛盾**：`rebuild-v2.0/src/51-build-rings.md:82` 写 `R3 政治环 ｜ 已验收（2026-09-17）`，`:92` R3-3 即 Occupation/Scout

---

## 十、P1-7/P1-8：死数据与内容缺口

### 四表零消费者（生产侧只读 `L0-09`）

- `engine/factions.ts:183` 与 `engine/history.ts:25` 是**全 `src/` 内唯一两处** `baseTables()` 调用，都只取 `'L0-09'`
- ⇒ `L0-03 talents`(15)、`L0-07 business`(8)、`L0-10 toponyms`(13)、`L0-11 prologue`(5) 在生产代码中**零读取**
- 序章无任何渲染路径：`App.vue:207` 是硬编码文案「序章 · 盖印开局（免 API 模式，零 LLM 调用）」
- `stores/meta.ts` 全仓零引用（`readMeta`/`writeMetaEntries` 从未被调用）⇒ `db.ts:30-31` 建了 `meta` object store 但永不写入 ⇒ **achievements/cameoRegistry/codex 永不落盘、成就无解锁**

### 内容量与契约锚

| 表 | 实测 | 契约目标 | 契约行号 |
|---|---|---|---|
| L0-05 transport | **21**（16+5 exit） | **20（含 5 exit）** → **超出 1 条** | `21-contract-data.md:93,116` |
| L0-08 timeline | 29 | 58 | `:96` |
| L0-10 toponyms | 13 | **311** | `:98` |
| L0-12 worldbook | 12 | 36 | `:100` |
| L0-15 events | 12 | 32 | `:103` |
| L0-16 situationTemplates | 8 | 19 | `:104` |

**更正审计**：transport 是 **21 > 20 超出**，方向与"五表均低于目标"相反，须单列。文档三处均写 20（`transport.ts:1` 头注、契约 `:93`、`:116`），数据实测 21；`pnpm gate` 全绿说明无任何检查断言 20。

### 补记（Lead 修问题 2 时新发现，审计未抓）

修「时代开局月」时改动了 L0-01 的数据形状（`EraSchema` 新增 `startMonth`），连带暴露两个此前无人知道的缺陷：

**补记-1｜`pnpm data:hash` 的写回分支是死代码 ⇒ 该命令**从未**成功写回过清单。**

- `package.json:26` `"data:hash": "node scripts/data-hash.mjs"`
- `scripts/data-hash.mjs:10-14` 只是 `execFileSync('pnpm', ['vitest','run','tests/data/hash-writer.test.ts'], { stdio:'inherit', shell:true })` —— **没有设置任何环境变量**
- 实现体 `tests/data/hash-writer.test.ts:14` 的写回分支条件是 `if (process.env.DATA_HASH_WRITE === '1')`
- 全仓 grep `DATA_HASH_WRITE`：**除该测试文件外零命中** ⇒ 该变量无人设置 ⇒ **写回分支永不可达**
- 实测：`pnpm data:hash` → `tests/data/hash-writer.test.ts` **1 failed**（`:24 expect(onDisk).toEqual(manifest)` 不符）→ 脚本 `:16` 打印「[data:hash] 写回失败」→ `exit 1`
- 唯一能真正落盘的路径是同文件 `:19-22` 的**首次生成兜底**（文件不存在时写盘），以及 `DATA_HASH_WRITE=1 pnpm vitest run …` 手动调用
- 后果：`D-03` 不变量 3 声称「生成 hash 的唯一合法途径是 `pnpm data:hash`，手填 hash 一律视为无效」（`REBUILD.md:1943`），但**该途径实际不可用**；`vicissitudes/src/data/contentPacks.json` 自 `3ec02ea`（SK-06）起**只有过一次提交、从未被该命令更新**
- 本次已用 `DATA_HASH_WRITE=1 pnpm vitest run tests/data/hash-writer.test.ts` 正确写回（L0-01 hash `11d6b7e4…` → `1d5496eb…`，其余 15 表 hash 不变）。**已修（2026-09-23）**：`scripts/data-hash.mjs:10-14` 的 `execFileSync` 补 `env: { ...process.env, DATA_HASH_WRITE: '1' }` ⇒ `pnpm data:hash` 现 exit 0，写回分支可达（见 §十四 第 7 项）。

**补记-2｜L0 数据文件只许 import `dataSchemas`（LAYER-007），别顺手 import L1 的 calendar。**

- 我最初的实现让 `src/data/eras.ts` import `src/validation/calendar.ts` 的 `monthIndexFrom`/`dateFromMonthIndex` 来做月份零填充 ⇒ `pnpm lint` 直接红：
  `4:52 error Unexpected path "../validation/calendar" imported in restricted zone. L-01 单向依赖（§十六）：src/data/eras.ts（L0）不得 import src/validation/calendar.ts（L1）——数据文件仅可 import dataSchemas（LAYER-007）  import-x/no-restricted-paths`
- ⇒ **L0 是个比"层级"更窄的口子**：同层 L1 的其他模块也不能引（`dataSchemas` 是唯一豁免）。两个月的零填充不值得为它扩 `LAYER_EXEMPTS`，就地成串即可。
- 这是**未被任何文档显式写出**的约束（只在 eslint 规则里），修 L0 前必看 `eslint.config.js` 的 `LAYER_EXEMPTS`。

---

## 十一、P2 详情

### layer-graph 26 条重复边仍 PASS

- 工作树 `baseline/layer-graph.json`：**286 条边，去重键 260，冗余 26**（22 个 ×2，加 `gameCommands/index.ts->validation/tree.ts` ×3、`orchestration/world.ts->validation/tree.ts` ×3）
- HEAD 版为 **278 / 252** ⇒ 快照已被重写且未提交
- 机制：`graph-check.mjs:110-113` 用 `Set(edges.map(key))` 求差 ⇒ **重复键对比较不可见**；`:127` 打印未去重的 `edges.length`（本次 291）
- ⇒ 这项一致性检查的「边数」指标本身不可信（文档 283 / 快照 286 / 程序 291）

### 计数过时

| 项 | 声称 | 实测 |
|---|---|---|
| `pnpm test` | 468 | **45 files / 524 tests**，exit 0 |
| `gate:static` | 21 | **21 项全绿**（未变） |
| `gate:graph` | 283 | **291 条边** |
| `gate:mut` | 8/8 | **8/8**（一致） |
| 账本 | 187 | 工作树 **192 / 16 组**；HEAD 187 |

出处：`REBUILD.md:5952`（= `src/40-appendix.md:66`）与 HEAD commit `a015ae8` message。
另注：`package.json:30` 的 `gate` **不含** `gate:graph`/`gate:mut`（`:28`/`:29`）。

### HANDOFF 过时（更正审计一处误判）

- **属实**：`:13`「代码仓还不存在，需要由你新建」；`:14`「没有现成可跑的 demo」；`:15`「没有 CI 配置」；`:91` 的 `pnpm gate` 漏了 `gate:static`
- **不构成过时**：`:81`「那 10 组（SKL/ARC/LLM/MEM/EVT/ECO/BIL/DAT/NUM/SAV）是历史账目」—— 账本 16 组 = v1.0 承继 10 组 + v2.0 新组 6 个 + 并入既有 3 组，`:81` 说的正是 v1.0 那 10 组，措辞准确。审计据此判"过时"是**不同口径混用**

### 部署与构建

- `.github` 不存在、`.git ls-files` 命中 0 ⇒ **无 CI**（蓝图评审 F2 唯一开放项）
- 无 `wrangler.toml/json/jsonc`、无 `.wrangler/`；`package.json:31` deploy = `pnpm build && node scripts/check-static-deploy.mjs --built && wrangler pages deploy dist` ⇒ **脚本存在 ≠ 已执行**
- `loader.ts:27-29` 注释称「Vite 生产构建经 polyfill（见 `vite.config optimizeDeps`）」，但 `vite.config.ts`（17 行）只有 `plugins/resolve/build`，全仓 grep `polyfill|optimizeDeps` **零命中** ⇒ 悬空注释
- `loader.ts:6 import { createHash } from 'node:crypto'` 在浏览器侧被外置，构建**只告警不失败**
- `contentPacks.json` 运行时无消费者（全仓引用仅 `hash-writer.test.ts:7,9`）—— 真正"无接线"的是这个清单文件，而**不是** `tableHash`（后者是 `pnpm data:hash` → `scripts/data-hash.mjs:10` 的实际执行体）

### git 卫生（快照）

- `git status --porcelain -uall`：**11 modified + 11 untracked**
- modified：`baseline/assertions.json`、`baseline/layer-graph.json`、`docs/acceptance-vs01.md`、`src/App.vue`、`src/engine/events.ts`、`src/llm/prompt.ts`、`src/llm/turnLoop.ts`、`src/stores/saveSchema.ts`、`src/turn/monthRunner.ts`、`tests/unit/llm/prompt.test.ts`、`tests/unit/llm/turn-loop.test.ts`
- untracked：`.gitattributes`、`docs/acceptance-vs02.md`、`docs/browser-direct-provider-research.md`、`docs/evidence/README.md`、`docs/evidence/l3-real-12turns-postfix.json`、`docs/evidence/l3-real-12turns-prefix-2026-09-22.json`、`src/turn/dayClose.ts`、`src/turn/monthClose.ts`、`tests/unit/engine/promise-due.spec.ts`、`tests/unit/turn/dayClose.test.ts`、`tests/unit/turn/monthClose.test.ts`
- `origin/main..HEAD` = **1**（未推）；`.gitattributes` 本身处于**未跟踪**状态 ⇒ G-8「逐字节同源」这道门当前靠未入库的文件撑着
- **更正审计**：untracked 实为 **11**（非 8）；`pages.dev` 命中 **2** 处（非 1，其一为已跟踪的 `tests/unit/archived-proxy/origin.test.ts:9`）

### 账本 `assertions-v2.json`

**属实，但需两点澄清**：它是**持久的人写权威源文件**（只登记 v2.0 新增，非一次性缓冲），位于**文档仓**；`--merge` 的固定输入之一（`tools/ledger.mjs:35-36`）。代码仓只需按字节同步 `assertions.json`，**不含** `assertions-v2.json` —— "代码仓里找不到"是设计正确，不是缺失。
实测：`assertions-v2.json` = 9 组 107 条（TEC5 MOB6 LAYER4 DAT22 merge MOD7 BUS7 LLM33 merge SAV14 merge UI9）；两份 `assertions.json` SHA256 相同 = `780AE22772D216EEC19E56DBAD4A7C5F762B5251F49B6C15B6EAB720F5E566D8`。

---

## 十二、`activeController` 误用（更正审计结论"夸大"）

- `validation/tree.ts:419-429` `activeController(tree: Pick<Tree,'_authority'>, date)` —— **无 city/polity 参数**，忽略 `claim.polityId`，返回区间内**最后一条** claim
- `engine/fiscal.ts:48-50`：
  ```ts
  const controller = activeController(tree, iso)
  const stillOurs = controller === PLAYER_CONTROLLER || f.taxBase > 0 // 骨架：账在即续
  if (!stillOurs) continue // 易手城自动出账（军费停付 —— 撤离的财政面）
  ```
  在**按城市循环内**误用与城市无关的判定
- `engine/factions.ts:90-92`：`const ctrl = activeController(tree, iso); void ctrl` —— 冗余，真实判定走 `:92 controllerForPolity`（`:175-179` 按 polityId 过滤），**factions 侧无缺陷**

### 但"R3 通电即错"不成立

- **反证 A**：R3 命令只发 `claimTerritory`、**不播种 `fiscal.cities`**；`tree.ts:367 fiscal: { cities: {} }`，唯一写者是 `fiscal.ts:75 fiscalPost` 的 `next`（由 `current` 派生，闭环保空）
- **反证 B**：一旦某城入账，`fiscal.ts:55` 会写 `taxBase = f.taxBase > 0 ? f.taxBase : city.dims.economy * 2`（economy 为正）⇒ 次月起 `taxBase > 0` 恒真 ⇒ `stillOurs` 恒 true ⇒ `:50 continue` **永不执行**

⇒ 准确表述：`fiscal.ts:48` 确属**真实潜在缺陷**，但当前**不可达**，且即使播种也被恒定短路掩盖；真实后果是**「易手城自动出账」成为死分支**，而非"立即可见的算错账"。

---

## 十三、与 Lead 本轮已修工作项的关系

本轮（VS-01）已修复 **P1-1（契约缺口）** 与 **compile guard**，二者均与上述骨架期问题正交：

- **契约缺口已修**：`src/llm/prompt.ts` 的 `SEG_STYLE` 补齐载荷 JSON 语法 ⇒ 真实 L3 复测 `blocksApplied` **0 → 12**、有叙事回合 **2/12 → 12/12**、bad-block **0**。静态头 `headHash` 由 `ac768f48` 变为 **`404e2aaf`**
- **compile guard 已修**：`src/llm/turnLoop.ts:121-133` 给 `compile(effects)` 加 try/catch（与 `TurnRunner.ts:125-129` 同语义）。**它与 P1-1 正交** —— `compileCommand` 的异常在更早的逐块 `:69-75` 就被吞掉，永远到不了 `:125`

**关键提醒**：这个 guard 的存在让"命令集 5/6 失败"看起来像已被妥善降级，实际上降级发生在别处、且 detail 玩家不可见 —— 这是最容易误读的一处。

---

## 十四、优先级建议（含执行状态）

1. ✅ **已修（2026-09-23）：面板 `v-for` 缺 `()`** —— 7 处补 `()`，另 `MemoryPanel` 需写 `book().items`（见 §十五）。同时把 5 个写死空值的 selector 接上真实数据源。新增 `tests/unit/ui/panels-render.test.ts`（8 项）
2. ✅ **已修（2026-09-23）：时代开局日期** —— `EraSchema` 新增 `startMonth`（1-12，**必填**，不设 default）；五时代各定开局月（见 §十五）；新增 `data/eras.ts` 的 `eraStartDate`/`eraStartDateById`；`App.vue:42`/`:203` 两处硬编码 `'1921-07'` 移除；开局菜单改为显示各时代开局日（`OpeningDossier.vue` 的 `.vic-opening__start`，带 `data-start-date`）。新增 `tests/unit/data/era-start.test.ts`（9 项）＋ 浏览器冒烟新增五时代开局日断言（见 §十五 15.3）
3. ⏸ **占领引导死锁** —— 用户明确「玩家开局不一定控制城，要看玩家开局设定如何选择」⇒ **本轮不动 `occupation.ts` 入口**，待开局设定（身份/城市/是否给初始控制城）拍板后再裁
4. **裁 VS-02 前置豁免 + 补 `51-build-rings.md:164` 状态行**（文档落后一整批）
5. **commit**（现 13 modified + 14 untracked，两天新产出全部只存在于本机）
6. ✅ **已修（2026-09-23）：`App.vue:278` 的 `void travel('1921-08', …)`** —— 已连同 `travel` import 一并移除；该行既丢弃返回值、又写死日期，而此行下方的 `advanceTurn()` 才是真正的推进入口
7. ✅ **已修（2026-09-23）：`scripts/data-hash.mjs` 的写回分支**（见 §十 补记-1）—— 补 `env: { ...process.env, DATA_HASH_WRITE: '1' }`，`pnpm data:hash` 现 exit 0 且真的写回清单
8. **CI 归属（F2）** / 内容期拍板 / 存档导出 / 性能预算 / 发布策略

### 本轮（2026-09-23）实际落盘的改动清单

代码仓工作树（**未 commit**）：

| 文件 | 改动 |
|---|---|
| `src/components/panels/GoalsPanel.vue` | `:22` `v-for="g in goals"` → `goals()` |
| `src/components/panels/HistoryPanel.vue` | `:22` → `entries()` |
| `src/components/panels/IntelPanel.vue` | `:22` → `observations()` |
| `src/components/panels/PressPanel.vue` | `:22` → `papers()` |
| `src/components/panels/RelationsPanel.vue` | `:22` → `relations()` |
| `src/components/panels/WorldPanel.vue` | `:22` → `situations()` |
| `src/components/panels/MemoryPanel.vue` | `:23` → **`book().items`**（注意：不是 `book()`） |
| `src/stores/selectors/index.ts` | `goalsList`/`memoryBook`/`relationsList`/`timelineView` 由写死空值改为真实数据源；`openingEras` 增 `startMonth`/`startDate` |
| `src/validation/dataSchemas.ts` | `EraSchema` 新增**必填** `startMonth: z.number().int().min(1).max(12)` |
| `src/data/eras.ts` | 五条各补史实 `startMonth`；新增导出 `eraStartDate` / `eraStartDateById` |
| `src/App.vue` | `:42`、`:203` 两处 `'1921-07'` → `eraStartDateById(eraId)`；`:278` 的 `void travel('1921-08', …)` 连同 `travel` import 一并删除（死代码） |
| `src/components/OpeningDossier.vue` | 时代按钮内新增 `.vic-opening__start` 显示「开局 YYYY-MM」（带 `data-start-date`） |
| `scripts/browser-smoke.mjs` | 首次装载新增五时代开局日断言（读 `.vic-opening__start` 的 `data-start-date`，5 条齐且互不相同），结果进报告 `eraStartDates` |
| `scripts/data-hash.mjs` | `execFileSync` 补 `env: { ...process.env, DATA_HASH_WRITE: '1' }`（原先写回分支永不可达） |
| `src/data/contentPacks.json` | L0-01 hash 重算（`11d6b7e4…` → `1d5496eb…`） |
| `tests/unit/ui/panels-render.test.ts` | **新增**，8 项（真实面板 + 真实 selector + 真实 tree 种子） |
| `tests/unit/data/era-start.test.ts` | **新增**，9 项 |

门禁：`pnpm gate` → **47 files / 541 tests ＋ test:data 29 ＋ gate:static 21 全绿，exit 0**；`node tools/gate.mjs`（文档仓）五步 PASS；`pnpm test:browser-smoke` → `{"status":"pass", …, "eraStartDates":[…5 条…], "months":12, "restoredDate":"1922-07", "generationCalls":0}`。

---

## 十五、本轮两个需要记住的技术细节

### 15.1 面板 `v-for` 有两个层次，别只补 `()`

- **第一层**：绑的是**函数引用** `v-for="g in goals"` ⇒ 补 `()` 即可（7 个面板属此类）。
- **第二层**：selector 返回**对象**时，绑 `book()` 得到的是那个对象，而 **Vue 的 `renderList` 对普通对象枚举的是「值」不是「对象本身」** —— 于是 `m` 变成字符串 `"m1"`/`"m2"`，`m.title` 为 `undefined`，DOM 渲染出**空的 `<li></li>`**（**不是不渲染**，这点最能骗过肉眼）。
  - 正确写法：`v-for="m in book().items"`（`MemoryPanel.vue:23`）。
  - 最快诊断法：模板里临时插 `{{ Object.keys(m).join(',') }}`，得到 `0,1` 就证明 `m` 是数组/索引对象而非实体对象。
- 8 项回归测试落在 `tests/unit/ui/panels-render.test.ts`（首行必须 `// @vitest-environment happy-dom`，因为 `vitest.config.ts` 的 `environmentMatchGlobs` 只覆盖 `tests/unit/stores/**`）。

### 15.2 五时代开局月的取值与依据（Lead 代数值侧拟定）

| 时代 | 年份区间 | startMonth | 开局日 | 依据 |
|---|---|---|---|---|
| `era-warlord` 军阀混战 | 1921–1927 | **7** | `1921-07` | 与时间线 `tl-192107-founding`（1921-07-01）对齐，且**保持既有硬编码开局月不变**（零行为回归） |
| `era-nanjing` 宁汉对峙 | 1928–1936 | **1** | `1928-01` | 定都南京后之岁首 |
| `era-resistance` 全面抗战 | 1937–1944 | **7** | `1937-07` | 七七事变 / 全面抗战爆发月 |
| `era-civilwar` 内战风云 | 1945–1948 | **1** | `1945-01` | 1945-08 日本投降，开局处抗战末段，年内即可驶入胜利与内战转折 |
| `era-collapse` 大厦将倾 | 1949–1949 | **1** | `1949-01` | 金圆券崩溃（1948-08-19 起）与三大战役收尾之年，年内驶向改旗易帜 |

蓝图为「各时代开局日不同」背书但**未指定值**：`REBUILD.md:326`（从哪年哪月开始推演）、`:367` 第 4 条（时代表与时间线不得漂移）、`:5857`（五时代开局日各推 12 月）。`EraSchema` 的 `startMonth` 设为**必填**（不设 default）——缺字段即解析失败，符合四条总原则第 2 条「宁可 unassigned 报错，不猜测」。

**与 `REBUILD.md:331`「era 字段运行时只读、运行时没有任何逻辑按 era 字段分支」的一致性说明**：`startMonth` 仅在**开局命令**中被读一次用于定日（开局流程一次性写入，正合 `:331` 的「开局流程一次性写入」），运行时行为仍一律由 `world.date` 推导。既有 `factions.ts:98`、`market.ts:105` 两处按 era 分支是**另一笔已登记的偏差**（见 §三），本轮未动。

**遗留**：无。原 `App.vue:278` 的 `void travel('1921-08', tree.value)` 已删除（见 §十四 第 6 项）。

### 15.3 浏览器冒烟为什么**不能**做「点五个时代各 reload 一次」

- `scripts/browser-smoke.mjs` 用 `--headless=new --dump-dom --virtual-time-budget=N` 抓最终 DOM。**每次 `location.reload()` 都重新消耗虚拟时间预算**：第 1 次装载能跑完，第 2 次能到点击，**第 3 次只剩初始化就被 `--dump-dom` 截断**；把预算从 `20000` 提到 `1800000`（30 分钟）也只多推进一步 ⇒ **多次 reload 与该标志不兼容**，不是预算调大能解决的。
- 另一个坑：点完时代会立刻落盘，下次装载 `App.vue` 的 `restore()` 直接把玩家送回游戏内 ⇒ 开局菜单（`.vic-opening__era`）恒为 0 个。若真要多时代循环，必须**在装载时先 `indexedDB.deleteDatabase('vicissitudes', 999)`**（用高于 `DB_VERSION=1` 的版本号触发 `src/stores/db.ts:44` 的 `onversionchange` 自动 close），否则删除被既有连接阻塞、reload 后读回旧档。
- ⇒ 采用**单次装载内可完成**的口径：开局菜单上直接显示五时代开局日，浏览器腿只断言「5 条齐全且互不相同」；各时代点击后的实际开局日由 `tests/unit/data/era-start.test.ts` 在 Node 侧逐条覆盖（`eraStartDateById` 是 `App.vue` 点击路径上调用的同一函数）。
- **属性位置坑**：`data-start-date` 挂在按钮**内部的 `span.vic-opening__start`** 上，`button.vic-opening__era` 本身没有该属性。断言必须 `eraButton.querySelector('.vic-opening__start').getAttribute('data-start-date')`；直接读按钮会得到 5 个空串，且失败现象与「属性没渲染」一模一样（按钮文字仍正常显示「开局 1921-07」）。用 happy-dom + `createApp` 挂 `OpeningDossier` 打印 `outerHTML` 是定位这处最快的手段（仓内无 `@vue/test-utils`，`mount` 不可用）。
- 调试期的诊断输出（dump 长度／标题／进度标记／早期错误／body 样本）保留在 no-marker 分支，便于下次 harness 出问题时一眼定位。

### 15.4 开局设定（2026-09-23 落地）：身份进树、开局城、控城口径

用户口径（m02000）：「先只定开局城市与身份，控制城与否由设定决定」⇒ 不动 `occupation.ts` 入口，改开局链路。

**改动（代码仓，未 commit）**

| 文件 | 改动 |
| --- | --- |
| `src/validation/tree.ts` | 新增 `IdentityRefSchema` `{id,kind,startCity}`、`OpeningSetupSchema` `{identity,startMoney,startsWithControl}`；`TreeSchema` 增 `identity: …nullable().default(null)`；`initialTree(eraId,date,opening)` 写入身份、`career.money = opening.startMoney`、按 `startsWithControl` 同批落 claim ＋ 控城账；新增 `activeControllerForCity(tree,cityId,date)` |
| `src/data/identities.ts` `src/validation/dataSchemas.ts` | 40 行各加 `startsWithControl: false`（schema `.default(false)`） |
| `src/gameCommands/index.ts` | 新增 `resolveOpeningSetup`/`StartGameError`；`startGame` 解析开局设定后传入 `initialTree` |
| `src/components/OpeningDossier.vue` | 两步开局：选时代 → 出该时代 8 个出身（显示开局城/开局现银/是否控城）→ 选出身 → 盖印开局；`emit('start', eraId, identityId)` |
| `src/App.vue` | `onStart(eraId, identityId)`；存档 `identityId` 改从树内 `identity.id` 取（原写死 `'student'`） |
| `src/stores/saveSchema.ts` | `meta.identityId` 放宽为可选（旧档不因缺字段拒载） |
| `src/engine/fiscal.ts` `src/gameCommands/occupation.ts` | 改用城级 `activeControllerForCity`（见下） |
| `src/data/identities.ts` 变化连带 | `contentPacks.json` L0-02 hash 更新（`pnpm data:hash`） |
| `baseline/layer-graph.json` | 人工登记 6 条合法新边（+24 行、0 删除）：`App.vue→data/eras.ts`、`App.vue→data/identities.ts`、`components/OpeningDossier.vue→gameCommands/index.ts`、`gameCommands/index.ts→data/identities.ts`、`stores/selectors/index.ts→data/timeline.ts`、`validation/tree.ts→data/cities.ts` |

**开局设定现在决定什么**

- **身份进树**：`identity {id, kind, startCity}` 与 `era` 同性质 —— `startGame` 一次写入、此后只读。刷新恢复后出身不再丢（原先只存 `SaveRecord.meta.identityId` 且写死 `'student'`）。
- **开局现银**：`career.money = L0-02 的 startMoney`（5/5/50/10/15/8/20/200），命令层不再有 money 常量。
- **开局城**：`identity.startCity`（L0-04 城市 id），UI 显示中文名。
- **控城与否**：`startsWithControl=true` 时同批落两张账 —— claim（`polityId` 取该城 `provinceId`、`controller:'player'`、`interval` 到 `1950-01-01`）与 `fiscal.cities` 一行；未知 `startCity` 则两账都不落（不留半截）。
- **开局参数不成立即报错**：身份 id 不存在、或身份不属于所选时代 → `StartGameError`（`kind` 词如 `'student'` 不再被接受）。

**顺带修掉的真实缺陷（审计未抓）**：`src/engine/fiscal.ts:48` 原先用非城级的 `activeController`（`src/validation/tree.ts:419`，按日期取**最后一条** claim）做**逐城**控制权复核；而 claim 的 `polityId` 是**省** id（`shanghai`/`nanjing` 同为 `vic.jiangsu`），跨省时会把别省控制者算到本城 —— 是**错账**而非空账。已在 L1 新增城级 `activeControllerForCity` 并让 `fiscal.ts` 与 `occupation.ts`（原先自带一份副本）共用，回归测试 `tests/unit/gameCommands/opening-setup.test.ts` 锁住。

**关键现状（需数值侧拍板）**：40 行身份表**全部** `startsWithControl: false` ⇒ 玩家开局**一律不控城**。这是严格按「不动 occupation 入口」执行的结果，机制已就位并有测试；若日后要让某些出身（如 `soldier`/`industrialist`）开局即控城，改数据表一行即可。

**占领死锁的准确现状**（`src/gameCommands/occupation.ts`）：三条前置里 ①兵力 `career.forces ≥100` 与 ③情报 ≥2 级仍然卡死 —— 玩家兵力没有写入路径、`scoutCommand`（`src/gameCommands/scout.ts:26`）在 src 内零调用 ⇒ `intelligenceObservations` 恒空，`occupation.ts` 即便邻接通了也仍返回 `no-intel`。故本项**只解开前置②的因（有城才有邻接），未解开①②③整链**；战事开启需要「兵力+控城设定落数据 + Scout 接 UI」。

### 15.5 开局设定：独立核验发现的缺陷与处理（2026-09-23）

独立核验人（teammate `verify-opening`，只读 + 临时用例）在本轮改动上找出 3 处**潜伏**缺陷（40 行 `startsWithControl` 全 false，故当时不可达），已处理如下：

| 缺陷 | 核验证据 | 处理 |
| --- | --- | --- |
| **P0 开局控城首月即被清账、此后永不恢复 ⇒ 控城终身零收益** | 注册序 `src/engine/registry.ts:32-33` fiscal(#7) 早于 worldtick(#8) ⇒ 首月 map 空 ⇒ `fiscal.ts:53-54` 原 `continue` 让该城从 `next` 消失 ⇒ `compiler.ts` 的 `fiscalPost` 是**全量 replace** ⇒ 账被删；实测 `tickWorld` 一月后 `map=14 城 / fiscal.cities={}` | **已修**：未播种月改为**原样留账**（`src/engine/fiscal.ts`），待 map 播种后按公式接管；回归 `tests/unit/gameCommands/opening-setup.test.ts` 的 LAUNCH-04 两例（首月留账 + 第二月出账） |
| **P1 开局 claim 与史实 claim 同省双写，追加写的史实把玩家压过** | `history.ts` 把 overlay claim **append 到末尾**，而控制权查询取「最后一条匹配」⇒ 实测 1935-12 开局控上海 → `1936-06` 控制者变 `guomin`；受影响省仅 `vic.jiangsu`/`vic.guangdong` | **已修**：`activeControllerForCity` 改为**玩家 claim 优先**（同省先扫 player，再回落史实）；回归用例锁定，并在函数注释写明「玩家控制只应由明确事件让位」 |
| **P2 `stillOurs` 兜底掩盖控制权变更** | `src/engine/fiscal.ts:50` `stillOurs = controller === 'player' \|\| f.taxBase > 0` ⇒ 首月写入 >0 后永真，注释「易手城自动出账」不成立；`git show HEAD` 该行原文相同 ⇒ **非本次引入** | **未修**（HEAD 既有）：已登记在案，改法＝逐月复核控制者（`taxBase` 只作基准不作续账条件） |

**核验确认正确/合规的点**：`src/validation/tree.ts → src/data/cities.ts` 合规（`REBUILD.md` 的 L-01 分层表 L1 行明确「允许 import L0」，且 `import-x/no-cycle` 绿）；身份域只读性成立（src 内零 `/identity` 写点）；旧档 `identity` 缺域 `safeParse` 通过；浏览器冒烟 `opening` 字段确为 UI 实读（非硬编码）；`activeControllerForCity` 的必要性有最小反例（旧口径跨省取最后一条 ⇒ 上海账被删）。

**核验同时纠正/改进的 4 处**：
1. `OpeningDossier.vue` 的 `start()` 增加 `resolveOpeningSetup` 复核（同一 tick 内换时代后点旧按钮会带「新时代+旧出身」）；`App.vue:onStart` 增加 `catch` 兜底（原先会成未捕获 rejection）。
2. `src/parser/sanitize.ts` 的 `M03_REGISTRY` 补登 `identity`（engine-exclusive）；`src/engine/registry.ts` 的 `M03_WRITER_CHAINS` 链①补第 4 位 `startGame`（登记而非「三写者」失准）。
3. `src/stores/saveSchema.ts` 的 `meta.identityId` **撤回**放宽（恢复 `min(1)`）：真实旧档都有该字段，需要兜底的是 `App.saveIdentityId`（树内无 identity 时取该时代身份表首行），核验指出原放宽理由失准。
4. 修正两处与 L-01 相反的注释：`src/validation/tree.ts` 头部（自称「validation→data 一律拦截」并不成立）与 `eslint.config.js:52`（LAYER-007 管的是 data→validation 方向）。

**核验留下的未处理项**：`sanitize.ts:3-4` 自称「登记表 = 域键全集」仍不严谨（`tests/unit/turn/pipeline.test.ts:100` 只断言投影三键，不校验树域完备性）；`safeParseTree`（`__proto__` 防护）在 src 内**零调用**，真实载入路径走 `SaveRecordSchema.safeParse` —— 两条都属既有缺口，不在本项范围。

---

## 附录：本次核验对审计原文的更正清单

1. `_l3-measure.spec.ts` 被列为「并发改动待决定」—— **是 Lead 按门禁要求删除的临时工装**
2. 「`.vue` 零测试导入、共 16 个」—— **17 个**；`App.vue` 被 2 个测试 import、`OpeningDossier.vue` 被 2 处 `vi.mock`；零引用的是 15 个
3. 「面板恒空 6 个」—— **9 个恒空 + 1 个挂起**；且根因是 `v-for` 缺 `()` ＋ `v-if="false"` ＋ selector 写死**三套叠加**
4. 「开局卡写实业家 200 银元」—— **不存在开局卡，也没有身份选择 UI**（当时确实如此；2026-09-23 已补上两步开局与身份选择，见 §15.4）
5. 「`compile` 失败玩家看不到」—— 看到**泛化计数**，且文案**归因错误**
6. 「`turnLoop.ts:75` 用 `continue`」—— 是 **`break`**
7. 「无人能产出 `claimTerritory`」—— **字面不成立**，有 3 个生产者
8. 「transport 低于目标」—— **21 > 20，超出**
9. 「`tableHash` 是死代码」—— 它是 `pnpm data:hash` 的执行体；真正无接线的是 `contentPacks.json`
10. 「`.vue` 测试盲区含 `App.vue`」—— **误**
11. 「`HANDOFF.md:81` 过时」—— **不同口径混用**，不构成过时
12. 「untracked 8 个」—— **11 个**；「`pages.dev` 唯一命中」—— **2 处**
13. 「`activeController` R3 通电即错」—— **夸大**，见 §十二
14. 「`political-1936` 4 组 9 条」—— **4 组对，条数 10**
15. 「`loader.ts:17` polyfill 注释」—— 实际在 **`:27-29`**
