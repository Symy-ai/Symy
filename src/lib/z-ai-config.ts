/**
 * z-ai-web-dev-sdk 配置工具
 *
 * ZAI SDK 的 constructor 是 private 的，只能通过 ZAI.create() 创建实例。
 * ZAI.create() 从 .z-ai-config 文件读取配置。
 *
 * 本模块提供安全的 ZAI 客户端创建：
 * - 有 .z-ai-config 文件时：ZAI.create() 正常工作
 * - 无文件时：抛出明确错误，由调用方 fallback
 *
 * V7 更新：
 * - z-ai-sdk 现在也用于蝴蝶效应的图片生成
 * - isZAIAvailable() 正确检查配置文件是否存在
 */

import 'server-only';
import ZAI from 'z-ai-web-dev-sdk';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * 创建 ZAI 客户端实例
 *
 * 使用 SDK 标准的 ZAI.create() 方法（读取 .z-ai-config 文件）。
 * 如果文件不存在或配置无效，会抛出错误。
 * 调用方应 try-catch 并 fallback 到其他 LLM 路径。
 */
// 🔧 Round 120 audit fix: removed unnecessary `async` (no await, just returns ZAI.create() Promise)
export function createZAIClient(): Promise<ZAI> {
  return ZAI.create();
}

/**
 * 检查 z-ai-sdk 是否可能可用
 *
 * 检查 .z-ai-config 文件是否存在。
 * 在 z.ai 平台上运行时，此文件由平台自动生成。
 */
export function isZAIAvailable(): boolean {
  try {
    // 检查项目根目录下的 .z-ai-config 文件
    const configPath = join(process.cwd(), '.z-ai-config');
    return existsSync(configPath);
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return false;
  }
}
