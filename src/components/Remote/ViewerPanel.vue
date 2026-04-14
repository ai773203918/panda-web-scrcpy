<template>
  <div class="viewer-panel">
    <div v-if="!isConnected" class="connection-form">
      <div class="connect-card">
        <div class="cc-header">
          <v-icon size="20" color="secondary" class="mr-2">mdi-cast-connected</v-icon>
          <span class="cc-title">远程观看</span>
        </div>
        <div class="cc-body">
          <v-text-field
            v-model="hostPeerId"
            label="分享 ID"
            placeholder="输入分享端的 Peer ID"
            :disabled="connectionState === 'connecting'"
            :error-messages="error || undefined"
            hide-details="auto"
            @keyup.enter="handleConnect"
          />
        </div>
        <div class="cc-actions">
          <v-spacer />
          <v-btn
            color="primary"
            size="small"
            :loading="connectionState === 'connecting'"
            :disabled="!hostPeerId.trim()"
            @click="handleConnect"
          >
            <v-icon start size="16">mdi-connection</v-icon>
            连接
          </v-btn>
        </div>
      </div>
    </div>

    <div v-else class="video-area">
      <div class="status-bar">
        <span class="status-chip">
          <span class="status-dot" />
          已连接
        </span>
        <!-- 【ZWZW修改】显示权限状态（不遮挡屏幕） -->
        <span class="permission-status_ZWZW" :class="{ 'can-control': canControl }">
          <v-icon size="14" :color="canControl ? 'success' : 'default'">
            {{ canControl ? 'mdi-remote' : 'mdi-eye-outline' }}
          </v-icon>
          {{ canControl ? '可控制' : '仅观看' }}
        </span>
        <v-spacer />
        
        <v-btn
          variant="text"
          size="x-small"
          color="error"
          class="text-none"
          @click="handleDisconnect"
        >
          <v-icon start size="14">mdi-close</v-icon>
          断开
        </v-btn>
      </div>

      <div class="video-container_ZWZW">
        <!-- 【ZWZW新增】侧边画笔工具栏 -->
        <div class="side-toolbar_ZWZW">
          <v-btn
            variant="text"
            size="small"
            :color="annotationActive_ZWZW ? 'primary' : 'default'"
            class="tool-btn_ZWZW"
            @click="toggleAnnotation_ZWZW"
          >
            <!-- 【ZWZW修复】图标逻辑：启用时显示画笔，禁用时显示关闭画笔 -->
            <v-icon size="18">{{ annotationActive_ZWZW ? 'mdi-pencil' : 'mdi-pencil-off' }}</v-icon>
          </v-btn>
          
          <v-menu v-if="annotationActive_ZWZW" offset-y left>
            <template v-slot:activator="{ props }">
              <v-btn variant="text" size="small" v-bind="props" class="tool-btn_ZWZW">
                <span class="color-dot_ZWZW" :style="{ background: annotationColor_ZWZW }" />
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="color in colorOptions_ZWZW"
                :key="color.id"
                @click="annotationColor_ZWZW = color.value"
              >
                <template v-slot:prepend>
                  <span class="color-dot_ZWZW mr-2" :style="{ background: color.value }" />
                </template>
                <v-list-item-title>{{ color.name }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          
          <v-btn
            v-if="annotationActive_ZWZW && annotationStrokes_ZWZW.length > 0"
            variant="text"
            size="small"
            color="error"
            class="tool-btn_ZWZW"
            @click="clearAllStrokes_ZWZW"
          >
            <v-icon size="18">mdi-eraser</v-icon>
          </v-btn>

          <!-- 【新增】画质调节 -->
          <v-menu offset-y left>
            <template v-slot:activator="{ props }">
              <v-btn variant="text" size="small" v-bind="props" class="tool-btn_ZWZW" :title="'画质: ' + qualityLabel">
                <v-icon size="18">{{ qualityIcon }}</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="q in qualityOptions"
                :key="q.value"
                :active="qualityLevel === q.value"
                @click="setQuality(q.value)"
              >
                <template v-slot:prepend>
                  <v-icon size="16" :color="qualityLevel === q.value ? 'primary' : 'default'">
                    {{ q.icon }}
                  </v-icon>
                </template>
                <v-list-item-title>{{ q.label }}</v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ q.desc }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>

        <!-- 【ZWZW修复】视频容器 - 确保完整显示视频 -->
        <div class="video-wrapper_ZWZW" ref="videoWrapper">
          <video
            ref="videoElement"
            autoplay
            playsinline
            muted
            class="remote-video_ZWZW"
            :class="{ 'drawing_ZWZW': annotationActive_ZWZW }"
            @loadedmetadata="handleVideoMetadata_ZWZW"
            @pointerdown="handlePointerDown_ZWZW"
            @pointermove="handlePointerMove_ZWZW"
            @pointerup="handlePointerUp_ZWZW"
            @pointercancel="handlePointerCancel_ZWZW"
          />
          <!-- 【ZWZW修复】画笔Canvas - 画笔未激活时pointer-events: none让触摸穿透 -->
          <canvas
            v-show="annotationStrokes_ZWZW.length > 0 || annotationActive_ZWZW"
            ref="annotationCanvas_ZWZW"
            class="annotation-canvas_ZWZW"
            :class="{ 'penetrable_ZWZW': !annotationActive_ZWZW }"
            @pointerdown="onAnnotationCanvasDown_ZWZW"
            @pointermove="onAnnotationCanvasMove_ZWZW"
            @pointerup="onAnnotationCanvasUp_ZWZW"
          />
        </div>
      </div>

      <!-- 【ZWZW修复】导航栏不因画笔状态隐藏 -->
      <div v-if="canControl" class="nav-bar_ZWZW">
        <button class="nav-btn_ZWZW" @click.stop="handleBackKey_ZWZW">
          <v-icon size="20">mdi-arrow-left</v-icon>
        </button>
        <button class="nav-btn_ZWZW" @click.stop="handleHomeKey_ZWZW">
          <v-icon size="20">mdi-circle-outline</v-icon>
        </button>
        <button class="nav-btn_ZWZW" @click.stop="handleRecentsKey_ZWZW">
          <v-icon size="20">mdi-square-outline</v-icon>
        </button>
      </div>
    </div>

    <v-snackbar v-model="showError" color="error" timeout="5000">
      {{ error }}
      <template v-slot:actions>
        <v-btn variant="text" size="small" @click="showError = false">关闭</v-btn>
      </template>
    </v-snackbar>

    <v-snackbar v-model="showDisconnected" color="warning" timeout="3000">
      连接已断开
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
/**
 * 远程观看面板组件 _ZWZW
 * 
 * 【ZWZW修改说明】
 * - 修复画笔功能：使用归一化坐标，正确同步
 * - 修复导航栏按钮控制问题
 * - 修复权限同步问题
 * - 【ZWZW修复】画笔数据与屏幕控制完全隔离
 * - 【ZWZW修复】视频实际显示区域计算，正确处理黑边
 */

