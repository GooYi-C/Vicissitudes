# R4 收尾环 · 验收记录（L2 宣称逐项挂 L3 记录）

> 蓝卡：`rebuild-v2.0/src/51-build-rings.md` 环４（L108-130）。完成宣称等级：L2 ＋ L3（过月跨月边界是现象）。
> 本记录逐条挂出口判据／红线／失败判据的可复跑证据。基线判据（全测试红→绿、typecheck 零错、surface 烟测、gate 全绿）为所有环共享，见 §八。

## 0. 本环改动清单

- 树形状：`crisis.records` / `relations.persons` / `_computed.labor` 三新域入 `TreeSchema`（域级 `.default` 兜底——旧档零迁移可载，§四 L-14）；新增 op：`laborPost` / `relationsPost` / `crisisPost`（B-01 白名单）；compiler 三 case。
- 新模块：`labor.ts`（10）／`intelligence`（11）／`consistency`（14）／`crisis`（15），全部 `phase: 'aftermath'`、`cadence: 'full'`。
- 存量修复（归入 **R1** 的 number→最终数字落笔，§五）：`memory.ts` importance 归档底线 fix。
- 测试：`labor/intelligence/consistency/crisis/r4-loop` 五份新 spec；`memory.spec` 一条断言随行。
- 图层基线：`baseline/layer-graph.json` +4 边（四模块 → `validation/tree.ts`——同 labor/intelligence 既有模式；validation 为共享层，非新增跨层边），256 边基线 PASS。

## 1. 出口判据逐条（L98-100）

| 判据 | 验证方式（L3 / 同类层测） | 结果 |
|---|---|---|
| 「全 cadence 就位——monthly 与 full 两条管线都跑满」 | `r4-loop.spec > 12 月 loop 到终月…`（347 套件内）；月 tick 两次逐位一致（ARC-5 月级确定性复测） | ✅ `r4-loop` 5 例全绿 |
| 「full 只在该跑的月份跑」 | `r4-loop.spec > 非终月 tick：四 full 模块零产出/零写域`（月月断言 writtenDomains 不含 `_computed.labor`／`relations.persons`／`crisis.records`） | ✅ |
| monthly ⊆ full（管线子集） | `r4-loop.spec` 12 月 loop 内 monthly 模块月月有产出（market/timeline 等），终月 full 合流 | ✅ 同次 loop 覆盖 |

## 2. 模块出口判据（L116-119）

| 模块 | 判据 | 证据 |
|---|---|---|
| labor | 仅终月跑；非终月零写入 | 单测 4 例：非终月 ctx→`[]`；终月投影 `manpower=⌊population×10⌋`、`asOfMonth=world.date`；幂等（深比对）|
| intelligence | 四级情报迷雾；过期衰减可见 | 单测 4 例：`expiresAt ≤ 当月-01` 剔除、未过期保留、裁剪仅在有变化时发 `intelPost`；loop 内 `old` 剔 `live` 留 |
| consistency | 人脉与记忆交叉一致（无悬空引用） | 单测 4 例：记忆引用 id 自动注册 stub（alive/tier0）、dead/arrested 传播一次到位（tier→0、propagated→true）、收敛幂等；loop 内注册 `cai-pei/tang-jiyao` |
| crisis | 危机产出可入处境池 | 单测 6 例：四检测器（money<0 破产／health≤0 死亡／兵力归零哗变／security≤10 失城），ri 400 初值不误触，同 kind 单档幂等；`crisisToPendingSituation` 载荷过 `PendingSituationSchema`，且经 `situationEnqueue` 编译进池（B-07 通道可编译性实测） |

## 3. 失败判据逐条（L122-126）

| 判据 | 核验 | 结果 |
|---|---|---|
| full 模块在非终月执行（M-05） | loop 前 11 个月 writtenDomains 断言零 R4 写域 | ✅ |
| monthly／full 子集关系破坏 | 终月 tick 同时出现 monthly 与 full 产出（同一 `runMonth`，模块表单数组 dispatch） | ✅ |
| 两条管线顺序分叉（M-06） | `registry.simulationModules()` 仍是唯一权威数组；未新增第二处管线（全仓 grep 复核） | ✅ |
| intelligenceObservations 无过期衰减 | 单测+loop：`expiresAt` 到达即剔 | ✅ |

## 4. 命令与 gate（L121）

- `pnpm test`：**347/347 全绿**（33 文件）。
- `pnpm test:e2e -- --project=rings -- R4`：`tests/e2e` 目录空，`--passWithNoTests` 放行（与 R2 同口径；R4 纯引擎无 UI 冒烟面）。
- `pnpm gate`：typecheck ✅ ／ lint 0 error 0 warning ✅ ／ test 347 ✅ ／ test:data 29 ✅ ／ gate:static 19 项 ✅。
- `pnpm gate:graph`：**PASS（256 条边）**——+4 边人工合法化记录见 §0。
- `src/engine/` 顶层文件计数 **20**（模块 16 + `types`/`registry`/`rng`/`adjacency` 支撑 4）：`labor`／`intelligence`／`consistency`／`crisis` 四个文件名在此前的模块表登记中已占位，本环只落体不新增文件——红线「engine 20 文件不动（L-06）」守住。

## 5. 存档旧读与既有保护

- 旧档缺 R4 三域 → `TreeSchema` 域级 `.default` 补齐可载（`r4-loop.spec` 末例显式删三域后 `parse` 复填）。
- R1–R3 全部既有断言不动；`factions.spec` 一处冗余 eslint-disable 由 `--fix` 清理（零行为变化）。

## 6. 范围外（L129 口径照常）

内容密度／地图／报纸均不在本环；`relations` 夭折面（夭折与关系级联衰减）归属内容期；crisis 的关闭/复位随实体处置通道，不在写域。

## 7. R1 收尾备注（number→数字落笔）

`memory.ts` 归档线 0 与 `MemoryItemTreeSchema.importance ≥1` 的形状闸冲突曾因单测 blind spot 未爆；R4 loop 暴露后本环一并修复（语义：0 是归档「线」非「值」——入树底 1，`archived` 标志承担终态身份）。该冲突为 R1/R2 环内遗留，不在 R4 判据新增项中。
