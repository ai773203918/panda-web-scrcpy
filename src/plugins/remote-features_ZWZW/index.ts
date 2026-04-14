/**
 * 远程功能插件 - 主入口
 * 
 * 该插件提供以下功能：
 * 1. 权限控制 - 远程控制权限管理
 * 2. 画笔标注 - 远程协作画笔
 * 3. 画质控制 - 帧率和分辨率调整
 * 
 * 所有功能均可独立启用/禁用，与上游代码低耦合。
 */

// 配置
export * from './config';

// 权限模块
export * from './permission';

// 画质模块
export * from './quality';

// 画笔模块
export * from './annotation';

// 类型重导出（方便使用）
import type { RemoteFeaturesConfig } from './config';
import type { RemoteControlLevel, RemoteControlConfig, PermissionSyncMessage } from './permission';
import type { QualityLevel, QualityOption, QualityRequestMessage } from './quality';
import type {
  AnnotationColor,
  AnnotationStroke,
  AnnotationSyncMessage,
  VideoDisplayBox,
  UseAnnotationReturn,
} from './annotation';

export type {
  RemoteFeaturesConfig,
  RemoteControlLevel,
  RemoteControlConfig,
  PermissionSyncMessage,
  QualityLevel,
  QualityOption,
  QualityRequestMessage,
  AnnotationColor,
  AnnotationStroke,
  AnnotationSyncMessage,
  VideoDisplayBox,
  UseAnnotationReturn,
};
