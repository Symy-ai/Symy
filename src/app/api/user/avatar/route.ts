/**
 * POST /api/user/avatar — 上传用户头像
 *
 * 接收 multipart/form-data (field: "file"), 压缩为 256×256 WebP, 上传到 Supabase Storage avatars bucket,
 * 路径: avatars/{user_id}/{timestamp}.webp
 *
 * 然后更新两处:
 *   1. profiles.avatar_url (DB)
 *   2. user.user_metadata.avatar_url (Auth) — 让前端 useAuth() 立即拿到
 *
 * 返回 { success: true, avatarUrl: string }
 *
 * 🔧 Round 115: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 4 of 6 returns — auth cookie refresh was lost,
 *    especially on the critical supabase.auth.updateUser path).
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const AVATAR_SIZE = 256;
const AVATAR_QUALITY = 85;
// 🔧 2026-07-15: MIME_TO_EXT removed — always output WebP (no fallback to original ext)

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = withAuth(async ({ request, supabase, user }) => {
  // 解析 multipart/form-data
  let formData: FormData;
  try {
    formData = await request.formData();
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return NextResponse.json({ error: 'Invalid form data (expected multipart/form-data)' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
  }

  // 验证 MIME 类型
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Allowed: ${ALLOWED_MIME.join(', ')}` },
      { status: 400 }
    );
  }

  // 验证文件大小
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${MAX_SIZE / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  // 读取文件内容为 Buffer
  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // 🔧 2026-07-15 (ARCH-5 #3 / CRITICAL-3 修复): Magic bytes 校验
  //    旧代码只检查 Content-Type (attacker 可控), 不检查实际文件内容
  //    → 攻击者可上传恶意文件伪装成 image/png
  //    修复: 校验文件头 magic bytes, 拒绝不匹配的文件
  const MAGIC_BYTES: Record<string, number[]> = {
    'image/png':  [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG signature
    'image/jpeg': [0xFF, 0xD8, 0xFF], // JPEG SOI + marker
    'image/webp': [0x52, 0x49, 0x46, 0x46], // "RIFF" (WebP container)
    'image/gif':  [0x47, 0x49, 0x46, 0x38], // "GIF8"
  };

  const expectedMagic = MAGIC_BYTES[file.type];
  if (!expectedMagic) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  const fileHeader = Array.from(inputBuffer.slice(0, expectedMagic.length));
  const magicMatches = expectedMagic.every((byte, i) => fileHeader[i] === byte);
  if (!magicMatches) {
    logger.warn(`[Avatar] Magic bytes mismatch: claimed ${file.type} but header was [${fileHeader.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
    return NextResponse.json(
      { error: 'File content does not match declared type (magic bytes mismatch)' },
      { status: 400 }
    );
  }

  // 🔧 头像压缩: 用 sharp 缩放到 256×256, cover crop, 转 WebP
  let compressedBuffer: Buffer;
  const outputContentType = 'image/webp';
  const outputExt = 'webp';
  try {
    const sharpModule = await import('sharp').then(m => m.default).catch(() => null);
    if (!sharpModule) {
      throw new Error('sharp module not available');
    }
    compressedBuffer = await sharpModule(inputBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .webp({
        quality: AVATAR_QUALITY,
        effort: 4,
      })
      .toBuffer();

    logger.info(`[Avatar] Compressed: ${file.size} bytes → ${compressedBuffer.length} bytes (${(compressedBuffer.length / file.size * 100).toFixed(1)}% of original)`);
  } catch (err) {
    // 🔧 2026-07-15 (ARCH-5 #3 修复): sharp 失败时拒绝上传 (而非 fallback 到原始字节)
    //    旧代码 fallback 上传原始未压缩字节 → 攻击者可绕过 sharp 处理
    //    修复: sharp 失败 = 文件有问题, 拒绝上传
    logger.error('[Avatar] Image compression failed (rejecting upload, no fallback):', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Image processing failed. Please ensure the file is a valid image.' },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  const filePath = `${user.id}/${timestamp}.${outputExt}`;

  const uploadBody = new Blob([new Uint8Array(compressedBuffer)], { type: outputContentType });

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, uploadBody, {
      contentType: outputContentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    logger.error('[Avatar] Upload failed:', uploadError.message);
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  const avatarUrl = publicUrlData.publicUrl;
  if (!avatarUrl) {
    logger.error('[Avatar] Failed to get public URL for path:', filePath);
    return NextResponse.json({ error: 'Failed to get avatar URL' }, { status: 500 });
  }

  // 1. 更新 profiles.avatar_url
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (profileError) {
    logger.warn('[Avatar] Failed to update profiles.avatar_url:', profileError.message);
  }

  // 2. 更新 user.user_metadata.avatar_url
  const { error: authUpdateError } = await supabase.auth.updateUser({
    data: { avatar_url: avatarUrl },
  });

  if (authUpdateError) {
    logger.warn('[Avatar] Failed to update user_metadata.avatar_url:', authUpdateError.message);
  }

  logger.info(`[Avatar] Upload success for user ${user.id}: ${avatarUrl} (${compressedBuffer.length} bytes, compressed WebP)`);

  return NextResponse.json({ success: true, avatarUrl });
});
