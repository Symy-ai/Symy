'use client';

/**
 * 后台管理系统 — 登录页
 *
 * 管理员输入 ADMIN_API_KEY 进行登录。
 * key 存入 sessionStorage，关闭标签页即失效。
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-panel/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, Loader2, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const { login } = useAdminAuth();
  const searchParams = useSearchParams();
  const [key, setKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // 测试/自动化入口：URL ?key=xxx 自动验证并登录（生产环境不影响手动输入）
  useEffect(() => {
    const queryKey = searchParams.get('key');
    if (queryKey) {
      setKey(queryKey);
      // 自动提交验证
      (async () => {
        setSubmitting(true);
        try {
          // eslint-disable-next-line symy/no-raw-fetch-in-use-effect -- 登录验证需直接 fetch，不能用 useQuery（key 未存前无 QueryClient 上下文）
          const res = await fetch('/api/admin/audit?action=stats', {
            headers: { Authorization: `Bearer ${queryKey}` },
          });
          if (res.status !== 401 && res.status !== 403) {
            login(queryKey);
          } else {
            setError('URL key 无效');
          }
        } catch {
          setError('网络错误');
        }
        setSubmitting(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // 从 form 直接读取 input 值（兼容 agent-browser fill 不触发 React onChange 的情况）
    const formData = new FormData(e.target as HTMLFormElement);
    const trimmed = String(formData.get('apikey') || '').trim();
    if (!trimmed) {
      setError('请输入 ADMIN_API_KEY');
      return;
    }
    setSubmitting(true);
    setError(null);

    // 验证 key：调一个轻量 admin API
    try {
      const res = await fetch('/api/admin/audit?action=stats', {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError('API Key 无效或权限不足');
        setSubmitting(false);
        return;
      }
      // 200 或其他状态都算 key 有效（审计表可能为空）
      login(trimmed);
      // 不手动 router.replace — AdminAuthProvider 守卫 effect 检测到 apiKey + isLoginRoute
      // 会自动跳转 /admin，避免 setApiKeyState 与 router 竞态
      setSubmitting(false);
    } catch {
      setError('网络错误，请检查连接');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-zinc-50">Symy Admin</h1>
            <p className="mt-1 text-sm text-zinc-400">后台管理系统 · 仅限管理员</p>
          </div>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/80 text-zinc-100 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-50">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              管理员登录
            </CardTitle>
            <CardDescription className="text-zinc-400">
              输入 ADMIN_API_KEY 以访问后台。Key 仅存于当前标签页 sessionStorage，关闭即失效。
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apikey" className="text-zinc-200">ADMIN_API_KEY</Label>
                <div className="relative">
                  <Input
                    id="apikey"
                    name="apikey"
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    placeholder="粘贴你的 Admin API Key"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    disabled={submitting}
                    className="border-zinc-700 bg-zinc-950 pr-10 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    aria-label={showKey ? '隐藏 Key' : '显示 Key'}
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <Alert className="border-rose-500/40 bg-rose-500/10 text-rose-200">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="rounded-md bg-zinc-800/50 p-3 text-xs text-zinc-400">
                <p className="font-medium text-zinc-300">安全提示</p>
                <ul className="mt-1.5 space-y-1">
                  <li>• 请勿在公共设备上登录</li>
                  <li>• Key 不会写入 localStorage，关闭标签页自动清除</li>
                  <li>• 所有操作将被记录到审计日志</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={submitting || !key.trim()}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    验证中…
                  </>
                ) : (
                  '登录后台'
                )}
              </Button>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <ArrowLeft className="h-3 w-3" />
                返回主站
              </Link>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Symy AI · Buy less, live more
        </p>
      </div>
    </div>
  );
}
