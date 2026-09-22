<script setup lang="ts">
// src/components/panels/FinancePanel.vue — 面板（U-05 注册表成员；读只经 selector —— U-03 不变量 1）
// 数据源：settlement（现金流）/ finance（实业资产）/ fiscal（控城税收）—— 三类都是 L3 提交后的
// 真实树状态，本面板只读不算（视图层不自行求和）。
import { financeSheets } from '../../stores/selectors'
import { evaluate } from '../../stores/selectors/runtime'
import type { Tree } from '../../validation/tree'

const props = defineProps<{ state: Readonly<Tree>; versions: Record<string, number> }>()
const sheets = () => evaluate(financeSheets, props.state, props.versions)

function yuan(n: number): string {
  return `${n >= 0 ? '' : '−'}${Math.abs(Math.round(n * 100) / 100)}`
}
</script>

<template>
  <section
    class="vic-panel"
    aria-label="账本"
  >
    <h3>账本</h3>
    <p class="vic-panel__sum">
      现金 {{ yuan(sheets().cash) }} 元 · 税收 {{ yuan(sheets().taxRevenue) }} 元 · 流水 {{ sheets().ledgerCount }} 笔
    </p>
    <ul
      class="vic-list"
      aria-label="账本流水"
    >
      <li
        v-for="e in sheets().income"
        :key="`${e.month}-${e.what}`"
      >
        {{ e.month }} {{ e.what }} {{ yuan(e.amount) }}
      </li>
    </ul>
    <ul
      class="vic-list"
      aria-label="账本资产"
    >
      <li
        v-for="a in sheets().assets"
        :key="a.name"
      >
        {{ a.name }} {{ yuan(a.value) }}
      </li>
    </ul>
    <!-- 负债：引擎尚无借贷域 —— 有真实数据源就渲染，没有就明标「未接通」，
         不用假行凑「收支/资产/负债」三件套 -->
    <ul
      v-if="sheets().liabilities.length > 0"
      class="vic-list"
      aria-label="账本负债"
    >
      <li
        v-for="l in sheets().liabilities"
        :key="l.name"
      >
        {{ l.name }} {{ yuan(l.amount) }}
      </li>
    </ul>
    <p
      v-else
      class="vic-panel__note"
    >
      负债：借贷域未接通
    </p>
  </section>
</template>
