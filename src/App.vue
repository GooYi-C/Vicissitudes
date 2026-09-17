<script setup lang="ts">
// src/App.vue — 组合根视图（SK-06：11 面板挂载 + 真实数据；VS-01：LLM 回合接线）
// L8 只经 selector 读（U-03）；写只经 L5 命令。骨架门：免 API 开局 → 过月 → 存读档全流程零 LLM。
// VS-01：settings.upstream 三项齐备时自由输入走 LLM 回合（SSE → 结构块 → 下半管道 → 原子提交）；
// 未配置保持现行过月（零调用地板 BIL-3）。设置区在本文件内（回滚半径与批次卡一致）。
import { computed, onMounted, ref } from 'vue'
import type { Tree } from './validation/tree'
import { initialTree } from './validation/tree'
import { bumpDomains } from './stores/selectors/types'
import { tickWorld } from './turn/monthRunner'
import { startGame, travel } from './gameCommands'
import { writeSave, readSave, makeInitialSave, serializeSave } from './stores/saves'
import { loadSaveRecord } from './stores/saveSchema'
import { loadSettings, saveSettings, type Settings } from './stores/settings'
import { buildChatMessages } from './llm/prompt'
import { callChatCompletion, getCallStats } from './llm/client'
import { LLM_ERROR_TABLE } from './llm/errors'
import { runModelTurn } from './llm/turnLoop'

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

// ── VS-01 设置区（LLM 配置；settings 是设备级——不进 SaveRecord/提示词快照/导出/日志，S-04）──
const settings = ref<Settings | null>(null) // 默认值单点=settings.ts（SAV-4：组件侧不引用之）；loadSettings 回填
const settingsNote = ref('')
const llmReady = computed(() => {
  const u = settings.value?.upstream
  return !!u && !!u.baseUrl && !!u.model && !!u.apiKey
})

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

onMounted(() => {
  void restore()
  void loadSettings().then(({ settings: s, note }) => {
    settings.value = s
    if (note) settingsNote.value = note
  })
})

function onStart(eraId: string, kind: string) {
  const { variables } = startGame({ eraId, identityId: kind || 'student', date: '1921-07' })
  tree.value = variables
  versions.value = {}
  story.value = [{ turn: 0, date: variables.world.date, text: '序章 · 盖印开局（免 API 模式，零 LLM 调用）' }]
  started.value = true
  void persist()
}

async function onSaveSettings() {
  if (!settings.value) return
  await saveSettings(settings.value)
  settingsNote.value = '设置已保存（本机存储区；key 不入存档与任何 prompt）'
}

/** 过月：L3 调度收集 → L4 单次原子提交 → 按实际写入域 bump（B-10/U-02）→ 落档 */
function advanceTurn(opts?: { silent?: boolean }) {
  const result = tickWorld(tree.value)
  if (!result.ok) return
  tree.value = result.state
  versions.value = { ...bumpDomains(versions.value, result.writtenDomains) } as Record<string, number>
  turnCount.value += 1
  if (!opts?.silent) {
    story.value = [
      ...story.value.slice(-9),
      { turn: turnCount.value, date: result.state.world.date, text: '本月平静。（规则日叙 —— 零 LLM 调用）' },
    ]
  }
  void persist()
}

