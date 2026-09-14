<script setup lang="ts">
// C4 GameHud — HUD（游戏日期等；与 StatusPanel 同源数据 —— 同一 selector，U-05 口径待定约束）
import { statusSummary } from '../stores/selectors'
import { evaluate } from '../stores/selectors/runtime'
import type { Tree } from '../validation/tree'
const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const s = () => evaluate(statusSummary, props.state, props.versions)
</script>

<template>
  <header class="vic-hud">
    <span class="vic-hud__date">{{ s().date }}</span>
    <span class="vic-hud__era">{{ s().era }}</span>
  </header>
</template>
