// src/engine/crisis.ts — 模块 15：破产/哗变/失城/死亡检测（full；只检测不改写其它模块域——触发经链/命令）。
// EXEMPT:LAYER-006 见 §十六 L-07 豁免表（engine→types 接口定义处，2026-09-15 登记）
// M-03 写域：crisis/*。
//
// 阈值（骨架初值——数值三问：量纲对齐 E-1.2 现金带 / E-0.2 健康线 / E-2.3 兵力台阶 / 六维 [0,100]；
// 复核点 E-4.4 史实锚定校准）：
//   破产 bankruptcy ：career.money < 0（随身现银透支——结算账 settlement 不属本模块读域，边界如实登记）
//   死亡 death      ：career.health ≤ 0（E-0.2 死亡线）
//   哗变 mutiny     ：forces.strength 任一势力兵力 == 0（兵力崩线——玩家兵力域未落树，骨架口径登记；
//                     ri 1945 后系数 0 是不扩军而非归零，不误触）
//   失城 lost-city  ：map 任一城 security ≤ SECURITY_FLOOR（城守瘫线——「失城」的骨架近似；
//                     实控权在链① territoryControl 不属本模块读域，边界如实登记）
// 幂等：同 kind 单档（id = crisis-{kind}-{monthIndex} 首触月）——已入档即不重复；
// 关闭/复位随实体处置通道（范围外，只落账）。
//
// 危机产出可入处境池（R4-4 出口判据）：导出的适配纯函数 crisisToPendingSituation
// 产出过 PendingSituationSchema 的载荷——命令层/叙事侧拿去 situationEnqueue 即可走 B-07
// 通道入池；本模块自身不 enqueue（pendingSituations 不在写域——M-03 红线不越）。

import type { EngineModule, TickContext } from './types'
import type { DomainEffect } from '../validation/effects'
import type { Tree, CrisisRecord, PendingSituation } from '../validation/tree'

export const SECURITY_FLOOR = 10 // 城守瘫线（六维 [0,100]；初值——复核点 E-4.4）

// 危机 → 处境卡载荷适配（纯函数；R4-4 出口判据的落点）。月加运算自足（不进日历库，
// 与 scout 的 isoPlusMonths 同构——小工具双份是层内形状选择，同质断言测试锁）。
export function crisisToPendingSituation(
  record: CrisisRecord,
  arrivedMonth: string, // YYYY-MM（入队月）
  expiryMonths = 2, // 与处境到期窗同带（LL-05 不点即过期）
): PendingSituation {
  const y = Number(arrivedMonth.slice(0, 4))
  const m = Number(arrivedMonth.slice(5, 7))
  const total = y * 12 + (m - 1) + expiryMonths
  const exp = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
  const titles: Record<CrisisRecord['kind'], string> = {
    bankruptcy: '资金链断裂',
    mutiny: '营伍哗变在即',
    'lost-city': '城池失序近乎失守',
    death: '身体垮了',
  }
  const descs: Record<CrisisRecord['kind'], string> = {
    bankruptcy: '随身现银已经透支——要么立刻变现止血，要么等着债主登门。',
    mutiny: '营里断了饷，兵心散了——今夜就可能出事。',
    'lost-city': '城守拖垮了治安，官府已在商量换人——你的势力范围正在松动。',
    death: '健康归零——连站起来都费劲，谈何东山再起。',
  }
  return {
    key: `sit-crisis-${record.kind}-${record.monthIndex}`,
    templateId: `crisis-${record.kind}`, // ∈ 事件/模板 id ∪ sentinel（B-08 快照载荷口径）
    payload: {
      version: 1,
      title: titles[record.kind],
      desc: descs[record.kind],
      options: [
        { text: '想办法渡过这一关', effects: [] },
        { text: '先放一放', effects: [] },
      ],
      tags: ['crisis', record.kind],
    },
    arrivedAt: `${arrivedMonth}-01`,
    expiresAt: exp,
  }
}

export const crisis: EngineModule = {
  id: 'crisis',
  phase: 'aftermath',
  cadence: 'full',
  reads: ['career/*', 'forces/*', 'map/*', 'world.date'],
  writes: ['crisis/*'],
  collect(state, ctx: TickContext): DomainEffect[] {
    const tree = state as unknown as Tree
    const date = tree.world?.date ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return []

    const records: Record<string, CrisisRecord> = { ...(tree.crisis?.records ?? {}) }
    const add = (kind: CrisisRecord['kind'], severity: 1 | 2 | 3, detail: string, cityId?: string) => {
      let slot = Object.values(records).find((r) => r.kind === kind)
      if (slot) return // 同 kind 单档（幂等）
      slot = {
        id: `crisis-${kind}-${ctx.monthIndex}`,
        kind, severity,
        monthIndex: ctx.monthIndex,
        month: date,
        detail,
        ...(cityId ? { cityId } : {}),
      }
      records[slot.id] = slot
    }

    const career = tree.career
    if (career) {
      if (career.money < 0) add('bankruptcy', 1, `随身现银透支（${career.money} 银元）`)
      if (career.health <= 0) add('death', 3, `健康归零（${career.health}）`)
    }
    for (const [fid, n] of Object.entries(tree.forces?.strength ?? {})) {
      if (n === 0) add('mutiny', 2, `势力 ${fid} 兵力归零——哗变/溃散`)
    }
    for (const [cityId, dims] of Object.entries(tree.map ?? {})) {
      if (dims.security <= SECURITY_FLOOR) add('lost-city', 2, `城守瘫线（security ${dims.security} ≤ ${SECURITY_FLOOR}）`, cityId)
    }

    const changed = Object.keys(records).length !== Object.keys(tree.crisis?.records ?? {}).length
    if (!changed) return []
    return [{ op: 'crisisPost', args: { records } }]
  },
}
