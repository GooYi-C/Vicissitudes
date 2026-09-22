# VS-01 验收单 —— LLM 垂直切片（最小链）

**批次卡**：`rebuild-v2.0/src/51-build-rings.md` §二十九.7 · 拍板记录 `rebuild-v2.0/src/40-appendix.md`（2026-09-17／2026-09-18）
**完成判据**：本批门禁全绿 ＋ 四实测数字落格。当前：2026-09-18 接手基线已实跑通过（376 tests／static 20／graph 282／mut 5/5）；后续已完成纯浏览器直连及保存屏障修正：468 tests、static21、graph283、正常对照+7注入、构建/静态产物门和隔离Chromium免API冒烟通过；当前证据见 `vicissitudes/docs/mcp-browser-direct.md`。**V17–V19 三数字已于 2026-09-22 在 Node 侧对真实服务商实测并落格（见 §4.1.7）；浏览器腿仍受阻（§4.2），故 VS-01 保持施工中，不宣称 L3 完成。**

---

## 1. 范围对账（九项）

| # | 项 | 状态 |
|---|---|---|
| 1 | `src/llm/errors.ts` — LL-19 统一分类（15 码封闭枚举；新增 network-or-cors 合并提示，禁止自动代理回退） | ✅ |
| 2 | `src/llm/prompt.ts` — LL-12 五段静态头 ＋ LL-13 三档预算裁剪 | ✅ |
| 3 | `src/llm/client.ts` — 玩家浏览器直连 SSE 与手动模型列表 ＋ 错误分类 ＋ 重试纪律 ＋ LL-17 计数 | ✅ |
| 4 | `src/parser/propose.ts` — S-08/LL-07 提议钳制（整批丢弃语义） | ✅ |
| 5 | `src/llm/turnLoop.ts`（拍板B：合同原写 src/turn/，因 L-01 表上引禁忌迁此——**批次卡正文已于 2026-09-17 追认改正**） | ✅ |
| 6 | `src/App.vue` ＋ `src/components/ChoiceInput.vue` 接线（内嵌最简设置块：upstream 三字段＋保存；LL-107 hook 集合） | ✅ |
| 7 | 单测三件套 `tests/unit/llm/{prompt,client,turn-loop}.test.ts` | ✅ |
| 8 | `tests/e2e/gates/gate3-months.spec.ts`（清偿 G-3：12 月骨架） | ✅ |
| 9 | 断言 LLM-31～41 分阶段入账；当前187条（`rebuild-v2.0/baseline/assertions-v2.json` ＋ 仓内 `baseline/assertions.json` 同步） | ✅ |

**commit message 引用 VS-01**（单批提交；rebuild-v2.0 非 git 仓不改 git 面）。
**代码覆盖**：批准行「同一批账户过单测＋基准含真实 12 回合样本四数字」——前三者全落，真实 12 回合待 L3（钥匙/端点由用户提供，程序见 §4）。

## 2. 豁免与硬依赖台账（审计面）

