<template>
  <!-- 【ZWZW插件】画笔Canvas组件 -->
  <canvas
    v-show="show"
    ref="canvasRef"
    class="annotation-canvas"
    :class="{ 'penetrable': !annotation.active.value }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, type Ref } from 'vue';
import type { UseAnnotationReturn, VideoDisplayBox } from './index';

const props = defineProps<{
  annotation: UseAnnotationReturn;
  displayBox: VideoDisplayBox;
  show?: boolean;
}>();

const emit = defineEmits<{
  (e: 'stroke', stroke: ReturnType<UseAnnotationReturn['endStroke']>): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

// 同步Canvas尺寸
function syncCanvasSize(containerEl: HTMLElement): void {
  if (!canvasRef.value || !containerEl) return;
  
  const canvas = canvasRef.value;
  const newWidth = containerEl.clientWidth;
  const newHeight = containerEl.clientHeight;
  
  if (canvas.width !== newWidth || canvas.height !== newHeight || !ctx) {
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
    
    ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }
  
  redraw();
}

// 重绘所有画笔
function redraw(): void {
  if (!ctx || !canvasRef.value) return;
  
  const { annotation, displayBox } = props;
  
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  
  const drawStroke = (stroke: { color: string; lineWidth: number; points: Array<{ x: number; y: number }> }) => {
    if (stroke.points.length < 2) return;
    
    ctx!.beginPath();
    ctx!.strokeStyle = stroke.color;
    ctx!.lineWidth = stroke.lineWidth;
    
    const startPoint = {
      x: displayBox.x + stroke.points[0].x * displayBox.width,
      y: displayBox.y + stroke.points[0].y * displayBox.height,
    };
    ctx!.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      const point = {
        x: displayBox.x + stroke.points[i].x * displayBox.width,
        y: displayBox.y + stroke.points[i].y * displayBox.height,
      };
      ctx!.lineTo(point.x, point.y);
    }
    
    ctx!.stroke();
  };
  
  // 绘制已完成的线条
  annotation.strokes.value.forEach(drawStroke);
  
  // 绘制当前正在画的线条
  if (annotation.currentStroke.value && annotation.currentStroke.value.points.length >= 2) {
    drawStroke(annotation.currentStroke.value);
  }
}

// 将容器坐标转换为归一化坐标
function containerToNormalized(clientX: number, clientY: number): { x: number; y: number } | null {
  if (!canvasRef.value) return null;
  
  const rect = canvasRef.value.getBoundingClientRect();
  const containerX = clientX - rect.left;
  const containerY = clientY - rect.top;
  
  const videoX = containerX - props.displayBox.x;
  const videoY = containerY - props.displayBox.y;
  
  const x = videoX / props.displayBox.width;
  const y = videoY / props.displayBox.height;
  
  // 检查是否在视频区域内
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  
  return { x, y };
}

function onPointerDown(e: PointerEvent): void {
  if (!props.annotation.active.value) return;
  
  const coords = containerToNormalized(e.clientX, e.clientY);
  if (!coords) return;
  
  props.annotation.startStroke(coords.x, coords.y);
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  if (!props.annotation.isDrawing.value) return;
  
  const coords = containerToNormalized(e.clientX, e.clientY);
  if (!coords) return;
  
  props.annotation.addPoint(coords.x, coords.y);
  redraw();
}

function onPointerUp(e: PointerEvent): void {
  if (!props.annotation.isDrawing.value) return;
  
  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  
  const stroke = props.annotation.endStroke();
  if (stroke) {
    emit('stroke', stroke);
  }
}

// 暴露方法供外部调用
defineExpose({
  syncCanvasSize,
  redraw,
});

// 监听画笔数据变化，自动重绘
watch(
  () => props.annotation.strokes.value,
  () => {
    nextTick(redraw);
  },
  { deep: true }
);

watch(
  () => props.displayBox,
  () => {
    nextTick(redraw);
  },
  { deep: true }
);
</script>

<style scoped>
.annotation-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  /* 默认允许触摸穿透 */
  pointer-events: none !important;
}

/* 画笔激活时，Canvas 捕获触摸事件 */
.annotation-canvas:not(.penetrable) {
  pointer-events: auto !important;
  touch-action: none !important;
  cursor: crosshair;
}
</style>
