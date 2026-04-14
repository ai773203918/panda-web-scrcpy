<template>
  <!-- 【ZWZW插件】画笔工具栏组件 -->
  <div class="annotation-toolbar">
    <v-btn
      variant="text"
      size="small"
      :color="annotation.active ? 'primary' : 'default'"
      class="tool-btn"
      :title="annotation.active ? '关闭画笔' : '开启画笔'"
      @click="annotation.toggle"
    >
      <v-icon size="18">{{ annotation.active ? 'mdi-pencil' : 'mdi-pencil-off' }}</v-icon>
    </v-btn>
    
    <v-menu v-if="annotation.active" offset-y :location="menuLocation">
      <template v-slot:activator="{ props }">
        <v-btn variant="text" size="small" v-bind="props" class="tool-btn" title="选择颜色">
          <span class="color-dot" :style="{ background: annotation.color.value }" />
        </v-btn>
      </template>
      <v-list density="compact">
        <v-list-item
          v-for="c in colors"
          :key="c.id"
          @click="annotation.setColor(c.value)"
        >
          <template v-slot:prepend>
            <span class="color-dot mr-2" :style="{ background: c.value }" />
          </template>
          <v-list-item-title>{{ c.name }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
    
    <v-btn
      v-if="annotation.active && annotation.strokes.value.length > 0"
      variant="text"
      size="small"
      color="error"
      class="tool-btn"
      title="清除画笔"
      @click="handleClearAll"
    >
      <v-icon size="18">mdi-eraser</v-icon>
    </v-btn>

    <!-- 画质控制（可选） -->
    <slot name="quality-control" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ANNOTATION_COLORS, type UseAnnotationReturn } from './index';

const props = defineProps<{
  annotation: UseAnnotationReturn;
  menuLocation?: 'left' | 'right';
}>();

const emit = defineEmits<{
  (e: 'clear-all'): void;
}>();

const colors = ANNOTATION_COLORS;
const menuLocation = computed(() => props.menuLocation || 'left');

function handleClearAll() {
  props.annotation.clearAll();
  emit('clear-all');
}
</script>

<style scoped>
.annotation-toolbar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.95);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.tool-btn {
  min-width: 36px !important;
  width: 36px !important;
  height: 36px !important;
  padding: 0 !important;
}

.color-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
</style>