import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { useScreenViewer } from '@/composables/use-screen-viewer';
import type { AnnotationSyncMessage_ZWZW } from '@/composables/use-annotation_ZWZW';

const props = defineProps<{
  initialPeerId?: string;
}>();

const hostPeerId = ref('');
const showError = ref(false);
const showDisconnected = ref(false);
const videoElement = ref<HTMLVideoElement | null>(null);
const videoWrapper = ref<HTMLDivElement | null>(null);
const annotationCanvas_ZWZW = ref<HTMLCanvasElement | null>(null);

const {
  isConnected,
  connectionState,
  error,
  remoteStream,
  connect,
  disconnect,
  sendCommand,
  canControl,
  sendAnnotation_ZWZW,
  onAnnotationMessage_ZWZW,
  videoWidth,
  videoHeight,
  deviceWidth,
  deviceHeight,
  deviceRotation,
  sendQualityRequest,
} = useScreenViewer();

// 【ZWZW新增】画笔状态（与屏幕控制完全隔离）
const annotationActive_ZWZW = ref(false);
const annotationColor_ZWZW = ref('#ef4444');
const annotationLineWidth_ZWZW = ref(3);

const colorOptions_ZWZW = [
  { id: 'red', name: '红色', value: '#ef4444' },
  { id: 'orange', name: '橙色', value: '#f97316' },
  { id: 'yellow', name: '黄色', value: '#eab308' },
  { id: 'green', name: '绿色', value: '#22c55e' },
  { id: 'blue', name: '蓝色', value: '#3b82f6' },
  { id: 'purple', name: '紫色', value: '#a855f7' },
  { id: 'white', name: '白色', value: '#ffffff' },
];

