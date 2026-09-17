# CF 代理历史归档（2026-09-18）

**不是当前生产契约，也不是已修复 SSRF 的声明。** 用户选择纯浏览器直连后，旧代理从部署入口移至 `vicissitudes/tests/fixtures/cf-proxy/`；对应测试移至 `vicissitudes/tests/unit/archived-proxy/`。归档的 60 项测试仅确认历史实现可复现，不代表现网网络/安全验收。

旧路径 `vicissitudes/functions/<path>` 对应当前 `vicissitudes/tests/fixtures/cf-proxy/<path>`。其中包含此前 usage 修正，未丢弃未提交成果。纯静态部署门禁止将这些文件恢复到 functions/ 或打包为 Worker；恢复旧架构需另行拍板。

原断言文本保留；生产口径的取代关系见 LLM-37～LLM-40 和 `vicissitudes/docs/mcp-browser-direct.md`。以下为切换前技术/代理契约快照，不得按其中的“生效”标记恢复生产路由。

#### TEC-03 Cloudflare 运行结构 ｜ 生效

- **稳定 ID**：`TEC-03`
- **所属层 · 文件路径**：`functions/`
- **类型签名**：

| 端点 | 签名要点 | 职责 | 来源 |
|---|---|---|---|
| `functions/_middleware.ts` | `onRequest(ctx, next)` | Origin 校验 ＋ CORS 头 | 承 §3.2 第 1 层 |
| `functions/api/chat.ts` | `POST`，请求/响应见 LL-10 | OpenAI 兼容代理：SSRF 防护 ＋ SSE 流式 | 承 §3.2 第 1 层 |
| `functions/api/models.ts` | `GET`，见 LL-11 | 模型列表代理 | 承 §3.2 第 1 层 |
| DoH 解析链 | 三解析器，见 LL-11 | DNS over HTTPS 解析 | 承 §3.2 第 1 层 |

- **输入 / 输出**：输入 = 浏览器同源请求（含玩家自备 API key）；输出 = 上游模型响应流
- **不变量**：
  1. 静态产物由 **Cloudflare Pages** 托管，后端能力**全部**走 **Functions/Workers**——**Cloudflare 不可替换**（P0-3）
  2. 代理**必须同源**：前端只请求本站 `/api/*`，不直连第三方域名。**唯一例外**：玩家自配 embedding 端点（承 §7.4b-①，浏览器直连，见 §二十 LL-18）——该例外**不得**扩展到任何生成类调用
  3. 玩家 API key **只经此通道转发**，**服务端零留存**：代理不把 key 写入任何 KV / D1 / 日志 / 分析
  4. 〔v2.0 修订〕客户端侧：key 只存**浏览器本地设置区**（`settings` store 本地持久化，§二十一 S-04）；**不进存档（SaveRecord）**、不进 prompt 快照、不进导出、不进遥测。**不如此放宽**，则每次会话须重填密钥，与 P0-4「手机上打开就能玩」直接冲突
- **错误语义**：**降级**（对玩家可见）：上游 4xx/5xx、超时、流中断按 LL-19 统一错误表处理；**报错**（对开发者）：key 出现在**服务端持久层 / 日志 / 存档 / prompt 快照 / 导出**中即测试失败（客户端本地设置区、内存中本次请求副本除外）
- **读域 / 写域**：无游戏状态；只读写请求/响应
- **确定性要求**：不适用（外部 IO 层）；但错误分类必须确定（LL-19 表枚举）
- **扩展方式**：新增端点 = 先改本表 ＋ LL-10/LL-11 契约 ＋ 断言；禁止在函数内引入游戏逻辑（引擎不碰网络）
- **校验**：`smoke-proxy`（承 §3.2 第 1 层完成判据）＋ LL-10/LL-11 断言


#### LL-10 `/api/chat` 代理契约 ｜ 生效（**v2.0 新增，v1.0 只到层名**）

- **稳定 ID**：`LL-10`
- **所属层 · 文件路径**：`functions/api/chat.ts`（Cloudflare Function）——**不属 L0–L8**（承 §十六 `L-01` 表外路径），**不得被 `src/` 反向 import**
- **请求**：

  ```ts
  interface ChatRequest {
    upstream: { baseUrl: string; model: string }   // 玩家自填端点（§二十一 S-04）
    messages: ChatMessage[]
    stream: true                                    // 本代理只支持流式
    temperature?: number                            // 由 LL-14 按模式传入
    maxTokens?: number                              // 由 LL-13 预算档位传入
    includeUsage?: boolean                           // LL-17 实测 opt-in；默认省略，不支持时不自动重发
  }
  // key 走请求头 X-Vic-Upstream-Key：不放 URL、不放 query、不放 body
  ```

- **响应**：`Content-Type: text/event-stream`；**逐帧透传**上游 `data:` 行；以 `data: [DONE]` 结束；首帧前不缓冲（首个 token 直出）
- **usage 可选元数据**：仅 `includeUsage === true` 时向上游附 `stream_options: { include_usage: true }`；false/省略保持原请求形状，非 boolean 在联网前拒绝。上游不支持时沿既有错误分类降级，不探测、不自动删参数重发；messages、温度、预算、同源出口与 key 通道均不变。上游 usage 帧同正文逐帧透传，不在代理中重新计量（2026-09-18 VS-01 计量纠偏；`LLM-35`）。
- **SSRF 防护**（承 §3.2 第 1 层「SSRF」命名，v2.0 补齐判定式）：

