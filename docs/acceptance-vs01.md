# VS-01 验收单 —— LLM 垂直切片（最小链）

**批次卡**：`rebuild-v2.0/src/51-build-rings.md` L149 起 · 拍板行 `src/40-appendix.md` L59
**完成判据**：本批门禁全绿 ＋ 四实测数字落格。当前：**门禁六项全绿（gate:=typecheck/test/lint/static/graph/mut）**；四数字待第一轮真实 key（本文档自带复测程序）。

---

## 1. 范围对账（九项）

| # | 项 | 状态 |
|---|---|---|
| 1 | `src/llm/errors.ts` — LL-19 统一分类（13 码封闭枚举；与 functions/ 同表两侧） | ✅ |
| 2 | `src/llm/prompt.ts` — LL-12 五段静态头 ＋ LL-13 三档预算裁剪 | ✅ |
| 3 | `src/llm/client.ts` — /api/chat SSE 消费 ＋ 错误分类 ＋ 重试纪律 ＋ LL-17 计数 | ✅ |
| 4 | `src/parser/propose.ts` — S-08/LL-07 提议钳制（整批丢弃语义） | ✅ |
| 5 | `src/llm/turnLoop.ts`（拍板B：合同原写 src/turn/，因 L-01 表上引禁忌迁此——**合同行待用户改正文**） | ✅ |
| 6 | `src/App.vue` ＋ `src/components/ChoiceInput.vue` 接线（内嵌最简设置块：upstream 三字段＋保存；LL-107 hook 集合） | ✅ |
| 7 | 单测三件套 `tests/unit/llm/{prompt,client,turn-loop}.test.ts` | ✅ |
| 8 | `tests/e2e/gates/gate3-months.spec.ts`（清偿 G-3：12 月骨架） | ✅ |
| 9 | 断言 LLM-31/32/33 同批（`rebuild-v2.0/baseline/assertions-v2.json` ＋ 仓内 `baseline/assertions.json` 同步） | ✅ |

**commit message 引用 VS-01**（单批提交；rebuild-v2.0 非 git 仓不改 git 面）。
**代码覆盖**：批准行「同一批账户过单测＋基准含真实 12 回合样本四数字」——前三者全落，真实 12 回合待 L3（钥匙/端点由用户提供，程序见 §4）。

## 2. 豁免与硬依赖台账（审计面）