| 项 | 内容 | 登记处 |
|---|---|---|
| LAYER-008 上线 | L6 llm 组合模块组（client/prompt/errors/turnLoop）同层组合豁免，2026-09-17 拍板B | eslint.config.js L-02 表 · scripts/graph-check.mjs 镜像 · scripts/static-checks.mjs 双向表 · 四件头注 `EXEMPT:LAYER-008` |
| LAYER-005 拓面 | parser 意图链接收 propose.ts（提议与意图同链） | 同上三处 ＋ 头注 `EXEMPT:LAYER-005` |
| layer-graph 22 边人工登记 | 详 `baseline/layer-graph.json`（App.vue→llm/*·stores/settings；llm 内部×2；prompt→data/validation×4；turnLoop→parser×4＋turn×3(L6→L4 下引·拍板B核心)＋validation×2；propose→validation×2） | graph-check 当前283边，另新增一条合法 client→validation/apiEndpoint 边 |
| 历史 CF 代理 | 完整移至 `tests/fixtures/cf-proxy/`，60项测试在 `tests/unit/archived-proxy/`；不部署，不证明当前生产SSRF防护 | 现网版本代码按TEC-03纯静态裁决；实际发布未执行 |
| prompt.ts 去私联 | 阶段一次重构误引 stores/settings（L6→L7 逆向）——已绝源：PromptBudgetTier 本地同构声明 | static-checks/lint 全绿 |
| SAV-4 守门 | App.vue 用 null-ref ＋ loadSettings 回填，组件侧不引用 DEFAULT_SETTINGS 单点 | gate:static 接手基线 20 项全绿 |

## 3. 验收判据逐行状态

| # | 判据 | 证据 | 状态 |
|---|---|---|---|
| V1 | 静态头跨回合逐字节稳定且哈希导出 | prompt.test：同设置两遍 hash 等值 / 异档 hash 异值 / fnv1a 导出 | ✅ |
| V2 | 静态头不含日期/回合号/存档 id | prompt.test 静态头断言（不含 `1921-07`＋无回合字段） | ✅ |
| V3 | memory 写入契约注入（≤3） | prompt.test 含「单轮最多 3 条」文案 | ✅ |
| V4 | SSE 逐帧拼接＋onDelta 全量 | client.test 帧级桩 | ✅ |
| V5 | 15码封闭表＋直连HTTP分类 | typecheck Record穷尽；client/direct覆盖网络CORS合并分类、HTTP不可升级重试、错误不泄漏 | L2 ✅ |
| V6 | 重试纪律（5xx≤1，其余零） | client.test 计数桩 | ✅ |
| V7 | 流中断已收块照常（不重试）＋partialText | 2026-09-18 metering.test 实际抛出读流异常，验证部分文本保留、无重试、原始异常不泄漏 | ✅ |
| V8 | 自报 actor 剥离 | turn-loop.test（含侧边段被剥） | ✅ |
| V9 | 原子提交：合法链单次落数 | turn-loop.test（career.money=15＋sit-mp-入队＋world.date 未越步） | ✅ |
| V10 | 拒认整批回滚（giveTree 非法变种 → sameWorld 原树逐字节） | turn-loop.test bad-world 用例 | ✅ |
| V11 | metrics 四字段（遵循率/可用率口径） | turn-loop.test counts | ✅ |
| V12 | 锁单轮 ≤1 提议、第 2 块整批丢弃 | turn-loop.test double-propose 用例 | ✅ |
| V13 | queue 命中即重复（无 embedding 字符串规范化路径幂等） | turn-loop.test 幂等用例 | ✅ |
| V14 | 免 API 调用计数恒 0 | gate3：countRealCalls()=0 | ✅ |
| V15 | 12 月骨架：tickWorld 链＋存读档逐位往返 | gate3 e2e | ✅ |
| V16 | 当前版本L2门与浏览器免API冒烟 | 468/468 tests（含60历史代理测试）、static21、graph283、正常对照+7注入、build/静态产物门通过；Chromium开局→12月→刷新恢复1922-07且模型请求0 | L2 ✅；真实模型L3未测 |
| V17 | **单回合成本** | 修复后复测（§4.1.7）：prompt 1276–2778（均 2198.6）、completion **259–3153**（均 826.2）、合计 26383＋9914＝**36297**（均 3024.75 token/回合）；墙钟 4.4–37.4 s（均 **11.9 s/回合**，总 142.7 s）。**币种与单价仍未确认**（该服务商账单端点无对外接口），故不折算金额。修复前基线见 §4.1.4 | 🟡 部分（缺价格确认） |
| V18 | **静态头缓存命中率** | 修复后复测（§4.1.7）**全 12 样本覆盖**：`cached_prompt_tokens` 逐回合 1024/1024/1024/1024/**0**/**0**/1024/**缺字段**/512/1024/1024/1024 → 可计数样本（11/12）Σcached 15872 / Σprompt 23648＝**67.1%**；缺失 1 样本致 `summarizeCallStats` 仍记 `cacheTokenRatio` **null**（程序第 5 条：缺字段记未测、不造数）。`buildStaticHead` 全 12 回合 hash＝**`404e2aaf`**（字节稳定 ✓）。**静态头分段命中率仍「未测」**（上游只报整个 prompt 的缓存 token，hash 稳定不能换算）；t5/t6 因单轮超长输出挤出缓存窗口（cached=0）。修复前基线见 §4.1.4 | 🟡 部分（分段=未测） |
| V19 | **意图遵循率＋提议可用率** | 修复后复测（§4.1.7）：`blocksTotal` **15**、`blocksApplied` **12**、`proposeSeen` **10**、`proposeUsable` **7**；全 12 回合 `ok/commitOk` 均 true、**`bad-block` 0**；提交成功率 **12/12**、提议可用率 **7/10**（可用率非 100% 的 3 次均因单轮提议 >1 被 `LL-07` 正确拒绝，非解析失败）。修复前为 0/12，根因见 §4.1.1 | ✅ Node 侧 |

