/**
 * 画笔标注功能 Hook _ZWZW
 * 
 * 【重构】从插件模块重新导出，保持向后兼容
 * 
 * @deprecated 请使用 '@/plugins/remote-features_ZWZW/annotation'
 */

// 从插件模块重新导出
export {
  // 类型
  type AnnotationColor,
  type AnnotationStroke,
  type AnnotationSyncMessage,
  type VideoDisplayBox,
  type UseAnnotationReturn,
  
  // 常量
  ANNOTATION_COLORS,
  
  // 函数
  useAnnotation,
  calculateVideoDisplayBox,
  drawStrokesOnCanvas,
  
  // 兼容性别名
  type AnnotationColor as AnnotationColor_ZWZW,
  type AnnotationStroke as AnnotationStroke_ZWZW,
  type AnnotationSyncMessage as AnnotationSyncMessage_ZWZW,
  type VideoDisplayBox as VideoDisplayBox_ZWZW,
} from '@/plugins/remote-features_ZWZW/annotation';

// 导入用于额外的兼容性导出
import {
  ANNOTATION_COLORS,
  useAnnotation,
  type AnnotationColor,
  type AnnotationStroke,
  type AnnotationSyncMessage,
  type VideoDisplayBox,
} from '@/plugins/remote-features_ZWZW/annotation';

// 额外的类型定义（保持兼容）
export interface AnnotationConfig_ZWZW {
  color: string;
  lineWidth: number;
}

export interface AnnotationPoint_ZWZW {
  x: number;
  y: number;
  action: 'start' | 'move' | 'end';
}

// 默认配置
export const DEFAULT_ANNOTATION_CONFIG_ZWZW: AnnotationConfig_ZWZW = {
  color: '#ef4444',
  lineWidth: 3,
};

/**
 * 创建画笔 Hook（便捷方法）
 */
export function useAnnotation_ZWZW(options: {
  onStroke?: (stroke: AnnotationStroke) => void;
  onClearAll?: () => void;
} = {}) {
  return useAnnotation(options);
}
