<script setup lang="ts">
// src/App.vue — 组合根视图（SK-06：11 面板挂载 + 真实数据 + 免 API 零 LLM 过月）
// L8 只经 selector 读（U-03）；写只经 L5 命令。骨架门：免 API 开局 → 过月 → 存读档全流程零 LLM。
import { computed, onMounted, ref } from 'vue'
import type { Tree } from './validation/tree'
import { initialTree } from './validation/tree'
import { bumpDomains } from './stores/selectors/types'
import { tickWorld } from './turn/monthRunner'
import { startGame, travel } from './gameCommands'
import { writeSave, readSave, makeInitialSave, serializeSave } from './stores/saves'
import { loadSaveRecord } from './stores/saveSchema'

import GameHud from './components/GameHud.vue'
import StoryView from './components/StoryView.vue'
import ChoiceInput from './components/ChoiceInput.vue'
import StatusBar from './components/StatusBar.vue'
import OpeningDossier from './components/OpeningDossier.vue'
import CareerPanel from './components/panels/CareerPanel.vue'
import WorldPanel from './components/panels/WorldPanel.vue'
import RelationsPanel from './components/panels/RelationsPanel.vue'
import MemoryPanel from './components/panels/MemoryPanel.vue'
import PressPanel from './components/panels/PressPanel.vue'
import FinancePanel from './components/panels/FinancePanel.vue'
import StatusPanel from './components/panels/StatusPanel.vue'
import GoalsPanel from './components/panels/GoalsPanel.vue'
import IntelPanel from './components/panels/IntelPanel.vue'
import HistoryPanel from './components/panels/HistoryPanel.vue'
import MapPanel from './components/panels/MapPanel.vue'

const started = ref(false)
// 会话级状态（不入档）：树 + 域版本号（U-02 不变量 3：版本号从零起算）
const tree = ref<Tree>(initialTree('era-warlord', '1921-07'))
const versions = ref<Record<string, number>>({})
const story = ref<{ turn: number; date: string; text: string }[]>([])
const turnCount = ref(0)
const SLOT = 'auto-current' // SK-07 门 5：当前档（刷新恢复用；自动档体系 S-11 完整策略在 R2）

/** 存档（SK-07 门 5：过月后落档 —— 整份快照，S-01 不变量 1） */
async function persist() {
  try {
    const record = makeInitialSave({
      slotId: SLOT,
      eraId: tree.value.era.eraId,
      identityId: 'student',
      date: tree.value.world.date,
      variables: JSON.parse(JSON.stringify(tree.value)), // 剥 Vue Proxy（存档投影纯数据）
      updatedAt: tree.value.world.date, // 引擎侧禁 Date（B-02）：用游戏日期作 updated 标记
    })
    await writeSave({ ...record, meta: { ...record.meta, turnCount: turnCount.value } })
  } catch (e) {
    console.error('[vicissitudes] 存档失败：', e)
  }
}

/** 读档（刷新恢复：拒载即回开局 —— S-06 宁拒载不猜测） */
async function restore() {
  try {
    const raw = await readSave(SLOT)
    if (!raw) return
    const record = loadSaveRecord(raw, SLOT) // 版本门 + schema 校验
    tree.value = record.variables
    versions.value = {} // U-02 不变量 3：版本号会话级从零起算，不从存档恢复
    turnCount.value = record.meta.turnCount
    story.value = [{ turn: 0, date: record.variables.world.date, text: `读档恢复 · ${record.variables.world.date}（${serializeSave(record).length} 字节快照）` }]
    started.value = true
  } catch (e) {
    // 拒载：回开局（拒绝必须可见 —— 控制台注记；完整 UI 呈现在 SK-06 设置页范围外）
    console.warn('[vicissitudes] 存档拒载，回到开局：', (e as Error).message)
  }
}

onMounted(restore)

function onStart(eraId: string, kind: string) {
  const { variables } = startGame({ eraId, identityId: kind || 'student', date: '1921-07' })
  tree.value = variables
  versions.value = {}
  story.value = [{ turn: 0, date: variables.world.date, text: '序章 · 盖印开局（免 API 模式，零 LLM 调用）' }]
  started.value = true
  void persist()
}

