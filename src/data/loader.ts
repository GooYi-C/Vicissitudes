// src/data/loader.ts — L0 加载器（§十七 D-06）
// IO 唯一入口原则的 L0 侧：全部静态 import（不发网络请求）；
// 版本门三检（D-02：版本/缺表/hash）——均无降级分支；
// 返回深冻结 LoadedData（DAT-18：运行期写入即抛错）；键序固定 L0-01～L0-16（DAT-20）。

import { createHash } from 'node:crypto'
import { eras } from './eras'
import { identities } from './identities'
import { talents } from './talents'
import { cities } from './cities'
import { transport } from './transport'
import { commodities, PRICE_ANCHORS } from './commodities'
import { business } from './business'
import { timeline } from './timeline'
import political1936 from './political-1936.json'
import { toponyms } from './toponyms'
import { prologue } from './prologue'
import { worldbook } from './worldbook'
import { newspapers } from './newspapers'
import { achievements } from './achievements'
import { events } from './events'
import { situationTemplates } from './situationTemplates'
import { ContentPackManifestSchema, CONTENT_SCHEMA_VERSION, type ContentPackManifest, type TableId } from '../validation/dataSchemas'
import { PoliticalTimelineOverlaySchema } from '../validation/dataSchemas'
import { stableStringify } from '../validation/stableJson'

// 浏览器环境兜底：node:crypto 不可用时用 WebCrypto 同步降级？——不降级（D-03：用 node:crypto 保证跨机一致）。
// Vite 生产构建经 polyfill（见 vite.config optimizeDeps）——SK-06 阶段 hash 计算在 Node 侧
// （pnpm data:hash 与 test:data），浏览器只读清单里的现成 hash，不重算。故此 import 仅测试/构建期生效。

export interface LoadedData {
  readonly 'L0-01': typeof eras
  readonly 'L0-02': typeof identities
  readonly 'L0-03': typeof talents
  readonly 'L0-04': typeof cities
  readonly 'L0-05': typeof transport
  readonly 'L0-06': typeof commodities
  readonly 'L0-07': typeof business
  readonly 'L0-08': typeof timeline
  readonly 'L0-09': readonly unknown[]
  readonly 'L0-10': typeof toponyms
  readonly 'L0-11': typeof prologue
  readonly 'L0-12': typeof worldbook
  readonly 'L0-13': typeof newspapers
  readonly 'L0-14': typeof achievements
  readonly 'L0-15': typeof events
  readonly 'L0-16': typeof situationTemplates
}

export const BASE_PACK_ID = 'vic:content:base'

// 政治覆盖层（L0-09）：schema 校验后冻结
const politicalOverlay = Object.freeze([PoliticalTimelineOverlaySchema.parse(political1936)])

export function baseTables(): LoadedData {
  // 键序固定 L0-01 … L0-16（DAT-20：不随文件系统枚举顺序变化）
  return deepFreeze({
    'L0-01': eras,
    'L0-02': identities,
    'L0-03': talents,
    'L0-04': cities,
    'L0-05': transport,
    'L0-06': commodities,
    'L0-07': business,
    'L0-08': timeline,
    'L0-09': politicalOverlay,
    'L0-10': toponyms,
    'L0-11': prologue,
    'L0-12': worldbook,
    'L0-13': newspapers,
    'L0-14': achievements,
    'L0-15': events,
    'L0-16': situationTemplates,
  })
}

// D-03：稳定序列化 hash（键字典序递归；按表 ID 字典序计算）
export function tableHash(id: TableId, data: unknown): string {
  return createHash('sha256').update(stableStringify({ tableId: id, rows: data })).digest('hex')
}

export function computeBaseHashes(): Record<TableId, string> {
  const tables = baseTables()
  const ids = (Object.keys(tables) as TableId[]).sort()
  const out = {} as Record<TableId, string>
  for (const id of ids) out[id] = tableHash(id, tables[id])
  return out
}

// D-02 加载期三检（逐项独立失败，无降级分支）
export function loadContentPack(m: ContentPackManifest): LoadedData {
  // ① 版本检
  if (m.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    throw new Error(`版本检失败：清单 schemaVersion=${m.schemaVersion} ≠ 代码 SCHEMA_VERSION=${CONTENT_SCHEMA_VERSION}（拒载）`)
  }
  // ② 表清单检（基础包必须全集 16 项）
  const required = 16
  if (m.tables.length !== required) {
    throw new Error(`表清单检失败：基础包 tables=${m.tables.length} ≠ ${required}（缺表 = 缺机制，不当空表）`)
  }
  // ③ hash 检
  const tables = baseTables()
  const actual = computeBaseHashes()
  for (const id of m.tables) {
    if (m.hash[id] !== actual[id]) {
      throw new Error(`hash 检失败：表 ${id} 清单 hash ≠ 实际（数据被手改或未跑 pnpm data:hash）`)
    }
  }
  return tables
}

// 清单构造（pnpm data:hash 的写回目标；测试亦用）
export function makeManifest(): ContentPackManifest {
  return ContentPackManifestSchema.parse({
    id: BASE_PACK_ID,
    version: '0.1.0',
    schemaVersion: CONTENT_SCHEMA_VERSION,
    tables: (Object.keys(baseTables()) as TableId[]).sort(),
    hash: computeBaseHashes(),
  })
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key])
    }
    Object.freeze(obj)
  }
  return obj
}

// 物价锚单点（DAT-10 的 systemPrompt 侧引用点）
export { PRICE_ANCHORS }
