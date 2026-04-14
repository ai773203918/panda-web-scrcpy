/**
 * 画质控制模块 - 类型定义
 * 
 * 独立模块，支持帧率和分辨率调整
 */

export type QualityLevel = 'auto' | 'low' | 'medium' | 'high';

export interface QualityOption {
  value: QualityLevel;
  label: string;
  desc: string;
  icon: string;
  frameRate: number;
  scale: number; // 分辨率缩放比例
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { value: 'auto', label: '自动', desc: '自适应网络', icon: 'mdi-auto-fix', frameRate: 30, scale: 1 },
  { value: 'low', label: '流畅', desc: '15fps · 50%分辨率', icon: 'mdi-speedometer-slow', frameRate: 15, scale: 0.5 },
  { value: 'medium', label: '标准', desc: '30fps · 75%分辨率', icon: 'mdi-speedometer-medium', frameRate: 30, scale: 0.75 },
  { value: 'high', label: '高清', desc: '60fps · 原分辨率', icon: 'mdi-speedometer', frameRate: 60, scale: 1 },
];

export interface QualityRequestMessage {
  type: 'quality_request';
  frameRate: number;
  scale: number;
}

/**
 * 创建画质请求消息
 */
export function createQualityRequestMessage(
  frameRate: number,
  scale: number = 1
): QualityRequestMessage {
  return {
    type: 'quality_request',
    frameRate,
    scale,
  };
}

/**
 * 解析画质请求消息
 */
export function parseQualityRequestMessage(data: unknown): QualityRequestMessage | null {
  if (!data || typeof data !== 'object') return null;
  
  const msg = data as Record<string, unknown>;
  if (msg.type !== 'quality_request') return null;
  
  return {
    type: 'quality_request',
    frameRate: msg.frameRate as number,
    scale: (msg.scale as number) || 1,
  };
}

/**
 * 根据画质等级获取参数
 */
export function getQualityParams(level: QualityLevel): { frameRate: number; scale: number } {
  const option = QUALITY_OPTIONS.find(opt => opt.value === level);
  return option 
    ? { frameRate: option.frameRate, scale: option.scale }
    : { frameRate: 30, scale: 1 };
}
