// 开局设定（LAUNCH-01）回归：身份进树、开局现银、开局城、以及城级控制权查询。
// 依据用户口径 2026-09-23：「先只定开局城市与身份，控制城与否由设定决定」。
import { describe, it, expect } from 'vitest'
import { startGame, resolveOpeningSetup, StartGameError } from '../../../src/gameCommands'
import { tickWorld } from '../../../src/turn/monthRunner'
import { initialTree, activeControllerForCity, TreeSchema, type Tree } from '../../../src/validation/tree'
import { identities } from '../../../src/data/identities'
import { cities } from '../../../src/data/cities'
import { SaveRecordSchema } from '../../../src/stores/saveSchema'
import { makeInitialSave } from '../../../src/stores/saves'

describe('LAUNCH-01 开局设定：身份随开局写入运行树', () => {
  it('startGame 把身份/开局城/开局现银写进树（原先 identityId 被丢弃）', () => {
    const { variables } = startGame({ eraId: 'era-warlord', identityId: 'id-warlord-industrialist', date: '1921-07' })
    expect(variables.identity).toEqual({ id: 'id-warlord-industrialist', kind: 'industrialist', startCity: 'tianjin' })
    expect(variables.career.money).toBe(200) // L0-02 startMoney（DAT-07 上界）
    expect(variables.era.eraId).toBe('era-warlord')
    expect(variables.world.date).toBe('1921-07')
  })

  it('开局现银逐条取自身份表（不是命令层常量）', () => {
    for (const row of identities) {
      const { variables } = startGame({ eraId: row.eraId, identityId: row.id, date: '1921-07' })
      expect(variables.career.money).toBe(row.startMoney)
      expect(variables.identity?.startCity).toBe(row.startCity)
    }
  })

  it('身份与时代必须匹配：跨时代身份拒绝开局（不猜默认身份）', () => {
    expect(() => startGame({ eraId: 'era-warlord', identityId: 'id-nanjing-student', date: '1921-07' })).toThrow(StartGameError)
    expect(() => resolveOpeningSetup({ eraId: 'era-warlord', identityId: 'id-nanjing-student' })).toThrow(/不匹配/)
  })

  it('身份 id 必须存在：kind 词（如 student）不再被接受', () => {
    expect(() => resolveOpeningSetup({ eraId: 'era-warlord', identityId: 'student' })).toThrow(/未知身份/)
  })

  it('未给开局设定时树内 identity = null（旧档路径显式，不猜默认身份）', () => {
    const tree = initialTree('era-warlord', '1921-07')
    expect(tree.identity).toBeNull()
    expect(tree.career.money).toBe(0)
    expect(tree._authority.territoryControl.claims).toEqual([])
    expect(tree.fiscal.cities).toEqual({})
  })

  it('开局设定随树持久化：SaveRecord 往返后身份不丢', () => {
    const { variables } = startGame({ eraId: 'era-warlord', identityId: 'id-warlord-merchant', date: '1921-07' })
    const record = makeInitialSave({
      slotId: 'slot-1',
      eraId: variables.era.eraId,
      identityId: variables.identity?.id ?? '',
      date: variables.world.date,
      variables,
      updatedAt: variables.world.date,
    })
    const roundTrip = SaveRecordSchema.parse(JSON.parse(JSON.stringify(record)))
    expect(roundTrip.variables.identity).toEqual({ id: 'id-warlord-merchant', kind: 'merchant', startCity: 'shanghai' })
    expect(roundTrip.variables.career.money).toBe(50)
    expect(roundTrip.meta.identityId).toBe('id-warlord-merchant')
  })

  it('旧档（树内无 identity 域）仍可载入：schema default 生效，身份为 null', () => {
    const { variables } = startGame({ eraId: 'era-warlord', identityId: 'id-warlord-student', date: '1921-07' })
    const legacy = JSON.parse(JSON.stringify(variables)) as Record<string, unknown>
    delete legacy.identity
    expect(TreeSchema.safeParse(legacy).success).toBe(true)
    expect(TreeSchema.parse(legacy).identity).toBeNull()
  })

  it('旧档 meta.identityId 的旧口径（kind 词，如 student）仍过 SaveRecordSchema', () => {
    const { variables } = startGame({ eraId: 'era-warlord', identityId: 'id-warlord-student', date: '1921-07' })
    const record = makeInitialSave({
      slotId: 'slot-1', eraId: 'era-warlord', identityId: 'student', date: '1921-07', variables, updatedAt: '1921-07',
    })
    expect(SaveRecordSchema.safeParse(record).success).toBe(true)
    // meta.identityId 保持非空（S-01 原口径）：真实出身以树内 identity 为准，meta 只是显示面
    expect(SaveRecordSchema.safeParse(makeInitialSave({
      slotId: 'slot-1', eraId: 'era-warlord', identityId: '', date: '1921-07', variables, updatedAt: '1921-07',
    })).success).toBe(false)
  })
})

