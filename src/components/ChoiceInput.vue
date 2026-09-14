<script setup lang="ts">
// C2 ChoiceInput — 输入栏（自由扮演 + 短句点选；骨架期免 API —— 零 LLM，零调用地板 BIL-3）
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
      placeholder="做点什么……（免 API 模式：输入不触发模型调用）"
      aria-label="行动输入"
      @keydown.enter="emit('submit', ($event.target as HTMLInputElement).value)"
    >
    <div class="vic-input__quick">
      <button
        v-for="q in quick"
        :key="q"
        type="button"
        @click="emit('submit', q)"
      >
        {{ q }}
      </button>
    </div>
  </form>
</template>
