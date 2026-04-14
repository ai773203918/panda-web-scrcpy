/**
 * 远程功能插件 - 配置
 */

export interface RemoteFeaturesConfig {
  /** 是否启用权限控制功能 */
  permission: boolean;
  /** 是否启用画笔标注功能 */
  annotation: boolean;
  /** 是否启画质控制功能 */
  quality: boolean;
}

export const DEFAULT_REMOTE_FEATURES_CONFIG: RemoteFeaturesConfig = {
  permission: true,
  annotation: true,
  quality: true,
};

/**
 * 创建远程功能配置
 */
export function createRemoteFeaturesConfig(
  overrides: Partial<RemoteFeaturesConfig> = {}
): RemoteFeaturesConfig {
  return {
    ...DEFAULT_REMOTE_FEATURES_CONFIG,
    ...overrides,
  };
}
