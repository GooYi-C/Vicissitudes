// src/validation/dataSchemas.ts — L0 十六表 Zod Schema（§十七 D-04）
// 唯一事实源：每表的 Schema 在此定义；表级契约见 REBUILD.md §十七 D-04 第三列。
// 「建表先建 schema」：schema 未定不得写数据文件（十七.0 铁律 2）。

import { z } from 'zod'

// ── L0-01 eras ─────────────────────────────────────────────────────
export const EraSchema = z.object({
  id: z.string().regex(/^era-[a-z]+$/, 'era id：era-<slug>'),
  name: z.string().min(1),
  fromYear: z.number().int().min(1921).max(1949),
  toYear: z.number().int().min(1921).max(1949),
  // 开局月：该时代的起始月份（1-12）。世界开局日 = fromYear + startMonth。
  // 依据 §二十七 施工卷「五时代开局日各推 12 月」与 REBUILD.md:367 第 4 条
  // 「时代表与时间线不得漂移：每条『开局那天的世界』= 时间线在该日期的状态查询」。
  // 取值为史实锚定（见 data/eras.ts 逐条注），非运行时随 era 分支的行为参数：
  // 运行时行为一律由 world.date 推导，era 字段仅此一处参与开局定日。
  startMonth: z.number().int().min(1).max(12),
  desc: z.string().min(1),
})
export type Era = z.infer<typeof EraSchema>

// ── L0-02 identities（5 era × 8 identity = 40 组合）──────────────────
export const IDENTITY_KINDS = ['student', 'worker', 'merchant', 'journalist', 'soldier', 'teacher', 'doctor', 'industrialist'] as const
export const IdentitySchema = z.object({
  id: z.string().regex(/^id-[a-z]+-[a-z]+$/, 'identity id：id-<era-slug>-<kind>'),
  eraId: z.string(),
  kind: z.enum(IDENTITY_KINDS),
  name: z.string().min(1),
  startMoney: z.number().int().min(0), // 量级纪律（DAT-07）：学生/工人 ≤5、实业家 ≤200
  startCity: z.string(),
  // 开局即控制 startCity 与否 —— 用户口径：「玩家开局不一定控制城，要看开局设定如何选择」。
  // 默认 false：不写字段者即开局无控制城（occupation 的邻接前置由此决定通不通）。
  startsWithControl: z.boolean().default(false),
  desc: z.string().min(1),
})
export type Identity = z.infer<typeof IdentitySchema>

// ── L0-03 talents ──────────────────────────────────────────────────
export const TalentSchema = z.object({
  id: z.string().regex(/^talent-[a-z0-9-]+$/),
  name: z.string().min(1),
  desc: z.string().min(1),
  effects: z.array(z.object({ op: z.string(), args: z.record(z.string(), z.unknown()) })).max(8),
  mutuallyExclusiveWith: z.array(z.string()).default([]),
})
export type Talent = z.infer<typeof TalentSchema>

// ── L0-04 cities（10 isCore + ≤5 isOverseasPort；六维 ∈ [0,100]）────
export const CityDimSchema = z.number().int().min(0).max(100)
export const CitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'city id：小写英文 slug'),
  name: z.string().min(1),
  provinceId: z.string().min(1).regex(/^(eu4|vic)\./),
  isCore: z.boolean(),
  isOverseasPort: z.boolean(),
  specialty: z.string(), // 命中 commodities.id（DAT-02）
  dims: z.object({
    economy: CityDimSchema,
    security: CityDimSchema,
    culture: CityDimSchema,
    transport: CityDimSchema,
    industry: CityDimSchema,
    population: CityDimSchema,
  }),
})
export type City = z.infer<typeof CitySchema>

