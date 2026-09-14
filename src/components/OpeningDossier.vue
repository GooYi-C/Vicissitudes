<script setup lang="ts">
// O3 OpeningDossier — 开局档案（五时代全部可见、内容后填 —— U-06 不变量 5）
import { openingEras, openingIdentities } from '../stores/selectors'
import { evaluate } from '../stores/selectors/runtime'
import type { Tree } from '../validation/tree'
const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const emit = defineEmits<{ start: [eraId: string, kind: string] }>()

const eraList = () => evaluate(openingEras, props.state, props.versions)
const idList = (eraId: string) =>
  eraId === '' ? [] : evaluate(openingIdentities, { ...props.state, era: { eraId } } as Readonly<Tree>, props.versions)
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
        @click="emit('start', e.id, '')"
      >
        <strong>{{ e.name }}</strong>
        <span>{{ e.fromYear }}–{{ e.toYear }}</span>
      </button>
    </div>
    <div
      v-if="idList('era-warlord').length"
      class="vic-opening__hint"
    >
      <p>盖印开局（免 API 模式：先读序章，零 LLM 调用）</p>
    </div>
  </section>
</template>
