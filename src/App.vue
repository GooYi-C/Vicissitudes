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
import { buildChatMessages, buildStaticHead } from './llm/prompt'
import { callChatCompletion, getCallStats, summarizeCallStats, fetchProviderModels, type CallStat } from './llm/client'
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
const saveNote = ref('')
// 仅本页内存；不改变 Settings/SaveRecord 形状、不写入日志或持久化区。
const includeUsage = ref(false) // 向不支持的端点强塞参数会失败，因此必须手动 opt-in
const modelBusy = ref(false)
const modelsBusy = ref(false)
const modelChoices = ref<string[]>([])
const modelsNote = ref('')
const callStats = ref<readonly CallStat[]>(getCallStats())
interface ObservedTurn {
  ordinal: number
  firstCall: number | null
  lastCall: number | null
  status: string
  staticHeadHash: string
  committed: boolean
  metrics: ReturnType<typeof runModelTurn>['metrics'] | null
}
const observedTurns = ref<ObservedTurn[]>([])
const llmReady = computed(() => {
  const u = settings.value?.upstream
  return !!u && !!u.baseUrl && !!u.model && !!u.apiKey
})

/** 存档（SK-07 门 5：过月后落档 —— 整份快照，S-01 不变量 1） */
async function persist() {
  saveNote.value = '保存中，请勿刷新或关闭页面'
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
    saveNote.value = `已保存 · ${record.meta.date}`
  } catch {
    saveNote.value = '保存失败，请勿刷新；本次进度尚未确认落档'
    console.error('[vicissitudes] 存档失败')
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

async function onStart(eraId: string, kind: string) {
  if (modelBusy.value || modelsBusy.value) return
  modelBusy.value = true
  try {
    const { variables } = startGame({ eraId, identityId: kind || 'student', date: '1921-07' })
    tree.value = variables
    versions.value = {}
    story.value = [{ turn: 0, date: variables.world.date, text: '序章 · 盖印开局（免 API 模式，零 LLM 调用）' }]
    started.value = true
    await persist()
  } finally { modelBusy.value = false }
}

async function onSaveSettings() {
  if (!settings.value) return
  await saveSettings(settings.value)
  settingsNote.value = '设置已保存（本机存储区；key 不入存档与任何 prompt）'
}

/** 模型列表由玩家显式触发；失败仍可手填，不自动回退任何代理。 */
async function onLoadModels() {
  if (!settings.value || modelBusy.value || modelsBusy.value) return
  const { baseUrl, apiKey } = settings.value.upstream
  modelsBusy.value = true
  modelChoices.value = []
  modelsNote.value = '正在直连服务商读取模型列表…'
  try {
    const result = await fetchProviderModels({ baseUrl, apiKey })
    if (settings.value.upstream.baseUrl !== baseUrl || settings.value.upstream.apiKey !== apiKey) return
    modelChoices.value = result.models
    modelsNote.value = result.ok ? `已读取 ${result.models.length} 个模型；也可手填。` : `${result.message}；可以手填模型名。`
  } finally { modelsBusy.value = false }
}

/** 过月：L3 调度收集 → L4 单次原子提交 → 按实际写入域 bump（B-10/U-02）→ 落档 */
async function advanceTurn(opts?: { silent?: boolean }) {
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
  await persist()
}

/** 玩家行动：API 配置齐备 → LLM 回合；否则 现行过月（零调用地板 —— client 计数恒 0） */
async function onAction(text: string) {
  if (!text.trim() || modelBusy.value || modelsBusy.value) return
  if (!llmReady.value) {
    modelBusy.value = true
    try {
      if (text.includes('出趟远门')) void travel('1921-08', tree.value)
      await advanceTurn()
    } finally { modelBusy.value = false }
    return
  }
  modelBusy.value = true
  const firstCall = getCallStats().length + 1
  try {
    // ── LLM 回合（VS-01）：prompt 组装 → SSE → 结构块 → 下半管道 → 单次原子提交 → 过月落档
    const entry = { turn: turnCount.value + 1, date: tree.value.world.date, text: '' }
    story.value = [...story.value.slice(-9), entry]
    const rerender = () => { story.value = [...story.value] }
    const s = settings.value
    if (!s) return // llmReady 门禁下理论不可达；类型窄化在组合根完成
    const staticHeadHash = buildStaticHead({ promptBudget: s.promptBudget }).hash
    const messages = buildChatMessages(
      { tree: tree.value, history: story.value, userText: text },
      { promptBudget: s.promptBudget },
    )
    const u = s.upstream
    const outcome = await callChatCompletion({
      baseUrl: u.baseUrl, model: u.model, apiKey: u.apiKey,
      messages, includeUsage: includeUsage.value,
      onDelta: (d) => { entry.text += d; rerender() },
    })
    let turnResult: ReturnType<typeof runModelTurn> | null = null
    if (outcome.ok) {
      const turn = runModelTurn(tree.value, outcome.text)
      turnResult = turn
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
      turnResult = turn
      if (turn.ok) {
        tree.value = turn.state
        versions.value = { ...bumpDomains(versions.value, turn.writtenDomains) } as Record<string, number>
      }
      entry.text = `${turn.narrative}\n（回复中断，已收到部分已照常处理 —— stream-broken）`
      rerender()
    } else {
      // LL-19-4：模型侧零额外机制效果；月推进与零调用规则路径一致。
      entry.text = `${LLM_ERROR_TABLE[outcome.code].playerMessage || '调用失败'}（${outcome.code}）；本月按规则路径继续。`
      rerender()
    }
    observedTurns.value = [...observedTurns.value, {
      ordinal: observedTurns.value.length + 1,
      firstCall: getCallStats().length >= firstCall ? firstCall : null,
      lastCall: getCallStats().length >= firstCall ? getCallStats().length : null,
      status: outcome.ok ? 'ok' : outcome.code,
      staticHeadHash,
      committed: turnResult?.ok ?? false,
      metrics: turnResult?.metrics ? { ...turnResult.metrics } : null,
    }]
    await advanceTurn({ silent: true })
  } finally {
    callStats.value = getCallStats()
    modelBusy.value = false
  }
}

const stateForPanels = computed(() => tree.value)
const vForPanels = computed(() => versions.value)
const callCounter = computed(() => callStats.value.length)
const usageSummary = computed(() => summarizeCallStats(callStats.value))
const evidenceJson = computed(() => JSON.stringify({
  schema: 'vs01-observation-v2',
  transport: 'browser-direct',
  scope: 'page-session',
  summary: usageSummary.value,
  cost: { status: 'unmeasured', note: '需服务商计价/账单核对；字符数和请求数不是费用' },
  calls: callStats.value,
  turns: observedTurns.value,
}, null, 2))
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
              设置（API）·{{ llmReady ? '已填写 → 浏览器直连（需 CORS）' : '未配置 → 确定性模式（零调用）' }}
            </summary>
            <p
              class="vic-settings__note"
              data-testid="direct-notice"
            >
              模型请求由浏览器直连你填写的 HTTPS 服务商，CF 仅提供静态页面。
              服务商需支持 CORS；失败不自动转 CF 或其他代理。baseUrl 请包含实际版本路径，不自动补 /v1。
            </p>
            <div class="vic-settings__grid">
              <label>
                上游端点 baseUrl
                <input
                  v-model="settings.upstream.baseUrl"
                  type="text"
                  placeholder="https://api.example.com/v1"
                  autocomplete="off"
                >
              </label>
              <label>
                模型 model
                <input
                  v-model="settings.upstream.model"
                  list="vic-provider-models"
                  type="text"
                  placeholder="model-name"
                  autocomplete="off"
                >
              </label>
              <label>
                密钥 apiKey（直接发给你填写的服务商；不经本站 CF 代理）
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
            <button
              type="button"
              data-testid="load-models"
              :disabled="modelBusy || modelsBusy || !settings.upstream.baseUrl.trim() || !settings.upstream.apiKey.trim()"
              @click="onLoadModels"
            >
              {{ modelsBusy ? '读取中…' : '读取模型列表（直连）' }}
            </button>
            <datalist id="vic-provider-models">
              <option
                v-for="id in modelChoices"
                :key="id"
                :value="id"
              />
            </datalist>
            <p
              v-if="modelsNote"
              class="vic-settings__note"
              data-testid="models-note"
            >
              {{ modelsNote }}
            </p>
            <label class="vic-usage-toggle">
              <input
                v-model="includeUsage"
                type="checkbox"
                :disabled="modelBusy"
              >
              请求上游 usage（仅明确支持 stream_options 的端点；本页有效，默认关闭）
            </label>
            <p
              class="vic-settings__note"
              data-testid="call-counter"
            >
              本页直连生成请求：{{ callCounter }} 次（含重试；不含模型列表/浏览器预检，不等于服务商计费次数）
            </p>
            <p
              class="vic-settings__note"
              data-testid="usage-summary"
            >
              完整 usage：{{ usageSummary.measuredCalls }}/{{ callCounter }} 次；
              输入 token：{{ usageSummary.promptTokens ?? '未测/不完整' }}；
              输出 token：{{ usageSummary.completionTokens ?? '未测/不完整' }}；
              上游提示词缓存 token 占比：{{ usageSummary.cacheTokenRatio === null ? '未测/不完整' : (usageSummary.cacheTokenRatio * 100).toFixed(2) + '%' }}。
            </p>
            <p class="vic-settings__note">
              字符计数（非 token）：输入 {{ usageSummary.promptChars }} / 输出 {{ usageSummary.completionChars }}。
              费用未测，需服务商定价/账单；静态头哈希只证明稳定性，不证明缓存命中。
            </p>
            <details class="vic-settings__note">
              <summary>验收观测 JSON（可选中复制；刷新清空，不含 key、端点、提示词或叙事）</summary>
              <p>turns.metrics 沿用结构块下链/提议过闸计数；不是自然语言意图遵循率。committed=false 不算成功落账。</p>
              <textarea
                class="vic-observation"
                aria-label="验收观测 JSON"
                :value="evidenceJson"
                rows="10"
                readonly
                spellcheck="false"
              />
            </details>
          </details>
          <p
            v-if="saveNote"
            class="vic-settings__note"
            role="status"
            data-testid="save-status"
          >
            {{ saveNote }}
          </p>
          <StoryView
            :entries="story"
            digest=""
          />
          <ChoiceInput
            :llm-ready="llmReady"
            :busy="modelBusy || modelsBusy"
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
.vic-usage-toggle { display: block; margin-top: 0.5rem; font-size: 0.8rem; }
.vic-observation { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 0.75rem; }
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
