<script setup lang="ts">
// src/components/panels/CareerPanel.vue — 面板 1/11：身份/事业/兵力/声望（U-05）
import { careerSummary } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const data = () => evaluate(careerSummary, props.state, props.versions)
</script>

<template>
  <section
    class="vic-panel"
    aria-label="生涯"
  >
    <h3>生涯</h3>
    <dl class="vic-kv">
      <dt>身家</dt><dd>{{ data().money }} 银元</dd>
      <dt>声望</dt><dd>{{ data().reputation }}</dd>
      <dt>健康</dt><dd>{{ data().health }}</dd>
    </dl>
  </section>
</template>
