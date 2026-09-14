import { AdminCtx, lettaAPI, NextResponse, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `as string | undefined` casts.
const schema = z.object({
  model: z.string().default('letta/auto'),
  embedding: z.string().default('openai/text-embedding-3-small'),
  provider_id: z.string().optional(),
  model_name: z.string().optional(),
});

export async function handleCreateTestAgent(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { model, embedding, provider_id: providerId, model_name: modelName } = result.data;

  // 如果指定了 provider_id 和 model_name，先确保 Provider 有该模型
  if (providerId && modelName) {
    try {
      // 尝试多种 Letta API 端点来注册模型
      // 方式1: POST /models/ (Letta 标准 model 注册)
      const addModelResp = await lettaAPI('/models/', {
        method: 'POST',
        body: JSON.stringify({
          name: modelName,
          provider_name: 'My_deepseek',
          provider_type: 'openai',
          model_type: 'llm',
          context_window: 64000,
          max_tokens: 8192,
          handle: `My_deepseek/${modelName}`,
          model_endpoint: 'https://symy.ai/api/v1',
          model_endpoint_type: 'openai',
        }),
      });

      if (addModelResp.ok) {
        const _addModelResult = await addModelResp.json();
        // 成功添加模型，继续创建 Agent
      } else {
        const errorBody = await addModelResp.text().catch(() => '');
        return NextResponse.json({
          step: 'add_model_to_provider',
          provider_id: providerId,
          model_name: modelName,
          http_status: addModelResp.status,
          error_detail: errorBody.substring(0, 300),
          hint: 'Model needs to be added in Letta dashboard: https://letta.com → Settings → Providers → My_deepseek → Add Model (name: glm-5.2)',
        }, { status: 500 });
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      return NextResponse.json({
        step: 'add_model_to_provider',
        error: String(err),
        hint: 'Failed to add model. Add it manually in Letta dashboard.',
      }, { status: 500 });
    }
  }

  try {
    // 直接使用 REST API 创建，绕过 SDK 类型限制
    const createResp = await lettaAPI('/agents/', {
      method: 'POST',
      body: JSON.stringify({
        name: `symy-test-${Date.now()}`,
        description: 'Test agent with custom model — can be deleted after verification',
        system: 'You are Symy, the AI financial companion. Reply concisely.',
        model,
        embedding,
        include_base_tools: true,
        enable_sleeptime: true,
        memory_blocks: [
          { label: 'user_id', value: 'test-user', limit: 100 },
          { label: 'persona', value: 'I am Symy, a test AI companion.', limit: 5000 },
          { label: 'human', value: 'Test user for model verification', limit: 5000 },
        ],
        tags: ['symy', 'test', 'model-verify'],
        metadata: { created_by: 'admin-test', purpose: 'model_verification' },
      }),
    });

    if (!createResp.ok) {
      const errorText = await createResp.text();
      return NextResponse.json({
        error: 'Failed to create test agent',
        detail: errorText.substring(0, 500),
        model,
        status: createResp.status,
      }, { status: 500 });
    }

    const testAgent = await createResp.json();
    const newAgentId = (testAgent as Record<string, unknown>).id as string;

    return NextResponse.json({
      success: true,
      agent_id: newAgentId,
      model,
      embedding,
      message: 'Test agent created. Use chat API to test, then delete via Letta dashboard.',
    });
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: 'Failed to create test agent',
      detail: errorDetail.substring(0, 500),
      model,
    }, { status: 500 });
  }
}