// ── L0-05 transport（20 条含 5 exit；图连通性 DAT-09）───────────────
export const TransportLineSchema = z.object({
  id: z.string().regex(/^line-[a-z0-9-]+$/),
  from: z.string(), // 命中 cities.id（DAT-03）
  to: z.string(),
  kind: z.enum(['rail', 'water', 'road', 'exit']),
  days: z.number().int().min(1).max(30),
  baseCost: z.number().int().min(0),
})
export type TransportLine = z.infer<typeof TransportLineSchema>

// ── L0-06 commodities（18 条；basePrice ↔ systemPrompt 物价锚一致 DAT-10）──
export const CommoditySchema = z.object({
  id: z.string().regex(/^cmd-[a-z0-9-]+$/),
  name: z.string().min(1),
  basePrice: z.number().int().min(1).max(1000),
  unit: z.string().min(1),
  resourceMapped: z.boolean().default(false), // true 则不进 TRADE_GOODS（DAT-10）
})
export type Commodity = z.infer<typeof CommoditySchema>

// ── L0-07 business（8 条；produces/consumes 可解析且 consumes 链无环 DAT-11）──
export const BusinessSchema = z.object({
  id: z.string().regex(/^biz-[a-z0-9-]+$/),
  name: z.string().min(1),
  produces: z.array(z.string()).default([]), // 报馆条目留空（§0.3-E8 暂缓）
  consumes: z.array(z.string()).default([]),
  capitalMin: z.number().int().min(0),
  desc: z.string().min(1),
})
export type Business = z.infer<typeof BusinessSchema>