// 【新增】画质控制 - 支持帧率和分辨率
type QualityLevel = 'auto' | 'low' | 'medium' | 'high';
const qualityLevel = ref<QualityLevel>('auto');
const qualityOptions = [
  { value: 'auto' as QualityLevel, label: '自动', desc: '自适应网络', icon: 'mdi-auto-fix', frameRate: 30, scale: 1 },
  { value: 'low' as QualityLevel, label: '流畅', desc: '15fps · 50%分辨率', icon: 'mdi-speedometer-slow', frameRate: 15, scale: 0.5 },
  { value: 'medium' as QualityLevel, label: '标准', desc: '30fps · 75%分辨率', icon: 'mdi-speedometer-medium', frameRate: 30, scale: 0.75 },
  { value: 'high' as QualityLevel, label: '高清', desc: '60fps · 原分辨率', icon: 'mdi-speedometer', frameRate: 60, scale: 1 },
];
const qualityLabel = computed(() => qualityOptions.find(q => q.value === qualityLevel.value)?.label || '自动');
const qualityIcon = computed(() => qualityOptions.find(q => q.value === qualityLevel.value)?.icon || 'mdi-auto-fix');

// 【ZWZW新增】画笔数据存储（归一化坐标，与屏幕控制隔离）
interface AnnotationStroke_ZWZW {
  id: string;
  color: string;
  lineWidth: number;
  points: Array<{ x: number; y: number }>;
  timestamp: number;
  source: 'local' | 'remote';
}

const annotationStrokes_ZWZW = ref<AnnotationStroke_ZWZW[]>([]);
let currentStroke_ZWZW: AnnotationStroke_ZWZW | null = null;
let strokeIdCounter_ZWZW = 0;
let isDrawing_ZWZW = false;
let annotationCtx_ZWZW: CanvasRenderingContext2D | null = null;

const videoLoaded = ref(false);

// 【ZWZW新增】视频实际显示区域（考虑object-fit: contain的黑边）
interface VideoDisplayBox {
  x: number;      // 相对容器的偏移X
  y: number;      // 相对容器的偏移Y
  width: number;  // 实际显示宽度
  height: number; // 实际显示高度
}
const videoDisplayBox = ref<VideoDisplayBox>({ x: 0, y: 0, width: 0, height: 0 });

// ========== 视频尺寸适配 ==========

function handleVideoMetadata_ZWZW(): void {
  videoLoaded.value = true;
  updateVideoSize_ZWZW();
}

// 【ZWZW新增】计算视频实际显示区域（考虑object-fit: contain）
function calculateVideoDisplayBox_ZWZW(): VideoDisplayBox {
  if (!videoElement.value || !videoWrapper.value) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  const video = videoElement.value;
  const wrapper = videoWrapper.value;
  
  // 视频原始尺寸
  const videoW = video.videoWidth || videoWidth.value;
  const videoH = video.videoHeight || videoHeight.value;
  
  // 【ZWZW修复】如果视频尺寸无效，返回容器全尺寸（等待视频加载）
  if (!videoW || !videoH || videoW <= 0 || videoH <= 0) {
    return { 
      x: 0, 
      y: 0, 
      width: wrapper.clientWidth, 
      height: wrapper.clientHeight 
    };
  }
  
  const videoAspect = videoW / videoH;
  
  // 容器尺寸
  const containerW = wrapper.clientWidth;
  const containerH = wrapper.clientHeight;
  const containerAspect = containerW / containerH;
  
  // 计算实际显示尺寸（object-fit: contain）
  let displayW: number, displayH: number, offsetX: number, offsetY: number;
  
  if (videoAspect > containerAspect) {
    // 视频更宽，以宽度为准
    displayW = containerW;
    displayH = containerW / videoAspect;
    offsetX = 0;
    offsetY = (containerH - displayH) / 2;
  } else {
    // 视频更高，以高度为准
    displayH = containerH;
    displayW = containerH * videoAspect;
    offsetX = (containerW - displayW) / 2;
    offsetY = 0;
  }
  
  return { x: offsetX, y: offsetY, width: displayW, height: displayH };
}

function updateVideoSize_ZWZW(): void {
  if (!videoElement.value || !videoWrapper.value) return;
  
  const wrapper = videoWrapper.value;
  const video = videoElement.value;
  
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'contain';
  
  // 【ZWZW修复】立即计算视频实际显示区域（不用 nextTick）
  const newBox = calculateVideoDisplayBox_ZWZW();
  
  // 【ZWZW修复】检查尺寸是否变化
  const sizeChanged = 
    Math.abs(newBox.width - videoDisplayBox.value.width) > 1 ||
    Math.abs(newBox.height - videoDisplayBox.value.height) > 1;
  
  videoDisplayBox.value = newBox;
  
  // 【ZWZW修复】尺寸变化时需要更新Canvas
  nextTick(() => {
    if (annotationCanvas_ZWZW.value && (sizeChanged || !annotationCtx_ZWZW)) {
      syncAnnotationCanvasSize_ZWZW();
    } else if (annotationStrokes_ZWZW.value.length > 0 && annotationCtx_ZWZW) {
      // 尺寸没变但有画笔数据，也需要重绘
      redrawAllStrokes_ZWZW();
    }
  });
}

