'use client';

/**
 * Letta Admin Action 面板
 *
 * 根据 LettaActionMeta 自动渲染参数表单 + 执行按钮 + 结果展示。
 * 危险操作（dangerous）二次确认。
 */

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { adminPost } from '@/lib/admin-panel/api-client';
import type { LettaActionMeta, LettaActionParam } from '@/lib/admin-panel/types';
import { ResultDisplay, type ActionResult } from './result-display';
import { Play, AlertTriangle } from 'lucide-react';

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: LettaActionParam;
  value: string;
  onChange: (v: string) => void;
}) {
  const commonProps = {
    id: param.key,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    placeholder: param.placeholder,
  };

  switch (param.type) {
    case 'textarea':
    case 'json':
      return <Textarea {...commonProps} rows={param.type === 'json' ? 6 : 3} className="font-mono text-xs" />;
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={param.key}
            checked={value === 'true'}
            onCheckedChange={(c) => onChange(c ? 'true' : 'false')}
          />
          <Label htmlFor={param.key} className="text-xs text-muted-foreground">
            {value === 'true' ? '启用' : '关闭'}
          </Label>
        </div>
      );
    case 'number':
      return <Input {...commonProps} type="number" />;
    default:
      return <Input {...commonProps} type="text" />;
  }
}

export function LettaActionPanel({
  meta,
  isFavorite = false,
  onToggleFavorite,
}: {
  meta: LettaActionMeta;
  isFavorite?: boolean;
  onToggleFavorite?: (action: string) => void;
}) {
  // 参数 state
  const initialParams: Record<string, string> = {};
  meta.params.forEach((p) => {
    if (p.defaultValue !== undefined) initialParams[p.key] = String(p.defaultValue);
    else initialParams[p.key] = '';
  });
  const [params, setParams] = useState<Record<string, string>>(initialParams);
  const [result, setResult] = useState<ActionResult>({ action: meta.action, status: 'idle' });

  function buildBody(): Record<string, unknown> {
    const body: Record<string, unknown> = { action: meta.action };
    meta.params.forEach((p) => {
      const v = params[p.key];
      if (v === '' || v === undefined) {
        if (!p.required) return; // 可选空值不传
        body[p.key] = v;
        return;
      }
      if (p.type === 'number') {
        const n = Number(v);
        body[p.key] = Number.isFinite(n) ? n : v;
      } else if (p.type === 'boolean') {
        body[p.key] = v === 'true';
      } else if (p.type === 'json') {
        try {
          body[p.key] = JSON.parse(v);
        } catch {
          body[p.key] = v; // 解析失败传原始字符串
        }
      } else {
        body[p.key] = v;
      }
    });
    return body;
  }

  async function execute() {
    // 必填校验
    for (const p of meta.params) {
      if (p.required && !params[p.key]) {
        setResult({
          action: meta.action,
          status: 'error',
          error: `缺少必填参数: ${p.label} (${p.key})`,
          timestamp: new Date().toLocaleTimeString(),
        });
        return;
      }
    }

    setResult({ action: meta.action, status: 'loading' });
    const body = buildBody();
    const startTime = Date.now();
    const res = await adminPost('/api/admin/letta', body);
    const duration = Date.now() - startTime;
    setResult({
      action: meta.action,
      status: res.ok ? 'success' : 'error',
      params: body,
      response: res.data,
      error: res.error,
      timestamp: new Date().toLocaleTimeString(),
      duration,
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // 非危险操作直接执行；危险操作由 AlertDialog 触发
    if (!meta.dangerous) execute();
  }

  return (
    <Card className="border-zinc-200 dark:border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-sm">
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">{meta.action}</code>
              {meta.dangerous && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  危险
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">{meta.description}</CardDescription>
          </div>
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(meta.action)}
              className={`shrink-0 rounded-md p-1.5 transition-colors ${
                isFavorite
                  ? 'text-amber-500 hover:bg-amber-500/10'
                  : 'text-muted-foreground hover:bg-muted hover:text-amber-500'
              }`}
              aria-label={isFavorite ? '取消收藏' : '收藏'}
              title={isFavorite ? '取消收藏' : '收藏'}
            >
              <svg className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {meta.params.length === 0 ? (
            <p className="text-xs text-muted-foreground">此操作无需参数</p>
          ) : (
            meta.params.map((p) => (
              <div key={p.key} className="space-y-1">
                <Label htmlFor={p.key} className="flex items-center gap-1 text-xs">
                  {p.label}
                  <code className="text-[10px] text-muted-foreground">({p.key})</code>
                  {p.required && <span className="text-rose-500">*</span>}
                </Label>
                <ParamInput
                  param={p}
                  value={params[p.key]}
                  onChange={(v) => setParams({ ...params, [p.key]: v })}
                />
                {p.help && <p className="text-[10px] text-muted-foreground">{p.help}</p>}
              </div>
            ))
          )}

          {meta.dangerous ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                  执行（需确认）
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认执行危险操作？</AlertDialogTitle>
                  <AlertDialogDescription>
                    你即将执行 <code className="rounded bg-muted px-1 font-mono">{meta.action}</code>。
                    <br />
                    {meta.description}
                    <br />
                    <br />
                    此操作不可撤销，请确认参数正确。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={execute}
                    className="bg-rose-600 text-white hover:bg-rose-500"
                  >
                    确认执行
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button type="submit" size="sm" disabled={result.status === 'loading'}>
              <Play className="mr-2 h-3 w-3" />
              执行
            </Button>
          )}
        </form>

        <ResultDisplay result={result} />
      </CardContent>
    </Card>
  );
}