## 4. 实测程序（2026-09-18 纠偏版；此前字符计费/哈希命中率算法作废）

**前置**：先完成本轮 L2 复核；用户在本机配置 baseUrl/model/apiKey，并确认币种与本次最大费用。不得把 key 发到聊天、命令行、文档或日志。正式部署不是前置，使用构建后的纯静态页面/本机静态预览；生成和模型列表浏览器直连。需实做实际服务商CORS/流式验证，不恢复CF代理。

1. 依 `vicissitudes/docs/mcp-vs01-metering.md` 保留的 12 回合样本表（网络路径以当前直连裁决为准），在浏览器固定新档与模型/预算档位进行实测。真实回合与 mock 样本严格分开。
2. 若端点文档明确支持 `stream_options.include_usage`，手动勾选设置区「请求上游 usage」；默认关闭。参数被拒时停止并记录，不允许自动删参数重发。未提供 usage 的服务商只能从可信账单另行核对，不能回退伪造实测。
3. 设置区「验收观测 JSON」可选中复制。它仅含请求序号、白名单 usage、静态头 hash、提交标志与既有结构块计数；刷新清空。无需在生产 bundle 中动态 import 源码。
4. **成本**：用实际 token 与已确认币种/价格版本计价，并核对服务商账单；缺 usage 或价格为「未测」。`promptChars/completionChars` 只是 UTF-16 字符计数，不是 token 或价格。请求数也不等于服务商计费次数。
5. **缓存**：上游整个 prompt 的实际缓存 token 占比 = ΣcachedPromptTokens / ΣpromptTokens，须全样本覆盖、分母非零；缺缓存字段为「未测」，0 只用于上游明确的零。**hash 稳定不能换算命中率**；若服务商不报告静态头分段命中，不能把总 prompt 占比冒充静态头分段实测。
6. **意图/提议**：导出的 `metrics` 沿用结构块下链/提议过闸计数，需连同 `committed` 与逐回合叙事人工复核；不把下链率叫自然语言意图遵循率，不把回滚样本叫成功落账。零分母记未测，不填 100%。
7. 清空 API 配置、刷新清空本页计数后，走免 API 12 月与存读档路径，请求计数必须 = 0。auth/rate/timeout 等失败按 LL-19 与零调用规则路径对照；流中断完整已收块按 LL-02 保留，不引入机制改动。
8. 四数字与人工现象、服务商用量/价格证据全部齐备后再更新 V17–V19 和批次卡；任何未测项不得改成通过，缺供应商维度时需记录受限项并由主理人裁定验收口径。

## 4.1 L3 真实回合实测记录（2026-09-22；Node 侧口径）

**口径声明**：本节数字由**仓内真实模块**（`buildChatMessages` → `callChatCompletion` → `runModelTurn` → `tickWorld`）在 Node 侧对**真实服务商**跑出，12 回合、1921-07→1922-06、无 mock。它**不是** §4 第 1 条要求的「构建后静态页在浏览器里实测」：真实 Chromium 已实测该端点**跨源必被 CORS 拒**（预检 `PreflightMissingAllowOriginHeader`，见 §4.2），故浏览器腿**未通过、记受限项**，不以本节冒充。

样本：模型 `deepseek-flash`，base `https://tokenrhythm.studio/v1`，预算档 `standard`，玩家输入 12 条脚本化文本。原始报告已按用户 m00445 裁定**入档**：`docs/evidence/l3-real-12turns-prefix-2026-09-22.json`（36,511 B，脱敏零 key，说明见同目录 `README.md`）。**该快照是「契约修复前」基线**，`headHash` 记为 `ac768f48`；修复后静态头 hash 已变为 `404e2aaf`，复测结果另记。

### 4.1.1 决议：为什么 12 回合一个块都没进

`①文风契约` 段只规定了**标签名**，从未规定**块内容的形态**：

```
结构块只可用 <Command>（命令意图）、<UpdateVariable>/<JSONPatch>（微观变量补丁）、
<Resolve>（处境了结）、<Propose>（提议动态处境）；未知标签会被剥除。
```

