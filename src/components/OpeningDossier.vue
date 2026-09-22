<script setup lang="ts">
// O3 OpeningDossier — 开局档案（五时代全部可见、内容后填 —— U-06 不变量 5）
// 开局设定两步：先选时代（世界从该时代的开局年月推演），再选该时代的出身
// （L0-02 一行决定开局城、开局现银、是否开局即控城 —— 用户口径「控制城与否由开局设定决定」）。
// 未选出身前不开局：start 只在时代与出身都选定后 emit（不猜默认出身）。
import { ref, watch } from 'vue'
import { openingEras, openingIdentities } from '../stores/selectors'
import { evaluate } from '../stores/selectors/runtime'
import { resolveOpeningSetup } from '../gameCommands'
import type { Tree } from '../validation/tree'
const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const emit = defineEmits<{ start: [eraId: string, identityId: string] }>()

const eraList = () => evaluate(openingEras, props.state, props.versions)
const idList = (eraId: string) =>
  eraId === '' ? [] : evaluate(openingIdentities, { ...props.state, era: { eraId } } as Readonly<Tree>, props.versions)

const eraId = ref('')
const identityId = ref('')

// 换时代即清空已选出身（身份属于时代，跨时代沿用会是非法组合）
watch(eraId, () => { identityId.value = '' })

function pickEra(id: string) {
  eraId.value = id
}
function pickIdentity(id: string) {
  identityId.value = id
}
function start() {
  if (eraId.value === '' || identityId.value === '') return
  // 复核「时代 × 出身」这一对是合法组合再放行：同一 tick 内换时代后旧按钮尚未重渲染时，
  // 点击可能带上「新时代 + 旧出身」。此时 resolveOpeningSetup 会抛 StartGameError，
  // 若不在 emit 前拦住，异常会一路冒到 App.onStart 成为未捕获 rejection。
  try {
    resolveOpeningSetup({ eraId: eraId.value, identityId: identityId.value })
  } catch {
    identityId.value = ''
    return
  }
  emit('start', eraId.value, identityId.value)
}
</script>

<template>
  <section
    class="vic-opening"
    aria-label="开局"
  >
    <h2>民国风云</h2>
    <p class="vic-opening__sub">
      选择你的时代与出身 —— 五时代参考系（§二：开局参考系，不是阶段关卡）
    </p>
    <div class="vic-opening__eras">
      <button
        v-for="e in eraList()"
        :key="e.id"
        type="button"
        class="vic-opening__era"
        :data-era-id="e.id"
        :aria-pressed="eraId === e.id"
        @click="pickEra(e.id)"
      >
        <strong>{{ e.name }}</strong>
        <span>{{ e.fromYear }}–{{ e.toYear }}</span>
        <span
          class="vic-opening__start"
          :data-start-date="e.startDate"
        >开局 {{ e.startDate }}</span>
      </button>
    </div>
    <div
      v-if="eraId !== ''"
      class="vic-opening__identities"
      aria-label="出身"
    >
      <p class="vic-opening__pick">
        出身（开局城 / 开局现银）
      </p>
      <button
        v-for="i in idList(eraId)"
        :key="i.id"
        type="button"
        class="vic-opening__identity"
        :data-identity-id="i.id"
        :data-start-city="i.startCity"
        :aria-pressed="identityId === i.id"
        @click="pickIdentity(i.id)"
      >
        <strong>{{ i.kind }}</strong>
        <span>{{ i.cityName }} · {{ i.startMoney }} 银元</span>
        <span
          class="vic-opening__ctrl"
          :data-starts-with-control="String(i.startsWithControl)"
        >{{ i.startsWithControl ? '开局即控此城' : '开局不控城' }}</span>
      </button>
    </div>
    <div
      v-if="eraId !== '' && identityId !== ''"
      class="vic-opening__hint"
    >
      <p>盖印开局（免 API 模式：先读序章，零 LLM 调用）</p>
      <button
        type="button"
        class="vic-opening__go"
        @click="start()"
      >
        盖印开局
      </button>
    </div>
  </section>
</template>
