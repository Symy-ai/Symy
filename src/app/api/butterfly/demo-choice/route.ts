/**
 * POST /api/butterfly/demo-choice — 提交演示模式的选择
 *
 * 不需要认证
 * 记录选择并返回更新后的会话
 * 前端收到响应后会调用 demo-story 继续生成故事
 */

import { getDemoSession, updateDemoSession } from '@/features/butterfly/lib/demo-session-store';
import { NextRequest, NextResponse } from 'next/server';
import type { ButterflyChoice } from '@/features/butterfly/types';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation (BUG-297 fix)
  const demoChoiceSchema = z.object({
    sessionId: z.string().min(1, 'Invalid sessionId').max(100),
    chapterIndex: z.number().int().min(0, 'Invalid chapterIndex (must be integer 0-10)').max(10),
    selectedOption: z.string().min(1, 'Invalid selectedOption').max(50, 'Invalid selectedOption (must be string, max 50 chars)'),
  });
  const bodyResult = await validateBody(req, demoChoiceSchema);
  if (isValidationError(bodyResult)) return bodyResult;
  const { sessionId, chapterIndex, selectedOption } = bodyResult;

  // 获取会话
  const session = getDemoSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Demo session not found' },
      { status: 404 }
    );
  }

  // 添加选择到会话
  const newChoice: ButterflyChoice = {
    id: `choice-${chapterIndex}-${Date.now()}`,
    chapterIndex,
    prompt: 'Which path do you take?',
    options: [
      { id: 'A', label: 'Option A', hint: '' },
      { id: 'B', label: 'Option B', hint: '' },
    ],
    selectedOption,
    createdAt: new Date().toISOString(),
    outlineRegenerated: true,
  };

  const updatedSession = updateDemoSession(sessionId, {
    choices: [...session.choices, newChoice],
    currentChapter: chapterIndex,
  });

  if (!updatedSession) {
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }

  return NextResponse.json({ session: updatedSession });
}