describe('LAUNCH-02 开局控城与否由开局设定决定', () => {
  const setupFor = (startsWithControl: boolean) =>
    initialTree('era-warlord', '1921-07', {
      identity: { id: 'id-warlord-soldier', kind: 'soldier', startCity: 'wuhan' },
      startMoney: 15,
      startsWithControl,
    })

  it('startsWithControl=false（现表口径）：不落 claim、不建控城账 —— 邻接前置由此不通', () => {
    const tree = setupFor(false)
    expect(tree._authority.territoryControl.claims).toEqual([])
    expect(tree.fiscal.cities).toEqual({})
    expect(activeControllerForCity(tree, 'wuhan', '1921-07')).toBeNull()
  })

  it('startsWithControl=true：claim 落该城所在省，控制者 player，控城账同时建行', () => {
    const tree = setupFor(true)
    const wuhan = cities.find((c) => c.id === 'wuhan')
    expect(tree._authority.territoryControl.claims).toEqual([
      { polityId: wuhan?.provinceId, controller: 'player', interval: { from: '1921-07-01', to: '1950-01-01' } },
    ])
    expect(activeControllerForCity(tree, 'wuhan', '1921-07')).toBe('player')
    expect(Object.keys(tree.fiscal.cities)).toEqual(['wuhan'])
    // 半开区间：1950-01-01 起不再控制
    expect(activeControllerForCity(tree, 'wuhan', '1950-01')).toBeNull()
  })

  it('开局城必须在城市表内才落 claim（未知 startCity 不产生空省 claim）', () => {
    const tree = initialTree('era-warlord', '1921-07', {
      identity: { id: 'id-warlord-student', kind: 'student', startCity: 'atlantis' },
      startMoney: 5,
      startsWithControl: true,
    })
    expect(tree._authority.territoryControl.claims).toEqual([])
    expect(tree.fiscal.cities).toEqual({})
  })
})

describe('LAUNCH-04 开局控城账活过首月（fiscal #7 早于 worldtick #8 的次序缺陷）', () => {
  const controllerTree = () =>
    initialTree('era-warlord', '1921-07', {
      identity: { id: 'id-warlord-industrialist', kind: 'industrialist', startCity: 'tianjin' },
      startMoney: 200,
      startsWithControl: true,
    })

  it('开局 map 空、控城账有行：过一月后账不得被全量 replace 清掉', () => {
    const start = controllerTree()
    expect(Object.keys(start.map)).toHaveLength(0)
    expect(Object.keys(start.fiscal.cities)).toEqual(['tianjin'])

    const month1 = tickWorld(start)
    expect(month1.ok).toBe(true)
    const after1 = month1.state as Tree
    expect(Object.keys(after1.map).length).toBeGreaterThan(0) // worldtick 首月播种了六维
    // 修复前：本模块先跑、map 无该城即 continue ⇒ fiscalPost 全量 replace 把该行删掉 ⇒ 控城终身零收益
    expect(Object.keys(after1.fiscal.cities)).toEqual(['tianjin'])
  })

  it('第二月按公式出账（lastRevenue 为有限数，且被 settlement 消费）', () => {
    const month1 = tickWorld(controllerTree())
    const month2 = tickWorld(month1.state as Tree)
    expect(month2.ok).toBe(true)
    const after2 = month2.state as Tree
    const tianjin = after2.fiscal.cities['tianjin']
    expect(tianjin).toBeDefined()
    expect(Number.isFinite(tianjin.lastRevenue)).toBe(true)
    expect(tianjin.taxBase).toBeGreaterThan(0) // 由城表 economy×2 推算，非开局常量
  })
})

describe('LAUNCH-03 activeControllerForCity：claim 的 polityId 是省 id，逐城查询必须过滤本省', () => {
  const withClaims = (): Tree => ({
    ...initialTree('era-warlord', '1921-07'),
    _authority: {
      territoryControl: {
        claims: [
          // 上海的省 = vic.jiangsu（与南京同省）；天津的省 = vic.zhili
          { polityId: 'vic.zhili', controller: 'zhili' as const, interval: { from: '1921-01-01', to: '1930-01-01' } },
          { polityId: 'vic.jiangsu', controller: 'player' as const, interval: { from: '1921-01-01', to: '1950-01-01' } },
        ],
      },
      pendingSituations: { queue: {} },
      intelligenceObservations: { observations: [] },
    },
  })

  it('外省 claim 不得影响本城控制权（修复前：按日期取最后一条 claim，天津会被判成 player）', () => {
    const tree = withClaims()
    expect(activeControllerForCity(tree, 'tianjin', '1921-07')).toBe('zhili')
    expect(activeControllerForCity(tree, 'shanghai', '1921-07')).toBe('player')
    expect(activeControllerForCity(tree, 'nanjing', '1921-07')).toBe('player') // 与上海同省
  })

  it('未知城市返回 null（拒载不猜测）', () => {
    expect(activeControllerForCity(withClaims(), 'atlantis', '1921-07')).toBeNull()
  })

  it('玩家 claim 优先于同省史实 claim（史实是追加写，不得无声夺走玩家的城）', () => {
    const tree: Tree = {
      ...initialTree('era-warlord', '1921-07'),
      _authority: {
        territoryControl: {
          claims: [
            // 开局控城先落，史实模块随后追加同省 claim（上海市 = vic.jiangsu）
            { polityId: 'vic.jiangsu', controller: 'player' as const, interval: { from: '1921-07-01', to: '1950-01-01' } },
            { polityId: 'vic.jiangsu', controller: 'guomin' as const, interval: { from: '1936-01-01', to: '1937-01-01' } },
          ],
        },
        pendingSituations: { queue: {} },
        intelligenceObservations: { observations: [] },
      },
    }
    expect(activeControllerForCity(tree, 'shanghai', '1936-06')).toBe('player')
    // 玩家 claim 区间之外（1950-01 起）则回落到史实/无主
    expect(activeControllerForCity(tree, 'shanghai', '1950-01')).toBeNull()
  })

  it('半开区间与 YYYY-MM 取月首口径与 activeController 一致', () => {
    const tree = withClaims()
    expect(activeControllerForCity(tree, 'tianjin', '1930-01')).toBeNull() // to 开端
    expect(activeControllerForCity(tree, 'tianjin', '1929-12')).toBe('zhili')
  })
})
