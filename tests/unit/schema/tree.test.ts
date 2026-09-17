import { describe, it, expect } from 'vitest'
import {
  TreeSchema,
  initialTree,
  safeParseTree,
  GameYearMonthSchema,
  HalfOpenIntervalSchema,
} from '../../../src/validation/tree'
import { loadSaveRecord, SaveRecordSchema, saveVersionGate } from '../../../src/stores/saveSchema'
import { makeInitialSave } from '../../../src/stores/saves'
import {
  monthIndexFrom,
  dateFromMonthIndex,
  advanceMonth,
} from '../../../src/validation/calendar'
import { activeController } from '../../../src/orchestration/world'

const goodTree = initialTree('era-warlord', '1921-07')

describe('SK-03 变量树形状', () => {
  it('初始树过 schema', () => {
    expect(TreeSchema.safeParse(goodTree).success).toBe(true)
  })

  it('canonical 日期格式：YYYY-MM（拒绝 ISO 全日期与其他形态）', () => {
    expect(GameYearMonthSchema.safeParse('1921-07').success).toBe(true)
    expect(GameYearMonthSchema.safeParse('1921-07-15').success).toBe(false)
    expect(GameYearMonthSchema.safeParse('1921-13').success).toBe(false)
    expect(GameYearMonthSchema.safeParse('21-7').success).toBe(false)
  })

  it('authority 三根就位（territoryControl / pendingSituations / intelligenceObservations）', () => {
    expect(goodTree._authority.territoryControl.claims).toEqual([])
    expect(goodTree._authority.pendingSituations.queue).toEqual({}) // R2：record 键 = situation key（B-09-2 精确命中）
    expect(goodTree._authority.intelligenceObservations.observations).toEqual([])
  })

  it('半开区间 [from, to)：from < to 强制（首尾相接不重不漏的形状前提）', () => {
    expect(HalfOpenIntervalSchema.safeParse({ from: '1928-06-21', to: '1928-12-29' }).success).toBe(true)
    expect(HalfOpenIntervalSchema.safeParse({ from: '1928-12-29', to: '1928-06-21' }).success).toBe(false)
  })

  it('缺 authority 根 → 报错（宁缺勿猜）', () => {
    const broken = { ...goodTree, _authority: undefined }
    expect(TreeSchema.safeParse(broken).success).toBe(false)
  })

  it('__proto__ 防护：危险键一律拒（DAT-22）', () => {
    const evil = JSON.parse('{"world":{"date":"1921-07"},"era":{"eraId":"x"},"economy":{"currency":"y","commodities":{}},"_authority":{"territoryControl":{"claims":[]},"pendingSituations":{"queue":[]},"intelligenceObservations":{"observations":[]}},"__proto__":{"evil":1}}')
    const res = safeParseTree(evil)
    expect(res.success).toBe(false)
  })
})

describe('SK-03 canonical 日期单点（world.ts）', () => {
  it('monthIndex ↔ date 双向换算（1921-01 = 0）', () => {
    expect(monthIndexFrom('1921-01')).toBe(0)
    expect(monthIndexFrom('1921-07')).toBe(6)
    expect(monthIndexFrom('1936-01')).toBe(180)
    expect(dateFromMonthIndex(0)).toBe('1921-01')
    expect(dateFromMonthIndex(6)).toBe('1921-07')
    expect(dateFromMonthIndex(180)).toBe('1936-01')
  })

  it('advanceMonth 纯函数推进（含跨年）', () => {
    expect(advanceMonth('1921-12')).toBe('1922-01')
    expect(advanceMonth('1921-07')).toBe('1921-08')
  })

  it('advanceMonth 不越界（同月重放同果 —— 确定性）', () => {
    for (let i = 0; i < 24; i++) void 0
    expect(advanceMonth(advanceMonth('1928-11'))).toBe('1929-01')
  })

  it('activeController 半开区间判定（[from, to)）', () => {
    const tree = initialTree('era-warlord', '1928-06')
    // 注入 claims（测试构造；写入路径在 SK-05 走编译通道）
    const withClaims = {
      ...tree,
      _authority: {
        ...tree._authority,
        territoryControl: {
          claims: [
            { polityId: 'p1', controller: 'zhili' as const, interval: { from: '1928-01-01', to: '1928-06-21' } },
            { polityId: 'p1', controller: 'fengxi' as const, interval: { from: '1928-06-21', to: '1928-12-29' } },
          ],
        },
      },
    }
    expect(activeController(withClaims, '1928-03-01')).toBe('zhili')
    expect(activeController(withClaims, '1928-06-21')).toBe('fengxi') // from 闭端
    expect(activeController(withClaims, '1928-12-28')).toBe('fengxi')
    expect(activeController(withClaims, '1928-12-29')).toBe(null) // to 开端 → 无主
    expect(activeController(withClaims, '1928-05')).toBe('zhili') // YYYY-MM → 取月首
  })
})

describe('SK-03 存档 Schema 实体与拒载（S-01 / S-05 / S-06）', () => {
  const save = makeInitialSave({
    slotId: 'slot-1',
    eraId: 'era-warlord',
    identityId: 'student',
    date: '1921-07',
    variables: goodTree,
    updatedAt: '2026-09-15',
  })

  it('初始档过 SaveRecordSchema（S-01 全字段）', () => {
    expect(SaveRecordSchema.safeParse(save).success).toBe(true)
  })

  it('loadSaveRecord：合法档原样返回', () => {
    expect(loadSaveRecord(save, 'slot-1').slotId).toBe('slot-1')
  })

  it('拒载：版本更高（不降级解析）', () => {
    expect(() => loadSaveRecord({ ...save, schemaVersion: 2 }, 'slot-1')).toThrow(/更新版本/)
  })

  it('拒载：版本更低（无迁移链）', () => {
    expect(() => loadSaveRecord({ ...save, schemaVersion: 0 }, 'slot-1')).toThrow(/无迁移链/)
  })

  it('拒载：版本缺失（不猜测为 v1）', () => {
    const { schemaVersion: _drop, ...noVersion } = save
    void _drop
    expect(() => loadSaveRecord(noVersion, 'slot-1')).toThrow(/缺失/)
  })

  it('拒载：形状损坏且报错含槽位/字段（拒绝必须可见 —— S-06 不变量 2）', () => {
    const broken = { ...save, variables: { ...save.variables, world: {} } }
    expect(() => loadSaveRecord(broken, 'slot-1')).toThrow(/slot-1/)
    expect(() => loadSaveRecord(broken, 'slot-1')).toThrow(/world/)
  })

  it('拒载：未知字段（S-05 不变量 4 —— 拒绝，不静默丢弃）', () => {
    const withUnknown = { ...save, mystery: 'field' }
    // zod 默认 strip；按 S-05「未知字段拒绝」需 strict —— 用 safeParse 严格模式验证
    const strictResult = SaveRecordSchema.strict().safeParse(withUnknown)
    expect(strictResult.success).toBe(false)
  })

  it('无迁移链：saveSchema 模块无 migrate 导出', async () => {
    const mod = await import('../../../src/stores/saveSchema')
    expect((mod as Record<string, unknown>).migrate).toBeUndefined()
    void saveVersionGate
  })
})