// ── L0-08 timeline（ISO 日期；themes 落氛围词表 DAT-04）───────────────
export const TIMELINE_THEMES = ['war', 'politics', 'economy', 'culture', 'diplomacy', 'uprising', 'disaster', 'technology'] as const
export const TimelineEntrySchema = z.object({
  id: z.string().regex(/^tl-[a-z0-9-]+$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO 日期'),
  title: z.string().min(1),
  themes: z.array(z.enum(TIMELINE_THEMES)).min(1),
  windowMonths: z.number().int().min(1).max(12),
  intervene: z.object({
    requires: z.array(z.unknown()).default([]), // 机器可判定谓词数组（DAT-12 可求值）
  }).default({ requires: [] }),
})
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>

// ── L0-09 political（1936 锚点 + 覆盖层；四守卫 DAT-13）──────────────
export const PoliticalTimelineOverlaySchema = z.object({
  id: z.string().min(1),
  coverage: z.object({ from: z.string(), to: z.string() }),
  groups: z.array(
    z.object({
      groupId: z.string().min(1),
      polities: z.array(
        z.object({
          polityId: z.string().min(1),
          from: z.string(),
          to: z.string(),
          controller: z.string().min(1),
        }),
      ),
    }),
  ),
})
export type PoliticalTimelineOverlay = z.infer<typeof PoliticalTimelineOverlaySchema>

// ── L0-10 toponyms（同 provinceId 区间不重叠 DAT-14）──────────────────
export const ToponymSchema = z.object({
  id: z.string().regex(/^topo-[a-z0-9-]+$/),
  provinceId: z.string().min(1),
  name: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type Toponym = z.infer<typeof ToponymSchema>

// ── L0-11 prologue（5 段；text 200–400 字；零人物字段写入 DAT-15）──────
export const PrologueSchema = z.object({
  eraId: z.string().min(1),
  order: z.number().int().min(1).max(5),
  text: z.string().min(200).max(400),
})
export type Prologue = z.infer<typeof PrologueSchema>

// ── L0-12 worldbook ────────────────────────────────────────────────
export const WorldbookEntrySchema = z.object({
  id: z.string().regex(/^wb-[a-z0-9-]+$/),
  title: z.string().min(1),
  tags: z.array(z.string()).min(1),
  content: z.string().min(1),
})
export type WorldbookEntry = z.infer<typeof WorldbookEntrySchema>

// ── L0-13 newspapers（city 可解析 L0-04；stance 五类 DAT-16）───────────
export const NEWSPAPER_STANCES = ['zhili', 'fengxi', 'zhiyuan', 'guomin', 'neutral'] as const
export const NewspaperSchema = z.object({
  id: z.string().regex(/^paper-[a-z0-9-]+$/),
  name: z.string().min(1),
  city: z.string(),
  stance: z.object({
    politics: z.enum(NEWSPAPER_STANCES),
    credibility: z.number().int().min(1).max(5),
  }),
  eraRange: z.tuple([z.number().int(), z.number().int()]),
})
export type Newspaper = z.infer<typeof NewspaperSchema>

// ── L0-14 achievements（17 条；跨档保留——id 冻结级）───────────────────
export const AchievementSchema = z.object({
  id: z.string().regex(/^ach-[a-z0-9-]+$/),
  name: z.string().min(1),
  condition: z.string().min(1), // 检测语义描述（非空）
  desc: z.string().min(1),
})
export type Achievement = z.infer<typeof AchievementSchema>

// ── L0-15 events（§8.2；options 2–4；每 option effects ≤ 8）───────────
export const EventEffectSchema = z.object({
  op: z.string().min(1), // 受限指令集（复用 DomainOp 语义；DAT-08/17 与 resolver 同源）
  args: z.record(z.string(), z.unknown()),
})
export const WhenSchema = z.object({
  eras: z.array(z.tuple([z.number(), z.number()])).default([]), // 区间数组（双窗口原生支持）
  cities: z.array(z.string()).default([]),
  requires: z.array(z.unknown()).default([]), // 显式登记门槛（无则空数组，不得省略字段）
  requiresForces: z.array(z.unknown()).default([]),
})
export const EventOptionSchema = z.object({
  text: z.string().min(1),
  effects: z.array(EventEffectSchema).max(8),
})
export const EventDefSchema = z.object({
  id: z.string().regex(/^evt-[a-z0-9-]+$/),
  title: z.string().min(1),
  desc: z.string().min(1),
  tags: z.array(z.string()).min(1),
  weight: z.number().int().min(1).max(100),
  cooldownMonths: z.number().int().min(0).max(120).default(0),
  when: WhenSchema,
  options: z.array(EventOptionSchema).min(2).max(4),
  followUp: z.string().nullable().default(null), // 声明则必须可接线（B-08 不变量 5）
})
export type EventDef = z.infer<typeof EventDefSchema>

// ── L0-16 situationTemplates（模板侧；合池权重 0.5×）──────────────────
// id 前缀独立（tmpl-）；其余形状与事件同（同池同 schema 家族）
export const SituationTemplateSchema = EventDefSchema.extend({
  id: z.string().regex(/^tmpl-[a-z0-9-]+$/, '模板 id：tmpl-<slug>'),
})
export type SituationTemplate = z.infer<typeof SituationTemplateSchema>

// ── 内容包清单（D-01）──────────────────────────────────────────────
export const CONTENT_SCHEMA_VERSION = 1 // SCHEMA_VERSION（与 SAVE_SCHEMA_VERSION 独立）
export type TableId = 'L0-01' | 'L0-02' | 'L0-03' | 'L0-04' | 'L0-05' | 'L0-06' | 'L0-07' | 'L0-08' | 'L0-09' | 'L0-10' | 'L0-11' | 'L0-12' | 'L0-13' | 'L0-14' | 'L0-15' | 'L0-16'
export const TABLE_IDS: readonly TableId[] = Array.from({ length: 16 }, (_, i) => `L0-${String(i + 1).padStart(2, '0')}`) as TableId[]

export const ContentPackManifestSchema = z.object({
  id: z.string().regex(/^vic:content:[a-z-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  tables: z.array(z.enum(TABLE_IDS as [TableId, ...TableId[]])).max(16),
  hash: z.record(z.enum(TABLE_IDS as [TableId, ...TableId[]]), z.string()),
})
export type ContentPackManifest = z.infer<typeof ContentPackManifestSchema>