| 项 | 内容 | 登记处 |
|---|---|---|
| LAYER-008 上线 | L6 llm 组合模块组（client/prompt/errors/turnLoop）同层组合豁免，2026-09-17 拍板B | eslint.config.js L-02 表 · scripts/graph-check.mjs 镜像 · scripts/static-checks.mjs 双向表 · 四件头注 `EXEMPT:LAYER-008` |
| LAYER-005 拓面 | parser 意图链接收 propose.ts（提议与意图同链） | 同上三处 ＋ 头注 `EXEMPT:LAYER-005` |
| layer-graph 22 边人工登记 | 详 `baseline/layer-graph.json`（App.vue→llm/*·stores/settings；llm 内部×2；prompt→data/validation×4；turnLoop→parser×4＋turn×3(L6→L4 下引·拍板B核心)＋validation×2；propose→validation×2） | graph-check 快照一致（282 边） |
| functions/api/chat.ts | 已有实现核收：SSRF 五条判决、SSE 直通无回写、错误结构 `{error:{code,message}}`、key 双屏蔽、超时重试表 —— 本批**原样接线**未改 | 合同 §二十 LL-10 / LLM-120 同批口径（既定实现，本批验配而非新建） |
| prompt.ts 去私联 | 阶段一次重构误引 stores/settings（L6→L7 逆向）——已绝源：PromptBudgetTier 本地同构声明 | static-checks/lint 全绿 |
| SAV-4 守门 | App.vue 用 null-ref ＋ loadSettings 回填，组件侧不引用 DEFAULT_SETTINGS 单点 | gate:static 19 项全绿 |

## 3. 验收判据逐行状态

| # | 判据 | 证据 | 状态 |
|---|---|---|---|
| V1 | 静态头跨回合逐字节稳定且哈希导出 | prompt.test：同设置两遍 hash 等值 / 异档 hash 异值 / fnv1a 导出 | ✅ |
| V2 | 静态头不含日期/回合号/存档 id | prompt.test 静态头断言（不含 `1921-07`＋无回合字段） | ✅ |
| V3 | memory 写入契约注入（≤3） | prompt.test 含「单轮最多 3 条」文案 | ✅ |
| V4 | SSE 逐帧拼接＋onDelta 全量 | client.test 帧级桩 | ✅ |
| V5 | 13 码分类穷尽＋代理码直通 | client.test（401/403/429/5xx/504/403-blocked/bad-body） | ✅ |
| V6 | 重试纪律（5xx≤1，其余零） | client.test 计数桩 | ✅ |
| V7 | 流中断已收块照常（不重试）＋partialText | client.test 流桩（jsdom Response 隐式流差异已绕开——显式帧游标） | ✅ |
| V8 | 自报 actor 剥离 | turn-loop.test（含侧边段被剥） | ✅ |
| V9 | 原子提交：合法链单次落数 | turn-loop.test（career.money=15＋sit-mp-入队＋world.date 未越步） | ✅ |
| V10 | 拒认整批回滚（giveTree 非法变种 → sameWorld 原树逐字节） | turn-loop.test bad-world 用例 | ✅ |
| V11 | metrics 四字段（遵循率/可用率口径） | turn-loop.test counts | ✅ |
| V12 | 锁单轮 ≤1 提议、第 2 块整批丢弃 | turn-loop.test double-propose 用例 | ✅ |
| V13 | queue 命中即重复（无 embedding 字符串规范化路径幂等） | turn-loop.test 幂等用例 | ✅ |
| V14 | 免 API 调用计数恒 0 | gate3：countRealCalls()=0 | ✅ |
| V15 | 12 月骨架：tickWorld 链＋存读档逐位往返 | gate3 e2e | ✅ |
| V16 | 六道 gate 全绿 | typecheck / test 376/376 / lint 0 error / static 19 项 / graph 282 边 / mut 5/5 | ✅ |
| V17 | **单回合成本** | mock 面四计数已落（V11）；真实 token 计费口径 **待 L3** | ⏳ |
| V18 | **静态头缓存命中率** | buildStaticHead 哈希稳定（V1）；真实缓存命中量 **待 L3** | ⏳ |
| V19 | **意图遵循率＋提议可用率** | mock 面 3/3 与 2/2 已验（V9/V13）；真实 12 回合均值 **待 L3** | ⏳ |

## 4. 实测程序（第一轮跑通后把数字落格——「实测才算数」）

**前置**：functions 侧起点（`pnpm deploy` 路径由用户择时；或 wrangler dev 本地页函数）。准备：玩家端设置页填 baseUrl/model/apiKey。

**步骤**（真实 key 12 回合，VS-01 L3）：
1. 浏览器打开应用 → 设置区填 API → 保存（localStorage 持久；全局不进存档外泄——SAV-14/S-04 两侧断言在）
2. 开新档（era-warlord 1921-07），依次 12 回合自由输入（多样化：行动/经济/社交各 4 句），逐回合观察 StoryView 流式叙事与「回合注记」行尾计数
3. 回后取数（浏览器 console，同进程）：
   - `import('./src/llm/client.ts').then(m => m.getCallStats())` → 提现 promptChars/completionChars 12 笔 → **单回合成本**（字符计费×服务商单价）
   - 每回合 prompt 静态头 hash：`import('./src/llm/prompt.ts').then(m=>m.buildStaticHead)` 复构对比 → **静态头缓存命中率 = 1−(hash 变化次数/12)**（注：promptBudget 不变时应为 100%）
   - 从 `runModelTurn` 的 metrics 合并 12 笔（建议 console 记账）→ **意图遵循率 = ΣblocksApplied/ΣblocksTotal**，**提议可用率 = ΣproposeUsable/ΣproposeSeen**
4. 四数字回填 §3.2 样例口径（≥ 姆本上下文计费确认）＋ 本表 V17–V19 置 ✅ ＋ L3 结论一句话

## 5. 已知缺口＋下一批提醒（不在本批范围——硬纪律「顺手做了按事故处理」）

- LL-15 extractor/memory 补写 · LL-18 embedding 召回 · LL-16 意图识别器 · split 模式 · prompt 文案质感 —— 范围外
- functions smoke-proxy 终验（L3 时随测）
- 合同正文两处待用户改：**§二十 S-07 落位行**（`src/turn/turnLoop.ts` → `src/llm/turnLoop.ts`）＋ **§20 LL-102 ledger 行同义改正**（2026-09-17 拍板B）
- DebugPanel 可视化计数（建议至 VS-02；当前 App.vue 设置区计数行＋回合注记行尾承载可观测最小面）

## 6. 目录核对（提交前）

- 侦察临时件 `_ok.txt/_pl.log/_a.txt/_b.txt/_c.txt/_l10.txt/_g.txt` 已清（`git status` 应只见本批十组文件＋baseline 两项）
- rebuild-v2.0 未 git；本省略未达者勿 commit 短材料到本批之外
