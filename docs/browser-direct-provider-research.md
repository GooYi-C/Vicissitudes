# 浏览器直连服务商调研（VS-01 L3 前门）

**日期**：2026-09-22 ｜ **状态**：工作稿（未拍板，不得据此改 `src/**` 或 `rebuild-v2.0/**`）
**缘起**：VS-01 真实 L3 卡在「浏览器跨源必被拒」。用户要求「有没有更好的解决办法」。
**约束前提**：`TEC-03` 纯静态 Cloudflare Pages ＋ 浏览器直连玩家服务商；**禁一切中转**（CF 代理、Workers、Functions、免费 CORS 代理、扩展/油猴均不算本体能力）。

## 1. 一页结论

在「纯静态 ＋ 禁代理」约束下，**不存在让任意 OpenAI-compatible 端点都能工作的通用技术手段**。
可用的不是技术技巧，而是**产品路径**：把「服务商是否支持浏览器直连」当成产品约束来管理。

1. **端点可选性前置**：把 `tokenrhythm.studio` 从推荐/预设端点降级——它在浏览器里**永远不可能成功**，与代码无关。
2. **保存端点前做客户端预检探测**：失败就明确告诉玩家「此服务商不允许浏览器直连」，而不是抛 `net::ERR_FAILED`／`network-or-cors`。
3. **本地推理服务作为一等通道**（Ollama / LM Studio / llama.cpp）。**坑**：Ollama 官方 FAQ 原文——「Ollama allows cross-origin requests from `127.0.0.1` and `0.0.0.0` by default. Additional origins can be configured with `OLLAMA_ORIGINS`.」玩家站点是 `https://*.pages.dev`，**不在默认白名单**，必须自己设 `OLLAMA_ORIGINS=https://xxx.pages.dev ollama serve`。故「一键可用」的假设不成立，必须写进玩家文档。
4. **对服务商提工单**（开放 CORS／Origin 白名单）——只能作并行动作，不可控，不排进路线图。

## 2. 服务商直连清单（截至 2026-09-22）

| 服务商 | 浏览器可直连 | 证据强度 | 备注 |
|---|---|---|---|
| OpenRouter | ✅ | **本机实测成功路径** `OPTIONS`→204＋`ACAO: *`；`GET /models`→200＋`ACAO: *` | 最稳的云端推荐默认 |
| DeepSeek 官方 | ✅ | **本机实测** `OPTIONS`→200＋回显 Origin＋`allow-headers: authorization,content-type`（走 401 路径） | `allow-credentials: true` 时必回显而非 `*` |
| Fireworks AI | ✅ | **本机实测** `OPTIONS`→200＋`ACAO: *`（走 401 路径） | — |
| Anthropic | ✅ 需显式 opt-in 头 | Simon Willison 2024-08-23：`anthropic-dangerous-direct-browser-access: true` | 非 OpenAI-compatible，走 `/v1/messages`；官方自称 "dangerous" |
| Mistral | ✅（维护者确认） | GitHub `mistralai/client-js` #21 维护者 lerela 回复已开启 CORS | 对「自定义头」有警告，而本游戏正发 `Authorization` |
| Cerebras | ✅ 间接 | Big-AGI 文档：浏览器路径反而比服务端更可靠 | 无官方声明，未实测 |
| Groq | ⚠️ **证据冲突** | 支持：open-pencil 表；反对：第三方博客称不回 ACAO | 无官方声明，未实测；要用必须自测 |
| OpenAI 官方 | ⚠️ **证据冲突** | 支持：open-pencil 表；反对：Open WebUI 文档「strict providers might block」 | 本机不可达，未实测 |
| Together AI | ❌ | LobeHub #6264 维护者：「比如 together 就不支持」 | — |
| NVIDIA NIM（默认端点）／AWS Bedrock／Sakana／Modular | ❌ | Big-AGI 文档：不发跨源头 | — |
| tokenrhythm.studio | ❌ | 见 §3 | 与玩家已有实测一致 |
| xAI | ❓ 未取到证据 | `docs.x.ai` 不可达；官方文档无该说明 | 不得断言 |

**方法论警告（必须遵守）**：open-pencil 兼容表原文——「A provider that answers the OPTIONS preflight correctly but omits Access-Control-Allow-Origin on the actual response will fail… **Always test with a valid key and a successful response. Do not infer success-path CORS from an error response.**」本表多数条目走的是 401/错误路径，**正式采用前必须用真实 key 做成功路径复验**；且各家策略会静默变更，故预检探测是必需品而非优化项。

## 3. tokenrhythm.studio：无 CORS 配置，且官方立场是「别在浏览器里用」

核实路径与证据：