function syncAnnotationCanvasSize_ZWZW(): void {
  if (!annotationCanvas_ZWZW.value || !videoWrapper.value) return;
  
  const wrapper = videoWrapper.value;
  const canvas = annotationCanvas_ZWZW.value;
  
  // 【ZWZW修复】Canvas尺寸与容器一致，绘制时考虑视频实际显示区域
  const newWidth = wrapper.clientWidth;
  const newHeight = wrapper.clientHeight;
  
  // 检查是否需要更新
  if (canvas.width !== newWidth || canvas.height !== newHeight || !annotationCtx_ZWZW) {
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
    
    annotationCtx_ZWZW = canvas.getContext('2d');
    if (annotationCtx_ZWZW) {
      annotationCtx_ZWZW.lineCap = 'round';
      annotationCtx_ZWZW.lineJoin = 'round';
    }
  }
  
  // 始终重绘
  redrawAllStrokes_ZWZW();
}

// 监听容器尺寸变化
let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver_ZWZW(): void {
  if (!videoWrapper.value) return;
  
  resizeObserver = new ResizeObserver(() => {
    updateVideoSize_ZWZW();
  });
  
  resizeObserver.observe(videoWrapper.value);
}

// ========== 指针事件处理 ==========

// 【ZWZW新增】将容器坐标转换为视频实际显示区域坐标（用于触摸控制）
function containerToVideoCoords_ZWZW(clientX: number, clientY: number): { x: number; y: number } | null {
  if (!videoWrapper.value) return null;
  
  const box = videoDisplayBox.value;
  
  // 【ZWZW修复】如果显示区域无效，返回 null
  if (box.width <= 0 || box.height <= 0) {
    console.warn('[ViewerPanel_ZWZW] 视频显示区域无效');
    return null;
  }
  
  const rect = videoWrapper.value.getBoundingClientRect();
  
  // 相对容器的坐标
  const containerX = clientX - rect.left;
  const containerY = clientY - rect.top;
  
  // 转换为相对视频实际显示区域的坐标
  const videoX = containerX - box.x;
  const videoY = containerY - box.y;
  
  // 归一化到视频区域（0-1）
  const x = videoX / box.width;
  const y = videoY / box.height;
  
  // 【ZWZW修复】如果坐标在视频区域外，返回 null（点击在黑边区域）
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }
  
  return { x, y };
}

// 【ZWZW修复】自定义触摸命令发送（考虑视频实际显示区域）
function sendCustomTouchCommand(action: 'down' | 'move' | 'up', e: PointerEvent): void {
  if (!canControl.value) return;
  
  // 【ZWZW修复】确保坐标计算有效
  const box = videoDisplayBox.value;
  if (box.width <= 0 || box.height <= 0) {
    console.warn('[ViewerPanel_ZWZW] 视频显示区域无效，忽略触摸命令');
    return;
  }
  
  const coords = containerToVideoCoords_ZWZW(e.clientX, e.clientY);
  if (!coords) {
    // 点击在黑边区域，忽略
    return;
  }
  
  // 【ZWZW修复】验证坐标有效性
  if (isNaN(coords.x) || isNaN(coords.y) || !isFinite(coords.x) || !isFinite(coords.y)) {
    console.warn('[ViewerPanel_ZWZW] 坐标计算无效，忽略触摸命令');
    return;
  }
  
  // 【ZWZW新增】验证设备尺寸是否同步（仅用于调试，实际坐标转换在分享端）
  if (deviceWidth.value > 0 && deviceHeight.value > 0) {
    // 坐标验证通过
  }
  
  const command = {
    type: 'touch',
    action,
    x: coords.x,
    y: coords.y,
    pointerId: e.pointerId,
  };
  
  sendCommand(command);
}

function handlePointerDown_ZWZW(e: PointerEvent): void {
  // 【ZWZW修复】画笔激活时，清理可能残留的触摸点，但不处理触摸控制
  if (annotationActive_ZWZW.value) {
    touchPointers_ZWZW.delete(e.pointerId);
    return;
  }
  if (!canControl.value) return;

  e.preventDefault();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);

  // 【性能优化】直接计算并发送，避免不必要的状态更新
  const coords = containerToVideoCoords_ZWZW(e.clientX, e.clientY);
  if (coords) {
    sendCommand({
      type: 'touch',
      action: 'down',
      x: coords.x,
      y: coords.y,
      pointerId: e.pointerId,
    });
  }

  // 记录活跃的触摸点
  touchPointers_ZWZW.set(e.pointerId, true);
}