| # | 规则 |
|---|---|
| 1 | 仅接受 `https:`；`http:` **仅**允许 `localhost` / `127.0.0.1`（本机模型，初值） |
| 2 | 解析后的 IP **禁止**私网与保留段：RFC1918、link-local `169.254/16`（含元数据端点 `169.254.169.254`）、CGNAT `100.64/10`、IPv6 ULA／link-local、`0.0.0.0` |
| 3 | **禁重定向跟随**（`redirect: 'manual'`）；上游 3xx 一律按错误处理 |
| 4 | 禁非 HTTP 协议（`file:` / `gopher:` / `data:` / `ftp:` 等） |
| 5 | 域名解析走 **DoH 解析链**（`LL-11`）；**判定用解析结果 IP，连接也用同一 IP**——防 DNS rebinding（判定与连接不同源是此类绕过的唯一成因） |

- **超时与重试**（初值）：

| 项 | 值 | 说明 |
|---|---|---|
| 首字节超时 | 30 s | 之后按 `timeout` 分类 |
| 流中断 | **不重试** | 避免重复计费与叙事重复；已收块照常处理（`LL-02` 不变量 1） |
| 连接失败（DNS／TLS／连接拒绝） | 重试 **≤ 1 次** | 纯网络层，不涉及状态，不引入不确定性 |
- **不变量**：
  1. **同源独占**（`TEC-03` 不变量 2）：前端只请求本站 `/api/*`
  2. 代理**不含任何游戏逻辑**——纯转发 ＋ 防护（`TEC-03` 扩展方式「禁止在函数内引入游戏逻辑」）
  3. **key 服务端零留存**（`TEC-03` 不变量 3）：请求结束即不保留；**不写入**日志（`Authorization` 与 `X-Vic-Upstream-Key` 双屏蔽）
  4. **不改写上游内容**：不做注入、不做截断、不做改写——截断只发生在客户端预算层（`LL-13`）
  5. **不回传上游原始错误体**（防泄露）；只回传**分类码**（`LL-19`）＋ 可展示消息
- **错误语义**：**降级**——按 `LL-19` 统一表返回分类码；代理自身永不 500 给玩家看原始堆栈
- **读域 / 写域**：无游戏状态（只读写请求／响应）
- **确定性要求**：不适用（外部 IO）；但**错误分类必须确定**（同响应同分类）
- **扩展方式**：新增端点 = 先改 `TEC-03` 表 ＋ 本契约／`LL-11` ＋ 断言；新增请求字段 = **契约变更**（须同步 `LL-12`／`LL-13`／`LL-14` 中谁产出它）
- **校验**：`smoke-proxy`（承 §3.2 第 1 层完成判据）＋ `LLM-9`（SSRF 样本全灭）＋ `LLM-10`（流中断语义）＋ `LLM-12`（日志无 key）＋ `LLM-22`（网络出口封闭性）＋ `LLM-30`（重试纪律）

#### LL-11 `/api/models` ＋ `middleware` ＋ DoH 解析链 ｜ 生效（**v2.0 新增**）

- **稳定 ID**：`LL-11`
- **所属层 · 文件路径**：`functions/_middleware.ts`、`functions/api/models.ts`、DoH 解析器（`functions/` 内）

| 组件 | 签名 | 职责 |
|---|---|---|
| `_middleware` | `onRequest(ctx, next)` | **所有 `/api/*` 的必经前置**：Origin 校验 ＋ CORS 头 ＋ `Vary: Origin` |
| `/api/models` | `GET` | 上游 `/v1/models` 代理：只透传 `id` / `owned_by` 等**非敏感字段** |
| DoH 链 | 顺序尝试三解析器 | `dns.google` → `cloudflare-dns.com` → 备用；供 `LL-10` 规则 5 使用 |

- **不变量**：
  1. `/api/*` **无绕过路径**——`_middleware` 是 Cloudflare Functions 的必经语义，端点自身**不重复**做 Origin 校验（防双份判定漂移）
  2. CORS 头**只回白名单源的精确值**，**绝不**回 `*`；白名单 = 本站源 ＋ 开发期 `localhost`（初值，随部署域配置）
  3. 非白名单 Origin → **403，且不进入端点函数**（不消耗上游配额）
  4. `/api/models` **不回传**任何 key 相关字段；上游不支持该端点 → 返回**空列表 ＋ 分类码**，前端降级为**手填模型名**（不是错误态）
  5. DoH 解析结果**短 TTL 缓存**（初值 60 s）；三解析器全失败 → 系统 DNS 兜底 ＋ 注记（**降级**，不是拒绝请求）
- **错误语义**：**拒绝**（Origin）／**降级**（模型列表空、DoH 兜底）
- **读域 / 写域**：无游戏状态
- **确定性要求**：不适用；错误分类确定
- **扩展方式**：加解析器 = 改本表 ＋ 解析链顺序断言；**不得**为某个上游加特例转发规则（特例＝第二套代理语义）
- **校验**：`LLM-11`（Origin 拒绝 ＋ CORS 不回 `*`）＋ `LLM-21`（DoH 降级链：前两失败 → 第三成功；全失败 → 系统 DNS 兜底）＋ `smoke-proxy`