- 文档全量 JSON：`https://tokenrhythm.studio/api/docs?path=api-integration`（89 KB）；文档 slug 全集＝`overview, why-tokenrhythm, opensquilla, playground, api-integration, faq, errors, terms, privacy`——**无任何 CORS／Origin／跨域文档页**。
- 对 89 KB 全文关键词扫描：`CORS`/`cors`/`跨域`/`Origin`/`origin`/`referer`/`白名单`/`allowed` **各 0 次**；`浏览器` 出现 4 次，其中一次是**劝阻**。
- 「鉴权与安全」原文：**「API Key 仅在创建成功时完整展示一次，不要写入公开代码、浏览器脚本或日志。」**
- 文档只给 cURL / Python / Node.js 示例，**无任何面向浏览器/前端的端点或 SDK**；接口为 `GET /v1/models`、`POST /v1/chat/completions`、`POST /v1/messages`、`POST /v1/embeddings`，base `https://tokenrhythm.studio/v1`。
- 官方推荐接入方式＝下载 **OpenSquilla 桌面客户端**（macOS `.dmg` / Windows `.exe`）。**官方路线是桌面，不是浏览器。**
- 线上两层防护（CSRF 校验＋自家 Origin 预检白名单）是**刻意设计**，非配置疏漏：外部 Origin 的 `OPTIONS` 返回 **404 且零 `access-control-*` 头**；带不匹配 Origin 的 POST 返回 `403 {"code":"CSRF_INVALID"}`（而该错误码**不在其官方错误码表里**）。
- 服务商主体：基元律动 TokenRhythm（北京基元律动科技）。

⇒ 结论：**这家不是「暂时没配 CORS」，而是产品定位上不做浏览器直连。** 客户端技巧不可能解决。

## 4. 不可行清单（看似可行实则不能）

| 手段 | 为什么不行 |
|---|---|
| `fetch(..., {mode:'no-cors'})` | 响应 opaque，JS 拿不到 header/body，更拿不到 SSE；且 `Authorization` 属非简单头，`no-cors` 下会被拒 |
| `fetch` 的 `keepalive` | 只影响页面卸载后请求继续，**完全不改 CORS 规则** |
| `EventSource` | 只能 GET 且 UA 只允许设 `Accept: text/event-stream`／`Last-Event-ID`，**没有放 `Authorization` 的位置**；而流式是 POST |
| `mode:'navigate'` / HTML `<form>` 提交 | 导航语义，响应替换文档，JS 读不到 body；form 也设不了 `Authorization` |
| `WebSocket` | 端点不是 WS 服务；浏览器 `WebSocket` API 不支持自定义请求头 |
| Service Worker 拦截 | 不是权限提升机制；其内跨源请求仍走同一套 CORS 规则（规范层面推断，未取得原文摘句） |
| 免费公共 CORS 代理 | ❌ 违反 `TEC-03`，且等于把玩家 key 明文交给陌生第三方 |
| `<script>` / JSONP | 端点不返回 JSONP；`<script>` 设不了 `Authorization` |
| Electron / Tauri 打包 | ❌ 本项目明确禁用项 |

**唯一技术可行的旁路是浏览器扩展 `host_permissions` 或油猴 `GM_xmlhttpRequest`**——但那改变交付形态（玩家要额外装东西），且 key 处理边界要重划，只能当备用通道，不是主路径。

## 5. 与蓝图的关系（建议，未改 `rebuild-v2.0`）

- `TEC-03` 的裁决**不需要推翻**：它管的是「不引入中转」与「key 只存浏览器本地」。本次调研没有推翻这两条。
- 需要补的是 `TEC-03` **未覆盖的一条**：该裁决隐含假设「OpenAI-compatible ⇒ 浏览器可直连」，而实测证明**二者不等价**（`tokenrhythm` 就是反例：Node 侧完全可用、浏览器侧结构性不可用）。建议在蓝图里新增一条不变量类似：
  > 端点可用性的前提是**服务商侧声明支持浏览器跨源**；本产品的推荐端点必须逐家实测成功路径的 CORS，未通过者不得列为预设。
- 建议的落地动作（属 L7 设置区，不碰 `TEC-03`）：`src/llm/client.ts` 已有 `fetchProviderModels({baseUrl, apiKey})`，其失败已归一为 `network-or-cors`。可在「保存端点」前用它做一次探测，把失败文案从 `net::ERR_FAILED` 提升为「此服务商不允许浏览器直连，请换用支持跨源的端点或本地推理服务」。

## 6. 来源

- 服务商/模式：https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/ ｜ https://big-agi.com/docs/feature-direct-connection ｜ https://github.com/mistralai/client-js/issues/21 ｜ https://github.com/lobehub/lobehub/issues/6264 ｜ https://github.com/open-pencil/open-pencil/blob/bb8c5c18d9514e2c9f15243419f8efceba640185/packages/docs/programmable/byok-provider-compatibility.md ｜ https://docs.openwebui.com/features/chat-conversations/direct-connections/
- tokenrhythm：https://tokenrhythm.studio/api/docs?path=api-integration ｜ https://github.com/opensquilla/opensquilla
- 本地推理：https://docs.ollama.com/faq
- 浏览器机制：https://developer.mozilla.org/en-US/docs/Web/API/Request/mode ｜ https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive ｜ https://html.spec.whatwg.org/multipage/server-sent-events.html

## 7. 本次调研的已知局限

1. 调研机 IP 被 Cloudflare 拦（403＋`CF-RAY`）：`api.groq.com`／`api.together.xyz`／`api.cerebras.ai`／`api.anthropic.com` **未能实测**。
2. 网络不可达：`api.mistral.ai`／`api.x.ai`／`api.openai.com`／`developer.chrome.com`。
3. **未用真实 key 验证成功路径**（见 §2 方法论警告）。
4. Groq／xAI／Cerebras 三家**无官方书面声明**，证据全为第三方。
5. Service Worker 与扩展两条为规范层面推断，未取得原文摘句。
