/**
 * 画笔标注模块 - 类型定义
 * 
 * 独立模块，用于远程协作画笔标注
 */

export type AnnotationColorId = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'white';

export interface AnnotationColor {
  id: AnnotationColorId;
  name: string;
  value: string;
}

export const ANNOTATION_COLORS: AnnotationColor[] = [
  { id: 'red', name: '红色', value: '#ef4444' },
  { id: 'orange', name: '橙色', value: '#f97316' },
  { id: 'yellow', name: '黄色', value: '#eab308' },
  { id: 'green', name: '绿色', value: '#22c55e' },
  { id: 'blue', name: '蓝色', value: '#3b82f6' },
  { id: 'purple', name: '紫色', value: '#a855f7' },
  { id: 'white', name: '白色', value: '#ffffff' },
];

export interface AnnotationPoint {
  x: number; // 归一化坐标 0-1
  y: number; // 归一化坐标 0-1
}

export interface AnnotationStroke {
  id: string;
  color: string;
  lineWidth: number;
  points: AnnotationPoint[];
  timestamp: number;
  source: 'local' | 'remote';
}

export interface AnnotationSyncMessage {
  type: 'annotation';
  action: 'stroke' | 'clear' | 'clear_all';
  data?: AnnotationStroke;
}

// 为兼容性保留 ZWZW 后缀的类型别名
export type AnnotationColor_ZWZW = AnnotationColor;
export type AnnotationStroke_ZWZW = AnnotationStroke;
export type AnnotationSyncMessage_ZWZW = AnnotationSyncMessage;

export interface AnnotationState {
  active: boolean;
  color: string;
  lineWidth: number;
  strokes: AnnotationStroke[];
}

export interface VideoDisplayBox {
  x: number;      // 相对容器的偏移X
  y: number;      // 相对容器的偏移Y
  width: number;  // 实际显示宽度
  height: number; // 实际显示高度
}