模型据此把标签当作「这段是什么」的标注，于是：`<Resolve>` 内写散文、`<Propose>` 内写散文 → 皆非 JSON → 逐块 `bad-block`；`<UpdateVariable>` 内的 `<JSONPatch>` 反而**写对了**。原始响应（同一 prompt、同一模型、单次调用）实证：

```
<Resolve>你在城里赁了间下处，一住便是月余。房钱按日算……</Resolve>

<UpdateVariable>
<JSONPatch>
[
  {"op":"add","path":"/memory/items/m1","value":{"id":"m1","type":"event",…}},
  {"op":"add","path":"/memory/items/m2","value":{"id":"m2","type":"state",…}}
]
</JSONPatch>
</UpdateVariable>

<Propose>你盘缠将尽，是留在城里寻个营生，还是搭车船往别处去？……</Propose>
```

**判定：这是 prompt 契约缺口，不是解析器缺陷，也不是模型能力不足。** 契约层（`LL-12` 静态头）只给了标签词表，没给载荷语法；而该语法只存在于 `parseBlock` 的期望里。

### 4.1.2 次生伤害：叙事通道单点依赖 `<Resolve>`

12 回合里 **10 回合 `narrativeChars == 0`**，但模型**确实写了可读散文**（第 1、2 回合正文完整，只因未包 `<Resolve>` 而整段不落地）。叙事抽取只认 `<Resolve>` 块内内容 —— 通道单点，与 JSON 缺口叠加后放大为「玩家看到空页」。两处应分开记：JSON 形态缺口是主因，叙事单点依赖是独立缺陷。

### 4.1.3 架构面经受住了这次实战（未发现回落）

`commitOk` **12/12 为 true**（不因坏块整树回滚）；SSE 12/12 `usageComplete`；无重试、无连接层失败；`bad-block` 按 `LLM-14`/`LLM-28` 逐条注记、回合不中断；`headHash` 跨回合字节稳定。即：**接得上、稳得住、契约没约定数据形态**。

### 4.1.4 逐回合原始数字

| 回合 | 月份 | 叙事字符 | 块总数 | 下链 | 提议见/可用 | prompt | completion | cached |
|---|---|---|---|---|---|---|---|---|
| 1 | 1921-07 | 0 | 0 | 0 | 0/0 | 883 | 464 | 768 |
| 2 | 1921-08 | 0 | 0 | 0 | 0/0 | 956 | 356 | 768 |
| 3 | 1921-09 | 242 | 0 | 0 | 0/0 | 962 | 506 | 768 |
| 4 | 1921-10 | 0 | 0 | 0 | 0/0 | 1134 | 667 | 768 |
| 5 | 1921-11 | 107 | 0 | 0 | 0/0 | 1138 | 379 | 768 |
| 6 | 1921-12 | 0 | 0 | 0 | 0/0 | 1228 | 646 | 768 |
| 7 | 1922-01 | 0 | 0 | 0 | 0/0 | 1237 | 363 | 768 |
| 8 | 1922-02 | 0 | 0 | 0 | 0/0 | 1241 | 524 | 768 |
| 9 | 1922-03 | 0 | 0 | 0 | 0/0 | 1249 | 773 | — |
| 10 | 1922-04 | 0 | 0 | 0 | 0/0 | 1255 | 171 | — |
| 11 | 1922-05 | 0 | 0 | 0 | 0/0 | 1257 | 406 | 768 |
| 12 | 1922-06 | 0 | 0 | 0 | 0/0 | 1261 | 330 | 768 |

逐回合坏块标签（全体出现）：`Resolve`（散文）、`UpdateVariable`（散文或 `<JSONPatch` 字面量文本）、`Propose`（散文）、`Command`（散文）。

### 4.1.5 疑似同源问题（未在测试面暴露）

12 回合诊断中多次出现 `UpdateVariable 块解析失败：Unexpected token '<', "<JSONPatch"...`——块内容**以 `<JSONPatch` 字面量开头**。按现行静态头，`UpdateVariable`/`JSONPatch` 两标签的关系（谁包谁、载荷挂在哪一层）**同样没有文字规定**。

**架构影响（须记入下一批）**：仓内 468 项单测全部用**良构 mock** 喂解析器，因此这条缺口**测试面永不失败**——只有接上真模型才会暴露。这正是本批「补测真实 L3」的产出，不是回归。

