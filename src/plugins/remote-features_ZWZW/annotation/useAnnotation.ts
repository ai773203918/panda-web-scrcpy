/**
 * 画笔标注模块 - 组合式函数
 * 
 * 提供画笔状态管理和绘制逻辑
 */

import { ref, type Ref, type ShallowRef } from 'vue';
import type { AnnotationStroke, AnnotationSyncMessage, VideoDisplayBox } from './types';

export interface UseAnnotationOptions {
  onStroke?: (stroke: AnnotationStroke) => void;
  onClearAll?: () => void;
}

export interface UseAnnotationReturn {
  // 状态
  active: Ref<boolean>;
  color: Ref<string>;
  lineWidth: Ref<number>;
  strokes: Ref<AnnotationStroke[]>;
  currentStroke: Ref<AnnotationStroke | null>;
  isDrawing: Ref<boolean>;
  
  // 方法
  toggle: () => void;
  setColor: (color: string) => void;
  setLineWidth: (width: number) => void;
  clearAll: () => void;
  clearLast: () => void;
  addStroke: (stroke: AnnotationStroke) => void;
  
  // 绘制相关
  startStroke: (x: number, y: number) => void;
  addPoint: (x: number, y: number) => void;
  endStroke: () => AnnotationStroke | null;
  
  // 同步相关
  createSyncMessage: (action: 'stroke' | 'clear' | 'clear_all', stroke?: AnnotationStroke) => AnnotationSyncMessage;
  handleSyncMessage: (msg: AnnotationSyncMessage) => boolean;
}

let strokeIdCounter = 0;

export function useAnnotation(options: UseAnnotationOptions = {}): UseAnnotationReturn {
  const active = ref(false);
  const color = ref('#ef4444');
  const lineWidth = ref(3);
  const strokes = ref<AnnotationStroke[]>([]);
  const currentStroke = ref<AnnotationStroke | null>(null);
  const isDrawing = ref(false);
  
  function generateStrokeId(): string {
    return `stroke_${Date.now()}_${++strokeIdCounter}`;
  }
  
  function toggle(): void {
    active.value = !active.value;
  }
  
  function setColor(c: string): void {
    color.value = c;
  }
  
  function setLineWidth(w: number): void {
    lineWidth.value = w;
  }
  
  function clearAll(): void {
    strokes.value = [];
    currentStroke.value = null;
    options.onClearAll?.();
  }
  
  function clearLast(): void {
    if (strokes.value.length > 0) {
      strokes.value.pop();
    }
  }
  
  function addStroke(stroke: AnnotationStroke): void {
    strokes.value.push(stroke);
  }
  
  function startStroke(x: number, y: number): void {
    currentStroke.value = {
      id: generateStrokeId(),
      color: color.value,
      lineWidth: lineWidth.value,
      points: [{ x, y }],
      timestamp: Date.now(),
      source: 'local',
    };
    isDrawing.value = true;
  }
  
  function addPoint(x: number, y: number): void {
    if (currentStroke.value) {
      // 限制在 0-1 范围内
      const clampedX = Math.max(0, Math.min(1, x));
      const clampedY = Math.max(0, Math.min(1, y));
      currentStroke.value.points.push({ x: clampedX, y: clampedY });
    }
  }
  
  function endStroke(): AnnotationStroke | null {
    if (!currentStroke.value || currentStroke.value.points.length < 2) {
      currentStroke.value = null;
      isDrawing.value = false;
      return null;
    }
    
    const stroke = currentStroke.value;
    strokes.value.push(stroke);
    currentStroke.value = null;
    isDrawing.value = false;
    
    options.onStroke?.(stroke);
    return stroke;
  }
  
  function createSyncMessage(
    action: 'stroke' | 'clear' | 'clear_all',
    stroke?: AnnotationStroke
  ): AnnotationSyncMessage {
    return {
      type: 'annotation',
      action,
      data: stroke,
    } as AnnotationSyncMessage;
  }
  
  function handleSyncMessage(msg: AnnotationSyncMessage): boolean {
    if (msg.type !== 'annotation') return false;
    
    switch (msg.action) {
      case 'clear_all':
        strokes.value = [];
        return true;
      case 'clear':
        if (strokes.value.length > 0) {
          strokes.value.pop();
        }
        return true;
      case 'stroke':
        if (msg.data) {
          const stroke = { ...msg.data, source: 'remote' as const };
          strokes.value.push(stroke);
        }
        return true;
      default:
        return false;
    }
  }
  
  return {
    active,
    color,
    lineWidth,
    strokes,
    currentStroke,
    isDrawing,
    toggle,
    setColor,
    setLineWidth,
    clearAll,
    clearLast,
    addStroke,
    startStroke,
    addPoint,
    endStroke,
    createSyncMessage,
    handleSyncMessage,
  };
}

/**
 * 计算视频实际显示区域（考虑 object-fit: contain 的黑边）
 */
export function calculateVideoDisplayBox(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number
): VideoDisplayBox {
  if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight };
  }
  
  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;
  
  let displayW: number, displayH: number, offsetX: number, offsetY: number;
  
  if (videoAspect > containerAspect) {
    displayW = containerWidth;
    displayH = containerWidth / videoAspect;
    offsetX = 0;
    offsetY = (containerHeight - displayH) / 2;
  } else {
    displayH = containerHeight;
    displayW = containerHeight * videoAspect;
    offsetX = (containerWidth - displayW) / 2;
    offsetY = 0;
  }
  
  return { x: offsetX, y: offsetY, width: displayW, height: displayH };
}

/**
 * 在 Canvas 上绘制所有画笔
 */
export function drawStrokesOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  strokes: AnnotationStroke[],
  currentStroke: AnnotationStroke | null,
  displayBox: VideoDisplayBox
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  const drawStroke = (stroke: AnnotationStroke) => {
    if (stroke.points.length < 2) return;
    
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    
    const startPoint = {
      x: displayBox.x + stroke.points[0].x * displayBox.width,
      y: displayBox.y + stroke.points[0].y * displayBox.height,
    };
    ctx.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      const point = {
        x: displayBox.x + stroke.points[i].x * displayBox.width,
        y: displayBox.y + stroke.points[i].y * displayBox.height,
      };
      ctx.lineTo(point.x, point.y);
    }
    
    ctx.stroke();
  };
  
  // 绘制已完成的线条
  strokes.forEach(drawStroke);
  
  // 绘制当前正在画的线条
  if (currentStroke && currentStroke.points.length >= 2) {
    drawStroke(currentStroke);
  }
}