/** 玩家行动：API 配置齐备 → LLM 回合；否则 现行过月（零调用地板 —— client 计数恒 0） */
async function onAction(text: string) {
  if (!text.trim()) return
  if (!llmReady.value) {
    if (text.includes('出趟远门')) void travel('1921-08', tree.value) // SK-06 骨架：固定目的地演示命令通道
    advanceTurn()
    return
  }
  // ── LLM 回合（VS-01）：prompt 组装 → SSE → 结构块 → 下半管道 → 单次原子提交 → 过月落档
  const entry = { turn: turnCount.value + 1, date: tree.value.world.date, text: '' }
  story.value = [...story.value.slice(-9), entry]
  const rerender = () => { story.value = [...story.value] }
  const s = settings.value
  if (!s) return // llmReady 门禁下理论不可达；类型窄化在组合根完成
  const messages = buildChatMessages(
    { tree: tree.value, history: story.value, userText: text },
    { promptBudget: s.promptBudget },
  )
  const u = s.upstream
  const outcome = await callChatCompletion({
    baseUrl: u.baseUrl, model: u.model, apiKey: u.apiKey,
    messages,
    onDelta: (d) => { entry.text += d; rerender() },
  })
  if (outcome.ok) {
    const turn = runModelTurn(tree.value, outcome.text)
    if (turn.ok) {
      tree.value = turn.state
      versions.value = { ...bumpDomains(versions.value, turn.writtenDomains) } as Record<string, number>
    }
    // 叙事以剥块后的正文为准（与流式累积同文覆盖稳态）；注记可观测（DebugPanel 未建位——行尾计数）
    entry.text = turn.narrative || entry.text
    if (turn.diagnostics.length) entry.text += `\n（回合注记 ${turn.diagnostics.length} 条——叙事照常，越界已剥除）`
    rerender()
  } else if (outcome.code === 'stream-broken' && outcome.partialText) {
    // LL-19 stream-broken：已收结构块照常处理（叙事正文用已收部分 + 中断注记）
    const turn = runModelTurn(tree.value, outcome.partialText)
    if (turn.ok) {
      tree.value = turn.state
      versions.value = { ...bumpDomains(versions.value, turn.writtenDomains) } as Record<string, number>
    }
    entry.text = `${turn.narrative}\n（回复中断，已收到部分已照常处理 —— stream-broken）
`
    rerender()
  } else {
    // LL-19 降级：错误行可见，世界零变更（月推进照常——降级 ≠ 惩罚）
    entry.text = `${LLM_ERROR_TABLE[outcome.code].playerMessage || '调用失败'}（${outcome.code}）；本月按规则路径继续。`
    rerender()
  }
  advanceTurn({ silent: true })
}

const stateForPanels = computed(() => tree.value)
const vForPanels = computed(() => versions.value)
const callCounter = computed(() => getCallStats().length)
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
          <details
            v-if="settings"
            class="vic-settings"
          >
            <summary>
              设置（API）·{{ llmReady ? '已配置 → LLM 回合' : '未配置 → 确定性模式（零调用）' }}
            </summary>
            <div class="vic-settings__grid">
              <label>
                上游端点 baseUrl
                <input
                  v-model="settings.upstream.baseUrl"
                  type="text"
                  placeholder="https://api.example.com"
                  autocomplete="off"
                >
              </label>
              <label>
                模型 model
                <input
                  v-model="settings.upstream.model"
                  type="text"
                  placeholder="model-name"
                  autocomplete="off"
                >
              </label>
              <label>
                密钥 apiKey（只存本机；不入存档/prompt/日志）
                <input
                  v-model="settings.upstream.apiKey"
                  type="password"
                  autocomplete="off"
                >
              </label>
              <button
                type="button"
                @click="onSaveSettings"
              >
                保存设置
              </button>
            </div>
            <p
              v-if="settingsNote"
              class="vic-settings__note"
            >
              {{ settingsNote }}
            </p>
            <p class="vic-settings__note">
              本局 LLM 调用：{{ callCounter }} 次（纯观测 LL-17；观测数据不进存档）
            </p>
          </details>
          <StoryView
            :entries="story"
            digest=""
          />
          <ChoiceInput
            :llm-ready="llmReady"
            @submit="onAction"
          />
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
.vic-settings {
  border: 1px solid #d9d2c5;
  border-radius: 8px;
  background: #f7f4ec;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
.vic-settings__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
@media (min-width: 1024px) {
  .vic-settings__grid { grid-template-columns: repeat(4, 1fr); align-items: end; }
}
.vic-settings__grid label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.vic-settings__note {
  margin: 0.3rem 0 0;
  color: #6b6355;
  font-size: 0.8rem;
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
  margin: 0;
}
</style>