/** 过月：L3 调度收集 → L4 单次原子提交 → 按实际写入域 bump（B-10/U-02）→ 落档 */
function advanceTurn() {
  const result = tickWorld(tree.value)
  if (!result.ok) return
  tree.value = result.state
  versions.value = { ...bumpDomains(versions.value, result.writtenDomains) } as Record<string, number>
  turnCount.value += 1
  story.value = [
    ...story.value.slice(-9),
    { turn: turnCount.value, date: result.state.world.date, text: '本月平静。（规则日叙 —— 零 LLM 调用）' },
  ]
  void persist()
}

/** 玩家行动（免 API：不触发模型 —— 零调用地板；命令直走 L5） */
function onAction(text: string) {
  if (!text.trim()) return
  if (text.includes('出趟远门')) {
    void travel('1921-08', tree.value) // SK-06 骨架：固定目的地演示命令通道
  }
  advanceTurn() // 免 API 模式下统一按过月处理
}

const stateForPanels = computed(() => tree.value)
const vForPanels = computed(() => versions.value)
</script>

<template>
  <div class="vic-app">
    <GameHud
      v-if="started"
      :state="stateForPanels"
      :versions="vForPanels"
    />
    <main class="vic-main">
      <OpeningDossier
        v-if="!started"
        :state="stateForPanels"
        :versions="vForPanels"
        @start="onStart"
      />
      <template v-else>
        <div class="vic-storycol">
          <StoryView
            :entries="story"
            digest=""
          />
          <ChoiceInput @submit="onAction" />
        </div>
        <aside
          class="vic-panels"
          aria-label="面板"
        >
          <CareerPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <StatusPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <WorldPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <FinancePanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <RelationsPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <MemoryPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <PressPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <GoalsPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <IntelPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <HistoryPanel
            :state="stateForPanels"
            :versions="vForPanels"
          />
          <MapPanel />
        </aside>
      </template>
    </main>
    <StatusBar
      v-if="started"
      :date="tree.world.date"
      :currency="tree.economy.currency"
      :money="(tree as unknown as { career?: { money?: number } }).career?.money ?? 0"
    />
  </div>
</template>

<style scoped>
.vic-app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.vic-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  padding: 0.75rem;
}
@media (min-width: 1024px) {
  .vic-main { grid-template-columns: 2fr 1fr; }
}
.vic-panels {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
  align-content: start;
}
</style>

<style>
/* 全局：vic- 前缀（§0.4 改名表）；断点与安全区（MOB-02） */
body { margin: 0; font-family: system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.vic-panel {
  border: 1px solid #d9d2c5;
  border-radius: 8px;
  padding: 0.75rem;
  background: #faf8f3;
}
.vic-panel h3 { margin: 0 0 0.5rem; font-size: 0.95rem; }
.vic-kv { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0; font-size: 0.875rem; }
.vic-kv dt { color: #7a6f5d; }
.vic-list { list-style: none; margin: 0; padding: 0; font-size: 0.875rem; display: flex; flex-direction: column; gap: 0.25rem; }
.vic-map-placeholder { color: #999; font-size: 0.8125rem; }
.vic-story { padding: 0.75rem; border-radius: 8px; background: #fff; border: 1px solid #e8e2d6; }
.vic-story__digest { color: #7a6f5d; font-size: 0.8125rem; border-bottom: 1px dashed #d9d2c5; padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
.vic-story__entry { margin: 0.25rem 0; }
.vic-story__empty { color: #999; }
.vic-input { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
.vic-input input { padding: 0.625rem; border: 1px solid #d9d2c5; border-radius: 8px; min-height: 44px; font-size: 1rem; }
.vic-input__quick { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.vic-input__quick button { min-height: 44px; min-width: 44px; padding: 0 0.75rem; border-radius: 8px; border: 1px solid #d9d2c5; background: #fff; cursor: pointer; }
.vic-statusbar {
  position: sticky; bottom: 0;
  display: flex; gap: 1.5rem; justify-content: center;
  padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
  background: #2b2620; color: #f5efe3; font-size: 0.875rem;
}
.vic-hud { display: flex; justify-content: space-between; padding: 0.625rem 1rem; background: #2b2620; color: #f5efe3; }
.vic-opening { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.vic-opening__sub { color: #7a6f5d; }
.vic-opening__eras { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; }
.vic-opening__era { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.875rem; min-height: 64px; border-radius: 8px; border: 1px solid #d9d2c5; background: #faf8f3; cursor: pointer; text-align: left; }
.vic-opening__hint { color: #7a6f5d; font-size: 0.875rem; }
</style>
