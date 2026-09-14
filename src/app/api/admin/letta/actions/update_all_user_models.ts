/**
 * Handler: update_all_user_models — 注册 glm-5.2 模型 + 批量更新所有用户 Agent 的 LLM 模型
 */

import { AdminCtx, lettaAPI, NextResponse, getMcpServerUrl, validateActionBody } from './_shared';
import { updateAllUserAgentModels } from '@/lib/letta-agent-admin';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `as string | undefined` cast.
const schema = z.object({
  model: z.string().min(1),
});

export async function handleUpdateAllUserModels(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const newModel = result.data.model;

  const logs: string[] = [];

  // Step 1: 确保模型在 Letta 中注册
  logs.push(`Step 1: Registering model "${newModel}" in Letta...`);

  // 检查模型是否已存在
  let modelExists = false;
  try {
    const modelsResp = await lettaAPI('/models/');
    if (modelsResp.ok) {
      const models = await modelsResp.json();
      const modelList = Array.isArray(models) ? models : [];
      const found = modelList.find((m: Record<string, unknown>) => {
        const handle = (m.handle || m.name || '').toString();
        return handle === newModel || handle === `My_deepseek/${newModel}` || handle === `openai-proxy/${newModel}`;
      });
      if (found) {
        modelExists = true;
        logs.push(`  Model already exists: ${(found as Record<string, unknown>).handle || (found as Record<string, unknown>).name}`);
      }
    }
  } catch (e) {
    logs.push(`  Model list check failed: ${e}`);
  }

  // 如果模型不存在，注册它
  if (!modelExists) {
    logs.push(`  Model not found, registering...`);

    // 方式1: 尝试通过 POST /models/ 注册（关联到 My_deepseek provider）
    const addModelResp = await lettaAPI('/models/', {
      method: 'POST',
      body: JSON.stringify({
        name: newModel,
        provider_name: 'My_deepseek',
        provider_type: 'openai',
        model_type: 'llm',
        context_window: 128000,
        max_tokens: 8192,
        handle: `openai-proxy/${newModel}`,
        model_endpoint: `${getMcpServerUrl()}/api/v1`,
        model_endpoint_type: 'openai',
      }),
    });

    if (addModelResp.ok) {
      const addResult = await addModelResp.json();
      logs.push(`  Model registered: ${JSON.stringify(addResult).substring(0, 200)}`);
    } else {
      const errorBody = await addModelResp.text().catch(() => '');
      logs.push(`  POST /models/ failed (${addModelResp.status}): ${errorBody.substring(0, 300)}`);

      // 方式2: 尝试用 provider_id + model_name
      // 🔧 ARCH fix (Round 12 API-12 — 硬编码 providerId 根因修复):
      //    旧代码: const providerId = 'provider-717064ae-...' (My_deepseek provider ID)
      //    → 该 UUID 仅当前账户有效, 其他账户部署时找不到 provider
      //    根因修复: 从 env var 读取 LETTA_PROVIDER_ID, 未配则跳过方式 2
      const providerId = process.env.LETTA_PROVIDER_ID || '';
      if (providerId) {
        const addModelResp2 = await lettaAPI(`/providers/${providerId}/models`, {
          method: 'POST',
          body: JSON.stringify({
            name: newModel,
            model_type: 'llm',
            context_window: 128000,
            max_tokens: 8192,
          }),
        });

        if (addModelResp2.ok) {
          logs.push(`  Model registered via provider endpoint`);
        } else {
          const errorBody2 = await addModelResp2.text().catch(() => '');
          logs.push(`  Provider model add failed (${addModelResp2.status}): ${errorBody2.substring(0, 300)}`);
        }
      } else {
        logs.push(`  Skipped provider endpoint: LETTA_PROVIDER_ID env var not configured`);
      }
    }

    // 🔧 ARCH fix (Round 12 API-12 — setTimeout(5000) 模拟异步 根因修复):
    //    旧代码: await new Promise(r => setTimeout(r, 5000)) — 固定等 5s, 模型可能还没注册好或早已注册好
    //    根因修复: 用 retry 循环检查模型是否注册成功 (最多 5 次 × 1s = 5s, 但有进展时提前退出)
    // 🔧 ARCH fix (Round 47 R47-A-4 — polling 循环类型不一致):
    //    旧代码: line 24 把 /models/ 响应当 Array, line 103 当 { models: Array } — 类型不一致。
    //    Letta API 实际返回数组, 所以 line 103 的 checkData.models?.some 永远 undefined → 永远不检测到 → 等满 5s。
    //    根因修复: 统一用 Array.isArray 处理, 与 line 24 一致。
    logs.push('  Waiting for model registration (polling up to 5s)...');
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const checkResp = await lettaAPI(`/models/`, { method: 'GET' });
        if (checkResp.ok) {
          const checkData = await checkResp.json();
          // Letta API 可能返回 Array 或 { models: Array }, 统一处理
          const modelList = Array.isArray(checkData) ? checkData : (checkData as { models?: unknown[] })?.models || [];
          const registered = (modelList as Array<Record<string, unknown>>).some(m => {
            const handle = (m.handle || m.name || '').toString();
            return handle === newModel || handle === `openai-proxy/${newModel}` || handle === `My_deepseek/${newModel}`;
          });
          if (registered) {
            logs.push(`  Model registered after ${attempt + 1}s`);
            break;
          }
        }
      } catch {
        // 继续重试
      }
      if (attempt === 4) logs.push(`  Model not found after 5s, may still be registering`);
    }
  }

  // Step 2: 查找模型的完整 handle
  // 优先匹配 openai-proxy/ 前缀（我们的 provider handle），其次匹配其他
  let modelHandle = newModel;
  try {
    const modelsResp = await lettaAPI('/models/');
    if (modelsResp.ok) {
      const models = await modelsResp.json();
      const modelList = Array.isArray(models) ? models : [];
      const matches = modelList.filter((m: Record<string, unknown>) => {
        const handle = (m.handle || m.name || '').toString();
        const name = (m.name || '').toString();
        return name === newModel || handle.endsWith(`/${newModel}`) || handle === newModel;
      });
      if (matches.length > 0) {
        // 优先选 openai-proxy/ 前缀的 handle
        const preferred = matches.find((m: Record<string, unknown>) =>
          (m.handle || '').toString().startsWith('openai-proxy/')
        ) || matches[0];
        modelHandle = (preferred as Record<string, unknown>).handle as string || (preferred as Record<string, unknown>).name as string;
        logs.push(`Step 2: Found model handle: ${modelHandle} (${matches.length} matches)`);
      } else {
        logs.push(`Step 2: Model "${newModel}" not found in Letta model list, using as-is`);
      }
    }
  } catch (e) {
    logs.push(`Step 2: Model lookup failed: ${e}`);
  }

  // Step 3: 批量更新所有 agent
  logs.push(`Step 3: Updating all agents to model "${modelHandle}"...`);
  const updateResult = await updateAllUserAgentModels(modelHandle);
  logs.push(`  Result: ${updateResult.updated}/${updateResult.total} updated, ${updateResult.failed} failed`);
  if (updateResult.truncated) {
    logs.push(`  ⚠️ WARNING: Hit 500-agent limit. Some agents may NOT have been updated. Run the action again if you have more than 500 users.`);
  }

  return NextResponse.json({
    success: updateResult.failed === 0,
    model: modelHandle,
    details: updateResult,
    logs,
  });
}