function handlePointerMove_ZWZW(e: PointerEvent): void {
  // 【ZWZW修复】画笔激活时清理残留点
  if (annotationActive_ZWZW.value) {
    touchPointers_ZWZW.delete(e.pointerId);
    return;
  }
  if (!canControl.value) return;
  if (!touchPointers_ZWZW.has(e.pointerId)) return;

  e.preventDefault();

  // 【性能优化】使用 RAF 节流，避免高频事件阻塞
  pendingMoveEvent_ZWZW = e;
  scheduleTouchMove_ZWZW();
}

function handlePointerUp_ZWZW(e: PointerEvent): void {
  // 【ZWZW修复】无论画笔状态如何，都要清理触摸点
  if (!touchPointers_ZWZW.has(e.pointerId)) {
    // 不在追踪中，但也要释放 pointer capture
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    return;
  }

  touchPointers_ZWZW.delete(e.pointerId);

  // 取消待处理的 move 事件
  if (rafId_ZWZW !== null) {
    cancelAnimationFrame(rafId_ZWZW);
    rafId_ZWZW = null;
    pendingMoveEvent_ZWZW = null;
  }

  if (annotationActive_ZWZW.value) return;
  if (!canControl.value) return;

  e.preventDefault();
  try {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {}

  // 【性能优化】直接计算并发送
  const coords = containerToVideoCoords_ZWZW(e.clientX, e.clientY);
  if (coords) {
    sendCommand({
      type: 'touch',
      action: 'up',
      x: coords.x,
      y: coords.y,
      pointerId: e.pointerId,
    });
  }
}

// 【ZWZW新增】追踪活跃的触摸点
const touchPointers_ZWZW = new Map<number, boolean>();

// 【新增】性能优化 - 使用 RAF 节流触摸移动事件
let pendingMoveEvent_ZWZW: PointerEvent | null = null;
let rafId_ZWZW: number | null = null;

function scheduleTouchMove_ZWZW(): void {
  if (rafId_ZWZW !== null) return;
  rafId_ZWZW = requestAnimationFrame(() => {
    rafId_ZWZW = null;
    if (pendingMoveEvent_ZWZW) {
      const e = pendingMoveEvent_ZWZW;
      pendingMoveEvent_ZWZW = null;
      // 直接发送，不再重新计算坐标
      const coords = containerToVideoCoords_ZWZW(e.clientX, e.clientY);
      if (coords) {
        sendCommand({
          type: 'touch',
          action: 'move',
          x: coords.x,
          y: coords.y,
          pointerId: e.pointerId,
        });
      }
    }
  });
}

function handlePointerCancel_ZWZW(e: PointerEvent): void {
  if (touchPointers_ZWZW.has(e.pointerId)) {
    touchPointers_ZWZW.delete(e.pointerId);
  }
}

// ========== 画笔 Canvas 事件处理 ==========

function generateStrokeId_ZWZW(): string {
  return `stroke_${Date.now()}_${++strokeIdCounter_ZWZW}`;
}

function redrawAllStrokes_ZWZW(): void {
  if (!annotationCtx_ZWZW || !annotationCanvas_ZWZW.value) return;
  
  const canvas = annotationCanvas_ZWZW.value;
  const box = videoDisplayBox.value;
  
  annotationCtx_ZWZW.clearRect(0, 0, canvas.width, canvas.height);
  
  // 【ZWZW修复】绘制所有线条时考虑视频实际显示区域偏移
  annotationStrokes_ZWZW.value.forEach(stroke => {
    if (stroke.points.length < 2) return;
    
    annotationCtx_ZWZW!.beginPath();
    annotationCtx_ZWZW!.strokeStyle = stroke.color;
    annotationCtx_ZWZW!.lineWidth = stroke.lineWidth;
    
    // 第一个点：归一化坐标 -> 视频显示区域坐标
    const startPoint = {
      x: box.x + stroke.points[0].x * box.width,
      y: box.y + stroke.points[0].y * box.height,
    };
    annotationCtx_ZWZW!.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      const point = {
        x: box.x + stroke.points[i].x * box.width,
        y: box.y + stroke.points[i].y * box.height,
      };
      annotationCtx_ZWZW!.lineTo(point.x, point.y);
    }
    
    annotationCtx_ZWZW!.stroke();
  });
  
  // 绘制当前正在画的线条
  if (currentStroke_ZWZW && currentStroke_ZWZW.points.length >= 2) {
    annotationCtx_ZWZW.beginPath();
    annotationCtx_ZWZW.strokeStyle = currentStroke_ZWZW.color;
    annotationCtx_ZWZW.lineWidth = currentStroke_ZWZW.lineWidth;
    
    const startPoint = {
      x: box.x + currentStroke_ZWZW.points[0].x * box.width,
      y: box.y + currentStroke_ZWZW.points[0].y * box.height,
    };
    annotationCtx_ZWZW.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < currentStroke_ZWZW.points.length; i++) {
      const point = {
        x: box.x + currentStroke_ZWZW.points[i].x * box.width,
        y: box.y + currentStroke_ZWZW.points[i].y * box.height,
      };
      annotationCtx_ZWZW.lineTo(point.x, point.y);
    }
    
    annotationCtx_ZWZW.stroke();
  }
}