### 4.1.6 未测项（不得据此宣称 L3 完成）

- 浏览器腿：静态页在真实浏览器中的直连（CORS 已实测拒；见 §4.2）
- 币种与单价、服务商账单核对（无对外账单接口）
- 静态头**分段**缓存命中率（上游只报整个 prompt 的缓存 token）

### 4.1.7 契约修复后复测（2026-09-22 第二跑；决定性结果）

**样本**：同模型 `deepseek-flash`、同 base `https://tokenrhythm.studio/v1`、预算档 `standard`、12 回合、1921-08→1922-08。`headHash` 全 12 回合＝**`404e2aaf`**（修复后静态头）。原始报告已入档：`docs/evidence/l3-real-12turns-postfix.json`（脱敏零 key）。**输入集与 §4.1.4 的 12 条脚本化输入非同一份**（原始输入文本未留存），故逐回合绝对数字不可与修复前逐行对拉，只可作**同口径统计对照**。

#### 修复前 → 修复后（同一工装、同一模型、同一端点）

| 指标 | 修复前（§4.1.4） | 修复后 |
|---|---|---|
| `blocksTotal` | **0** | **15** |
| `blocksApplied` | **0** | **12** |
| `proposeSeen` / `proposeUsable` | 0 / 0 | **10 / 7** |
| 有叙事的回合 | 2/12（`narrativeChars` 仅 242、107） | **12/12**，合计 **4079** 字符 |
| `bad-block` 诊断 | 逐块（Resolve/Propose/UpdateVariable/Command） | **0** |
| 提交 `ok`/`commitOk` | 12/12 true | 12/12 true |

**结论**：§4.1.1 判定的「契约缺口」是**真因**——只补 `LL-12` 静态头的载荷语法，未动任何解析器，`blocksApplied` 即由 0 变 12。同时 §4.1.2 的「叙事单点依赖」**危机缓解但不是修复**：模型现已把散文写到块外并被抽取，12/12 回合均有非空叙事；但通道仍单点依赖 `<Resolve>`，抽取规则未动，该缺口仍待裁决。

#### 逐回合原始数字（修复后）

| 回合 | 月份 | 叙事字符 | 块总数 | 下链 | 提议见/可用 | prompt | completion | cached | 墙钟 ms |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1921-08 | 507 | 1 | 1 | 0/0 | 1276 | 520 | 1024 | 10074 |
| 2 | 1921-09 | 288 | 1 | 1 | 1/1 | 1514 | 373 | 1024 | 9160 |
| 3 | 1921-10 | 282 | 1 | 1 | 1/1 | 1703 | 408 | 1024 | 7592 |
| 4 | 1921-11 | 220 | 2 | 1 | 1/0 | 1867 | 502 | 1024 | 8054 |
| 5 | 1921-12 | 671 | 1 | 1 | 0/0 | 2018 | **2775** | **0** | 28611 |
| 6 | 1922-02 | 387 | 3 | 3 | 1/1 | 2197 | **3153** | **0** | **37425** |
| 7 | 1922-03 | 566 | 1 | 1 | 1/1 | 2349 | 589 | 1024 | 12311 |
| 8 | 1922-04 | 353 | 1 | 0 | 1/0 | 2536 | 386 | **缺字段** | 7399 |
| 9 | 1922-05 | 249 | 1 | 1 | 1/1 | 2657 | 329 | 512 | 5708 |
| 10 | 1922-06 | 178 | 1 | 1 | 1/1 | 2778 | 280 | 1024 | 5410 |
| 11 | 1922-07 | 244 | 1 | 0 | 1/0 | 2753 | 340 | 1024 | 6866 |
| 12 | 1922-08 | 134 | 1 | 1 | 1/1 | 2735 | 259 | 1024 | 4406 |

归总：`promptTokens` 26383、`completionTokens` 9914、`promptChars` 42496、`completionChars` 9532、墙钟合计 142716 ms（均 11893 ms/回合）。三处 `proposal-rejected`（t4/t8/t11）均为单轮提议 >1，`LL-07` 表末行正确拒绝；t8/t11 因此该轮 `writtenDomains=[]`（世界不变，非失败）。t6 单轮一次写入 `world.date`＋`_authority.pendingSituations`＋`memory.items` 三域。

