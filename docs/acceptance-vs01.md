# VS-01 验收单 —— LLM 垂直切片（最小链）

**批次卡**：`rebuild-v2.0/src/51-build-rings.md` §二十九.7 · 拍板记录 `rebuild-v2.0/src/40-appendix.md`（2026-09-17／2026-09-18）
**完成判据**：本批门禁全绿 ＋ 四实测数字落格。当前：2026-09-18 接手基线已实跑通过（376 tests／static 20／graph 282／mut 5/5）；后续已完成纯浏览器直连及保存屏障修正：468 tests、static21、graph283、正常对照+7注入、构建/静态产物门和隔离Chromium免API冒烟通过；当前证据见 `vicissitudes/docs/mcp-browser-direct.md`。**真实四数字未测，VS-01 保持施工中，不宣称 L3 完成。**

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
| V17 | **单回合成本** | mock 面四计数已落（V11）；真实 token 计费口径 **待 L3** | ⏳ |
| V18 | **静态头缓存命中率** | buildStaticHead 哈希稳定（V1）；真实缓存命中量 **待 L3** | ⏳ |
| V19 | **意图遵循率＋提议可用率** | mock 面 3/3 与 2/2 已验（V9/V13）；真实 12 回合均值 **待 L3** | ⏳ |

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

## 5. 已知缺口＋下一批提醒（不在本批范围——硬纪律「顺手做了按事故处理」）

- LL-15 extractor/memory 补写 · LL-18 embedding 召回 · LL-16 意图识别器 · split 模式 · prompt 文案质感 —— 范围外
- 实际服务商的浏览器CORS/流式与四数字L3仍待；旧functions已归档，不再做恢复代理的终验。
- 2026-09-17 拍板 B 的批次卡落位修正已追认；旧审计中的「VS-01 未开工/无远端/批次卡待改」不作为当前待办。其他契约引用若仍有差异须单独核对，不凭此扩大本批范围。
- 完整 DebugPanel 仍后置；本轮仅增强现有设置区数值观测与脱敏 JSON，观测不持久化。

## 6. 目录核对（提交前）

- 侦察临时件 `_ok.txt/_pl.log/_a.txt/_b.txt/_c.txt/_l10.txt/_g.txt` 已清（`git status` 应只见本批十组文件＋baseline 两项）
- rebuild-v2.0 非 Git 仓；本轮所有修改仍未 commit/push/deploy。旧代理的删除对应测试归档迁移，不是丢弃源码。