function toggleAnnotation_ZWZW(): void {
  annotationActive_ZWZW.value = !annotationActive_ZWZW.value;
}

// 【新增】画质设置 - 支持帧率和分辨率
function setQuality(level: QualityLevel): void {
  qualityLevel.value = level;
  const option = qualityOptions.find(q => q.value === level);
  if (option) {
    // 发送画质请求到分享端（帧率 + 分辨率缩放）
    sendQualityRequest(option.frameRate, option.scale);
  }
}

function onAnnotationCanvasDown_ZWZW(e: PointerEvent): void {
  if (!annotationActive_ZWZW.value || !annotationCanvas_ZWZW.value) return;
  
  syncAnnotationCanvasSize_ZWZW();
  
  const box = videoDisplayBox.value;
  const rect = annotationCanvas_ZWZW.value.getBoundingClientRect();
  
  // 相对容器的坐标
  const containerX = e.clientX - rect.left;
  const containerY = e.clientY - rect.top;
  
  // 转换为相对视频实际显示区域的坐标
  const videoX = containerX - box.x;
  const videoY = containerY - box.y;
  
  // 归一化到视频区域（0-1）
  const x = videoX / box.width;
  const y = videoY / box.height;
  
  // 【ZWZW修复】限制在视频区域内
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  
  currentStroke_ZWZW = {
    id: generateStrokeId_ZWZW(),
    color: annotationColor_ZWZW.value,
    lineWidth: annotationLineWidth_ZWZW.value,
    points: [{ x: clampedX, y: clampedY }],
    timestamp: Date.now(),
    source: 'local',
  };
  
  isDrawing_ZWZW = true;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}

function onAnnotationCanvasMove_ZWZW(e: PointerEvent): void {
  if (!isDrawing_ZWZW || !currentStroke_ZWZW || !annotationCanvas_ZWZW.value) return;
  
  const box = videoDisplayBox.value;
  const rect = annotationCanvas_ZWZW.value.getBoundingClientRect();
  
  // 相对容器的坐标
  const containerX = e.clientX - rect.left;
  const containerY = e.clientY - rect.top;
  
  // 转换为相对视频实际显示区域的坐标
  const videoX = containerX - box.x;
  const videoY = containerY - box.y;
  
  // 归一化到视频区域（0-1）
  const x = videoX / box.width;
  const y = videoY / box.height;
  
  // 【ZWZW修复】限制在视频区域内
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  
  currentStroke_ZWZW.points.push({ x: clampedX, y: clampedY });
  redrawAllStrokes_ZWZW();
}

function onAnnotationCanvasUp_ZWZW(e: PointerEvent): void {
  if (!isDrawing_ZWZW || !currentStroke_ZWZW) {
    isDrawing_ZWZW = false;
    return;
  }
  
  isDrawing_ZWZW = false;
  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  
  // 保存线条
  if (currentStroke_ZWZW.points.length >= 2) {
    annotationStrokes_ZWZW.value.push(currentStroke_ZWZW);
    
    // 【ZWZW修复】同步到分享端
    if (sendAnnotation_ZWZW) {
      const msg: AnnotationSyncMessage_ZWZW = {
        type: 'annotation',
        action: 'stroke',
        data: currentStroke_ZWZW,
      };
      sendAnnotation_ZWZW(msg);
    }
  }
  
  currentStroke_ZWZW = null;
}

