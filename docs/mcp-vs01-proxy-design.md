# VS-01 云 API 代理方案历史记录（已裁决纯浏览器直连，2026-09-18）

> 本文保留当时的研究与提案，不再处于等待A/B拍板状态。用户随后选择浏览器直连并确认继续，代码已经落地；当前方案、验证与未测边界见 `vicissitudes/docs/mcp-browser-direct.md`。下文“尚未切换”等措辞仅指提议当时。

## 已确定与未确定

- 用户已选择「OpenAI 兼容云 API」。尚未提供具体 baseUrl/model，也未授权收费调用。
- 计量纠偏阶段代码已落地：412/412 tests、static20、graph282、mut5/5、build 和文档五步门通过。已有结果见 `vicissitudes/docs/mcp-vs01-metering.md`。
- 本文只是代理方案核对，不代表 IP 绑定已修复，不代表 L3 完成。没有改动代理部署架构、可信端点范围或执行任何真实模型调用。

## 1. 当前代码缺口

`vicissitudes/functions/api/chat.ts` 在 `buildUpstreamRequest` 中校验 `resolveHost` 返回的 IP，但后续仍调用 `fetch(built.url.toString())`，没有固定到已校验 IP。`vicissitudes/functions/_lib/doh.ts` 在所有 DoH 失败时返回空 IP 列表，再交由域名连接；这不符合 `rebuild-v2.0/src/24-contract-llm.md` LL-10 规则 5 对「校验与连接同一 IP」的强承诺。

因此：多做一次 DNS 查询、只给变量改名或让 mock 断言通过，都不能消除 DNS 检查与连接之间的时间差问题。

## 2. Cloudflare 当前公开接口限制（2026-09-18 核对）

1. `fetch` 的 `cf.resolveOverride` 接受替代主机名，且仅在 URL host 与替代 host 均处于同一 zone 时生效；不同 zone 会被忽略。它不是任意第三方 HTTPS 端点的通用 IP 锁定开关。[5](https://developers.cloudflare.com/workers/runtime-apis/request/)
2. Workers 的 `node:http.request` 仍包装 `fetch`，公开文档明确不支持 `lookup`、`createConnection`、`socketPath`。不能直接照搬 Node 服务里的自定义 DNS lookup 方案。
   官方原文：https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/#request （页面更新 2026-04-23）
3. Workers TCP sockets 文档明确禁止连接 Cloudflare IP 段。直接换 `connect()` 不是通用云 API 修复；目标上游若落在受限网段就不兼容，还需正确解决 HTTPS 主机名校验与 HTTP/SSE 传输，不能用跳过证书检查替代。
   官方原文：https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#considerations （页面更新 2026-06-19）

这些结论针对当前部署/公开 API 与通用任意端点目标，不声称排除了所有额外 Cloudflare 产品或用户可控 DNS 架构。任何新增资源、域名配置或部署变更均需另行确认。

## 3. 两条可评审路线

| 路线 | 保留什么 | 必须承认的变化 | 验收前提 |
|---|---|---|---|
| A：纯 Pages Functions，可信端点白名单 | 现有 Cloudflare 部署、同源代理、BYOK | 不再接受任意用户自填域名；以部署者批准的精确 HTTPS host/port/base path 为安全边界。**这不是强 IP 绑定**，必须修订契约，不得冒称旧规则已实现 | 主理人批准收窄支持范围；给出允许端点；默认拒绝未配置/不匹配目标；拒绝凭据型 URL、重定向、私网与危险目标；保留 TLS 校验和测试 |
| B：保留任意可接受的 HTTPS 端点，增加受控出口 | 任意端点能力与强 DNS/IP 绑定目标 | 需要一个能控制实际连接、TLS servername/证书和重试的出口运行时；属于部署架构变更，不能由执行者擅自添加服务器/费用 | 先明确已有资源与运行时；出口有身份认证、防任意转发、IP 验证/绑定、TLS 校验、SSRF/重定向防护、SSE/中断与零密钥日志测试，再部署授权 |

若用户实际只用少量可信云服务商，A 通常改动面较小；若「任意兼容端点」是硬要求，不能用 A 假装保留，应评审 B 或其他用户批准的可验证架构。暂不选择时保留现状和风险登记，不进行真实验收或发布。

## 4. 决策边界

用户选择「云 API」只明确了上游类型，不等于批准收窄支持范围或新增出口服务。因此本文先落仓等待路线拍板；不私自改宪章/部署方式，不为赶进度移除 DNS、Origin、TLS 或 SSRF 检查。

真实模型测试仍须：用户在本机填写 key、提供不含 key 的端点/模型信息、确认费用上限，并完成实际浏览器/代理 L3 记录。普通测试桩和本轮 412 个通过用例不能替代这些证据。

## 5. 用户提出的浏览器直连路线（优先评估，尚未切换代码）

用户随后提出：调用全部走玩家直连，尽量减少其 Cloudflare 项目的流量交互。此前 A/B 方案沿用了蓝图「生成只走同源 /api」的约束；该新路线改变这一约束，但与 BYOK、本地存档和减少 CF 中转的目标一致。

- 数据流：Cloudflare Pages 只分发页面/JS/静态数据；玩家浏览器直接对其配置的云 API 发送 prompt，接收 SSE/usage。模型列表请求也直连；不把 key/prompt/回复转发经用户自己的 CF 项目。
- 必要条件：上游支持浏览器 CORS，包括请求 Origin、Authorization/Content-Type 预检、POST 和流式响应。OpenAI-compatible 协议并不自动代表支持 CORS。`no-cors` 会产生不可读响应，不是解决方案；不得要求关闭 TLS/CORS 安全检查。
- 推荐无自动 CF 回退：不兼容的服务商明确报网络/跨域失败，玩家可改用支持直连的服务商，或明确配置自控/可信的中转。不能偷偷把 key 发给另一个代理。
- BYOK key 仍只由玩家在本机填写并发送给其选择的服务商；不把开发者共享 key 写入前端。直连减少的是用户 CF 项目的中转/Functions 请求，不减少服务商 token 费用。服务商自身是否使用 CF 属其基础设施，不能声称互联网路径绝不经过 CF。
- 代码落地时要同步修改 TEC-03、LL-10/11/17/19 与 LLM-22 等网络出口契约/断言；保留 SSE、usage、隐私及零 API 回归。不为守住旧测试而假装仍同源，也不删除历史断言文本冒充无变更。
- 纯静态部署必须真正移除或停用 CF 模型/模型列表代理路由；仅让前端绕过却保留可公开调用的旧代理，不能解决 CF 流量/开放代理风险。
- 浏览器直连不提供应用层 DNS/IP 固定能力；此路线通过取消服务器中转来移除该模型调用路径的服务端 SSRF 风险，不把浏览器 CORS 冒充服务端强 IP 绑定。

当前只记录可行性与建议，尚未切换网络路径、停用 CF 路由或发出真实请求。需确认采用纯直连边界，并用实际 baseUrl/model 核对浏览器支持；key 不应发送到聊天。既有 412 项通过的计量改动保持不变。
