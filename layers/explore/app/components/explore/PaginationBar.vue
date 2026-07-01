<script setup lang="ts">
interface Props {
  page: number
  pageSize: number
  total: number
}
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:page': [page: number] }>()

const pageModel = computed({
  get: () => props.page,
  set: v => emit('update:page', v)
})

const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const rangeEnd = computed(() => Math.min(props.total, props.page * props.pageSize))
</script>

<template>
  <div
    v-if="props.total > 0"
    class="pager"
  >
    <p class="pager__count">
      <span class="pager__count-strong">{{ rangeStart }}–{{ rangeEnd }}</span>
      of {{ props.total.toLocaleString() }}
    </p>
    <UPagination
      v-model:page="pageModel"
      :total="props.total"
      :items-per-page="props.pageSize"
      :sibling-count="1"
      size="sm"
    />
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}

.pager__count {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim, #8b9591);
  font-variant-numeric: tabular-nums;
}

.pager__count-strong {
  color: var(--text, #f4f6f5);
  font-weight: 600;
}

@media (max-width: 520px) {
  .pager {
    justify-content: center;
  }
}
</style>