function clearAllStrokes_ZWZW(): void {
  annotationStrokes_ZWZW.value = [];
  
  if (annotationCtx_ZWZW && annotationCanvas_ZWZW.value) {
    annotationCtx_ZWZW.clearRect(0, 0, annotationCanvas_ZWZW.value.width, annotationCanvas_ZWZW.value.height);
  }
  
  // 【ZWZW修复】同步清除到分享端
  if (sendAnnotation_ZWZW) {
    const msg: AnnotationSyncMessage_ZWZW = {
      type: 'annotation',
      action: 'clear_all',
    };
    sendAnnotation_ZWZW(msg);
  }
}

// ========== 导航栏按钮处理 ==========

function handleBackKey_ZWZW(): void {
  if (!canControl.value) return;
  sendCommand({ type: 'key', key: 'back' });
}

function handleHomeKey_ZWZW(): void {
  if (!canControl.value) return;
  sendCommand({ type: 'key', key: 'home' });
}

function handleRecentsKey_ZWZW(): void {
  if (!canControl.value) return;
  sendCommand({ type: 'key', key: 'recents' });
}

// ========== 生命周期 ==========

onMounted(() => {
  if (props.initialPeerId) {
    hostPeerId.value = props.initialPeerId;
    setTimeout(() => {
      handleConnect();
    }, 500);
  }
  
  // 【ZWZW修复】设置标注消息处理回调
  onAnnotationMessage_ZWZW.value = (data: unknown) => {
    if (!data || typeof data !== 'object') return false;
    
    const msg = data as Record<string, unknown>;
    if (msg.type !== 'annotation') return false;
    
    const action = msg.action as string;
    
    if (action === 'clear_all') {
      annotationStrokes_ZWZW.value = [];
      // 【ZWZW修复】清除后也重绘（清空Canvas）
      nextTick(() => {
        if (annotationCtx_ZWZW && annotationCanvas_ZWZW.value) {
          annotationCtx_ZWZW.clearRect(0, 0, annotationCanvas_ZWZW.value.width, annotationCanvas_ZWZW.value.height);
        }
      });
      return true;
    }
    
    if (action === 'clear') {
      if (annotationStrokes_ZWZW.value.length > 0) {
        annotationStrokes_ZWZW.value.pop();
        nextTick(() => {
          syncAnnotationCanvasSize_ZWZW();
        });
      }
      return true;
    }
    
    if (action === 'stroke' && msg.data) {
      const stroke = msg.data as AnnotationStroke_ZWZW;
      stroke.source = 'remote';
      annotationStrokes_ZWZW.value.push(stroke);
      nextTick(() => {
        syncAnnotationCanvasSize_ZWZW();
      });
      return true;
    }
    
    return false;
  };
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  // 【新增】清理 RAF
  if (rafId_ZWZW !== null) {
    cancelAnimationFrame(rafId_ZWZW);
    rafId_ZWZW = null;
  }
});

watch(error, (newError) => {
  if (newError) showError.value = true;
});

watch(connectionState, (newState, oldState) => {
  if (oldState === 'connected' && newState === 'disconnected') {
    showDisconnected.value = true;
  }
});

// 【ZWZW新增】监听权限变化
watch(canControl, () => {
  // 权限变化时无需额外处理，UI 已自动响应
});

// 【ZWZW修复】监听画笔状态变化，清理活跃的触摸点
watch(annotationActive_ZWZW, (active) => {
  if (active) {
    // 画笔激活时，清理所有活跃的触摸点
    touchPointers_ZWZW.clear();
  } else {
    // 【ZWZW修复】画笔禁用时，清理绘制状态
    if (isDrawing_ZWZW && currentStroke_ZWZW) {
      // 保存当前线条（如果有效）
      if (currentStroke_ZWZW.points.length >= 2) {
        annotationStrokes_ZWZW.value.push(currentStroke_ZWZW);
      }
    }
    isDrawing_ZWZW = false;
    currentStroke_ZWZW = null;
  }
});

// 监听视频流变化
watch(remoteStream, (stream) => {
  if (stream && videoElement.value) {
    videoElement.value.srcObject = stream;
    videoElement.value.play().catch((err) => {
      console.warn('[ViewerPanel] 视频自动播放失败:', err);
    });
    
    nextTick(() => {
      setupResizeObserver_ZWZW();
    });
  }
});

// 监听视频元素变化
watch(videoElement, (video) => {
  if (video && remoteStream.value) {
    video.srcObject = remoteStream.value;
    video.play().catch((err) => {
      console.warn('[ViewerPanel] 视频自动播放失败:', err);
    });
    
    // 【ZWZW修复】视频元素变化时也初始化Canvas
    nextTick(() => {
      if (videoWrapper.value && annotationCanvas_ZWZW.value) {
        syncAnnotationCanvasSize_ZWZW();
      }
    });
  }
});