**速度观察（如实记录，不作为结论）**：t5/t6 的 completion 达 2775/3153 token，墙钟 28.6 s／37.4 s，是均值（11.9 s）的 2.4–3.1 倍；这两轮缓存命中为 0。样本仅 2 点，**不足以断言因果**。

#### 4.1.7.1 复测中暴露并已修复的 P1（不可信输入抛穿回合）

**首跑 12 回合在第 3 回合直接抛穿**：`Error: modifyPlayer.field 必须为非空字符串`——工装整个中断，未产出报告。根因不是工装：

- `src/turn/TurnRunner.ts:125-129` 的生产提交路径**有** try/catch：`try { ops = compile(effects, state) } catch (e) { return { ok:false, … error: 编译失败：… } }`
- `src/llm/turnLoop.ts:122` 的**同一条 `compile()` 是裸调用**，零保护。`Command` 分支的编译有自己的 try/catch（`turnLoop.ts:69-74`），但 `Resolve`（`:84`）与 `Propose`（`:100`）压进批外 effects 的效果，是在 `:122` 才编译的——一条形状合法、载荷非法的块即可让 `CompileError` 从 `runModelTurn` 抛到调用方。

**为何测试面看不见**：`tests/unit/llm/turn-loop.test.ts` 原有 8 个用例**全部喂良构载荷**，从构造上不可能触发（同 §5 记录的测试面盲区）。

**修复**（最小改动，与 `TurnRunner.commit` 同语义）：`turnLoop.ts` 的 `compile` 外包 try/catch，失败时返回 `ok:false`、`state` 原树逐位不变、追加 `{code:'rejected', detail:'批外效果编译失败——整批丢弃（原子回滚）：…'}` 诊断，绝不抛穿。新增回归用例「批外效果编译失败不抛穿回合（降级 rejected + 整批丢弃 + 世界逐位不变）」，断言 `not.toThrow()` ＋ `r.ok===false` ＋ `r.state` 原树 ＋ `writtenDomains=[]` ＋ 诊断存在。

**变异检验（证明用例非空转）**：临时移除 guard 后，新用例以原话失败——`AssertionError: expected [Function] to not throw an error but 'Error: modifyPlayer.field 必须为非空字符串' was thrown`；恢复 guard 后 9/9 绿。`tests/unit/llm/` 共 5 文件 **98** 项，全套 `pnpm gate` **exit 0**（typecheck＋lint＋**525 tests**＋test:data＋static 21）。

## 4.2 浏览器腿受阻记录（受限项）

- 真实 Chromium（CDP 抓 `Network` 层）对 `https://tokenrhythm.studio/v1/*` 的请求：`OPTIONS` 预检 **404、零 `access-control-*` 头** → 请求 `net::ERR_FAILED`，`corsError: "PreflightMissingAllowOriginHeader"`；页面内探针一律 `TypeError: Failed to fetch`。
- 该服务商 CORS 白名单只放行自家源（Origin＝其自身域时预检 204 且回显 ACAO/ACAH/ACAM；其他 Origin 一律 404 无 CORS 头）。静态托管站点的源**不在白名单内**，按 `TEC-03` 纯静态＋浏览器直连架构**结构上用不了**。
- 因此 `LLM-37`/`LLM-38` 的「CORS 失败与网络/TLS 失败不可区分」在真实服务商侧得到验证；但**游戏可用性**需玩家改配支持跨源的端点，或由主理人另裁路线。**不引入代理**（`TEC-03` 已裁）。
- **「有没有更好的解决办法」调研结论（2026-09-22）**：见 `vicissitudes/docs/browser-direct-provider-research.md`。一句话——在「纯静态＋禁代理」下**不存在让任意 OpenAI-compatible 端点都能工作的通用技术手段**；`TEC-03` 的裁决不必推翻，但它漏了一条：**OpenAI-compatible ≠ 浏览器可直连**（`tokenrhythm` 正是反例）。替代路径是产品级的：推荐实测支持跨源的服务商（本机实测成功路径：OpenRouter／DeepSeek 官方／Fireworks）＋提供本地推理通道（Ollama 需玩家自设 `OLLAMA_ORIGINS`）＋保存端点前做**客户端预检探测**，把失败文案从 `net::ERR_FAILED` 提升为可读提示。

## 5. 已知缺口＋下一批提醒（不在本批范围——硬纪律「顺手做了按事故处理」）

