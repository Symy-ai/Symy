import { AdminCtx, lettaAPI, NextResponse, logger } from './_shared';

export async function handleListModels( _ctx: AdminCtx) {
  const modelsResp = await lettaAPI('/models/');
  if (!modelsResp.ok) {
    return NextResponse.json({ error: `Letta API error: ${modelsResp.status}` }, { status: 502 });
  }
  const models = await modelsResp.json();
  const modelList = Array.isArray(models) ? models : [];

  // 同时查询自定义 providers
  let providers: unknown[] = [];
  try {
    const providersResp = await lettaAPI('/providers/');
    if (providersResp.ok) {
      const providersData = await providersResp.json();
      providers = Array.isArray(providersData) ? providersData : [];
    }
  } catch (providersErr) {
    // safe to ignore: non-critical error, logged for observability
    // 🔧 2026-07-15: Log error — could be Letta API timeout, not just "endpoint not found"
    logger.warn('[Admin Letta] Failed to fetch providers:', providersErr instanceof Error ? providersErr.message : String(providersErr));
  }

  // 查询每个自定义 provider 的模型
  const providerModels: Record<string, unknown[]> = {};
  for (const p of providers) {
    const provider = p as Record<string, unknown>;
    const pId = provider.id as string;
    const pName = provider.name as string;
    try {
      const modelsByProviderResp = await lettaAPI(`/providers/${pId}/models`);
      if (modelsByProviderResp.ok) {
        const mdata = await modelsByProviderResp.json();
        providerModels[pName] = Array.isArray(mdata) ? mdata : [mdata];
      } else {
        providerModels[pName] = [{ error: `HTTP ${modelsByProviderResp.status}` }];
      }
    } catch (err) {
      providerModels[pName] = [{ error: String(err) }];
    }
  }

  // 特别筛选 Azure/DeepSeek/自定义 模型
  const azureModels = modelList.filter((m: Record<string, unknown>) => {
    const str = JSON.stringify(m).toLowerCase();
    return str.includes('deepseek') || str.includes('azure') || str.includes('my_deepseek');
  });

  return NextResponse.json({
    total_models: modelList.length,
    azure_custom_models: azureModels,
    providers,
    provider_models: providerModels,
    model_handles: modelList.map((m: Record<string, unknown>) => m.handle || m.id || m.name),
  });
}