// 监听视频尺寸变化
watch([videoWidth, videoHeight], () => {
  updateVideoSize_ZWZW();
});

// 【ZWZW修复】监听画笔数据变化，自动重绘
watch(annotationStrokes_ZWZW, () => {
  if (annotationStrokes_ZWZW.value.length > 0) {
    nextTick(() => {
      syncAnnotationCanvasSize_ZWZW();
    });
  }
}, { deep: true });

// 【ZWZW新增】监听画笔激活状态
watch(annotationActive_ZWZW, (active) => {
  if (active) {
    nextTick(() => {
      syncAnnotationCanvasSize_ZWZW();
    });
  }
});

async function handleConnect() {
  if (!hostPeerId.value.trim()) return;
  try {
    await connect(hostPeerId.value.trim());
  } catch (err) {
    console.error('连接失败:', err);
  }
}

function handleDisconnect() {
  disconnect();
  hostPeerId.value = '';
  annotationStrokes_ZWZW.value = [];
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
}
</script>

<style scoped>
/* 【ZWZW修复】确保面板填充整个容器 */
.viewer-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.connection-form {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 16px;
}

.connect-card {
  max-width: 400px;
  width: 100%;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.cc-header {
  display: flex;
  align-items: center;
  padding: 16px 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(24, 24, 27, 0.85);
}

.cc-title {
  font-size: 15px;
  font-weight: 600;
}

.cc-body {
  padding: 16px 16px 8px;
}

.cc-actions {
  display: flex;
  align-items: center;
  padding: 8px 16px 16px;
}

.video-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* 【ZWZW修复】确保视频区域占满容器 */
  width: 100%;
  flex: 1;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #16a34a;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
}

/* 【ZWZW修改】权限状态样式 - 不突出 */
.permission-status_ZWZW {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
  font-size: 11px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.5);
}

.permission-status_ZWZW.can-control {
  background: rgba(34, 197, 94, 0.08);
  color: #16a34a;
}

/* 【ZWZW修复】视频容器 + 侧边工具栏布局 - 确保视频完整显示 */
.video-container_ZWZW {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
  width: 100%;
  /* 确保容器填充剩余空间 */
  overflow: hidden;
}

/* 【ZWZW修复】侧边画笔工具栏 - 使用白色背景 */
.side-toolbar_ZWZW {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.95);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.tool-btn_ZWZW {
  min-width: 36px !important;
  width: 36px !important;
  height: 36px !important;
  padding: 0 !important;
}

.color-dot_ZWZW {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* 【ZWZW修改】视频容器样式 - 确保完整显示 */
.video-wrapper_ZWZW {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #18181b;
  overflow: hidden;
  touch-action: none;
  position: relative;
  min-height: 0;
  /* 关键：确保容器填充整个区域 */
  width: 100%;
  padding: 0;
  margin: 0;
}

/* 【ZWZW修复】视频样式 - 确保完整显示不被裁剪 */
.remote-video_ZWZW {
  width: 100%;
  height: 100%;
  object-fit: contain !important;
  object-position: center center;
  touch-action: none;
  /* 确保不被裁剪 - 使用 max 尺寸限制 */
  max-width: 100%;
  max-height: 100%;
  /* 防止 aspect ratio 导致的裁剪 */
  aspect-ratio: auto;
}

/* 【ZWZW新增】画笔模式时的视频样式 */
.remote-video_ZWZW.drawing_ZWZW {
  cursor: crosshair;
}

/* 【ZWZW新增】画笔 Canvas 叠加层 */
.annotation-canvas_ZWZW {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  /* 【ZWZW修复】默认允许触摸穿透 */
  pointer-events: none !important;
}

/* 【ZWZW修复】画笔激活时，Canvas 捕获触摸事件 */
.annotation-canvas_ZWZW:not(.penetrable_ZWZW) {
  pointer-events: auto !important;
  touch-action: none !important;
  cursor: crosshair;
}

/* 【ZWZW修改】导航栏样式 */
.nav-bar_ZWZW {
  display: flex;
  justify-content: space-around;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: rgb(var(--v-theme-surface));
}

.nav-btn_ZWZW {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(24, 24, 27, 0.6);
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.nav-btn_ZWZW:hover {
  background: rgba(24, 24, 27, 0.06);
}

.nav-btn_ZWZW:active {
  transform: scale(0.95);
}
</style>