- LL-15 extractor/memory 补写 · LL-18 embedding 召回 · LL-16 意图识别器 · split 模式 · prompt 文案质感 —— 范围外
- **【2026-09-22 实测新增·高优先级】结构块载荷契约缺口**：静态头只列标签名、不规定载荷 JSON 形态与标签嵌套关系（含 `<UpdateVariable>`/`<JSONPatch>` 谁包谁），导致真实模型逐块 `bad-block`、`blocksApplied` 0/12（见 §4.1）。修它要动 `LL-12` 静态头 → 须同批重算 `headHash`（`LLM-13` 期望值）并复核 `V18`。**建议作为下一批第一项**，未获拍板前不改。
  → **2026-09-22 已拍板并修复**：用户 m00445 批「修」。`src/llm/prompt.ts` 的 `SEG_STYLE` 已补齐五种标签的载荷契约（每块必须且只能是一个 JSON 对象、散文写在块外、显式书写语法、五种标签各一例＋记忆条目全字段例），`headHash` 由 `ac768f48` 变为 **`404e2aaf`**（静态头 984 → **2137** 字符）。**关键机制**：示范块里的标签必须写成 HTML 实体（`&lt;Command&gt;`），否则会被 `parseBlocks` 当真实结构块从叙事中剥除——此点已用用例锁死（`prompt.test.ts`「不得被 parseBlocks 当块剥除」）。另：`<UpdateVariable>` 谁包谁一并写明。测试 `tests/unit/llm/` 由 96 → **97** 项，全套 `pnpm gate` **523 tests 全绿、exit 0**。
- **【2026-09-22 实测新增】叙事通道单点依赖 `<Resolve>`**：块外散文整段丢弃，修复前 12 回合中 10 回合空叙事（见 §4.1.2）。与上一条独立，**仍未裁决**（兜底叙事 or 放宽抽取）。**复测结论（§4.1.7）**：契约修复后模型已把散文写到块外且 12/12 回合均抽取到非空叙事（合计 4079 字符），**危机缓解**；但抽取规则未动、通道仍单点依赖 `<Resolve>`，缺口**依然开放**。
- **【2026-09-22 实测新增·测试面盲区】**：仓内全部 LLM 测试用良构 mock 喂解析器，契约类缺口在 468 项测试中**永不失败**；凡「契约是否足以驱动真实模型」一类问题，只有 L3 能证伪。**同源第二例已实证并修复（§4.1.7.1）**：`turnLoop.ts:122` 的批外 `compile()` 裸调用，良构载荷永不触发，而真实模型输出两次即抛穿整回合——已加 guard ＋ 回归用例 ＋ 变异检验。
- 实际服务商的浏览器CORS/流式与四数字L3仍待；旧functions已归档，不再做恢复代理的终验。→ 2026-09-22 更新：四数字已实测（Node 侧，见 §4.1）；浏览器腿按 §4.2 记受限项，**不因 Node 数字放行**。
- 2026-09-17 拍板 B 的批次卡落位修正已追认；旧审计中的「VS-01 未开工/无远端/批次卡待改」不作为当前待办。其他契约引用若仍有差异须单独核对，不凭此扩大本批范围。
- 完整 DebugPanel 仍后置；本轮仅增强现有设置区数值观测与脱敏 JSON，观测不持久化。
- **蓝图勘误（2026-09-22，未改 `rebuild-v2.0`）**：`src/51-build-rings.md` VS-02 卡文写「MEM 组（3i 在途合并既有条目）」，但 v1.0/v2.0 账本**均无 MEM 组、亦无 3i**；「在途合并」的账本归属实为 `SAV-11`。已按现状在 `SAV-21` 的 `rel` 中引用 `SAV-11`，勘误待主理人决定是否回改蓝图分片（改分片需重跑 `build.mjs`，属独立批次）。
- **蓝图过期硬编码（沿用勘察结论，未改）**：`HANDOFF.md:15` 的「176 条断言」已过期（本轮合并后权威账本为 16 组 **192 条**）。

## 6. 目录核对（提交前）

- 侦察临时件 `_ok.txt/_pl.log/_a.txt/_b.txt/_c.txt/_l10.txt/_g.txt` 已清（`git status` 应只见本批十组文件＋baseline 两项）
- rebuild-v2.0 非 Git 仓；本轮所有修改仍未 commit/push/deploy。旧代理的删除对应测试归档迁移，不是丢弃源码。
