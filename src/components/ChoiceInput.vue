<script setup lang="ts">
// C2 ChoiceInput — 输入栏（自由扮演 + 短句点选）
// VS-01：双模式提示——未配置 API 时输入仅按过月处理（零调用地板 BIL-3）；
// 配置齐备时经模型回合（SSE 流式；提示语随 llm-ready 切换）。
defineProps<{ llmReady?: boolean; busy?: boolean }>()
const emit = defineEmits<{ submit: [text: string] }>()
const quick = ['看看行情', '出趟远门', '读报', '歇息一月']
</script>

<template>
  <form
    class="vic-input"
    @submit.prevent=""
  >
    <input
      type="text"
      :disabled="busy"
      :placeholder="llmReady ? '说一句话试试——经模型回合（SSE 流式）' : '做点什么……（未配置 API：输入不触发模型调用）'"
      aria-label="行动输入"
      @keydown.enter="emit('submit', ($event.target as HTMLInputElement).value)"
    >
    <div class="vic-input__quick">
      <button
        v-for="q in quick"
        :key="q"
        type="button"
        :disabled="busy"
        @click="emit('submit', q)"
      >
        {{ q }}
      </button>
    </div>
  </form>
</template>
