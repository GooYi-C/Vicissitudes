// tests/e2e/gates/gate3-months.spec.ts — VS-01 顺手清偿 G-3：门 3 自动化（免 API 开局→12 月→存读档）
// 范围：进程内（vitest/jsdom 无网络）；存读档经 serializeSave→loadSaveRecord 往返（确定性键序）。
// 免 API：全程零 LLM 调用（BIL-3 零调用地板——用真 client 计数器侧证）。
import { describe, it, expect, beforeEach } from 'vitest'
import { initialTree, type Tree } from '../../../src/validation/tree'
import { tickWorld } from '../../../src/turn/monthRunner'
import { makeInitialSave, serializeSave } from '../../../src/stores/saves'
import { loadSaveRecord } from '../../../src/stores/saveSchema'
import { sameWorld } from '../../../src/turn/TurnRunner'
import { resetCallStats, countRealCalls } from '../../../src/llm/client'

describe('骨架门 3 e2e 化：免 API 开局 → 12 个月 → 存读档存活', () => {
  beforeEach(() => resetCallStats())

  it('开局 1921-07 → 连续 12 月全部落位（1922-07 达）→ 快照往返逐位一致 → 再进 1 月', () => {
    let tree: Tree = initialTree('era-warlord', '1921-07')
    for (let i = 0; i < 12; i++) {
      const r = tickWorld(tree)
      expect(r.ok, `第 ${i + 1} 个月失败：${r.error ?? ''}`).toBe(true)
      tree = r.state
    }
    expect(tree.world.date).toBe('1922-07')
    // 存
    const record = makeInitialSave({
      slotId: 'gate3', eraId: tree.era.eraId, identityId: 'student', date: tree.world.date,
      variables: JSON.parse(JSON.stringify(tree)) as never, updatedAt: tree.world.date,
    })
    const snap = serializeSave(record)
    // 读（拒载即失败 —— S-06）
    const loaded = loadSaveRecord(JSON.parse(snap) as Parameters<typeof loadSaveRecord>[0], 'gate3') // readSave 同口径：落盘 JSON → 对象再校验
    expect(sameWorld(loaded.variables as unknown as Tree, tree)).toBe(true)
    // 复活后继续推进
    const next = tickWorld(loaded.variables as unknown as Tree)
    expect(next.ok).toBe(true)
    expect(next.state.world.date).toBe('1922-08')
    // 零调用地板：全程真计数器 = 0（连 0 次）——BIL-3
    expect(countRealCalls()).toBe(0)
  })
})
