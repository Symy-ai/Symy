import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * crypto-helpers — AES-256-GCM 加密/解密敏感字段 (如 IMAP authCodes)
 *
 * 🔧 ARCH fix (Round 2 C3 — IMAP authCodes 明文存储):
 *    旧代码 IMAP authCode (邮箱授权码, 等同密码) 直接存入 email_connections.access_token 明文列。
 *    DB 泄露 (SQL 注入/备份泄露/内部访问) → 攻击者立即获得所有用户的邮箱读权限。
 *    根因修复: 应用层 AES-256-GCM 加密, 密钥来自 IMAP_ENCRYPTION_KEY 环境变量。
 *
 * 🔧 BUG-009 fix (随机 salt 替代硬编码 salt):
 *    旧代码 scryptSync 使用硬编码静态 salt ('symy-salt-v1' / 'symy-imap-salt-v1')。
 *    静态 salt 使相同 passphrase 派生出相同密钥, 削弱了 scrypt 的抗预计算 (rainbow table) 能力。
 *    根因修复: 每次加密随机生成 16-byte salt, 与密文一同存储。
 *
 * 加密方案:
 * - 算法: AES-256-GCM (认证加密, 防篡改)
 * - 密钥: 32 bytes, 来自 IMAP_ENCRYPTION_KEY (base64 编码 raw key 或 passphrase) 或从 ENCRYPTION_MASTER_KEY 派生
 * - Salt: 每次 scrypt 派生时随机生成 16 bytes (仅 passphrase/masterKey 路径)
 * - 格式 (passphrase/masterKey 路径): base64(salt(16) || iv(12) || authTag(16) || ciphertext)
 * - 格式 (raw key 路径, 无 salt): base64(iv(12) || authTag(16) || ciphertext)
 * - 前缀: "enc:" 标记加密字段
 *
 * 注意 (BUG-009): 不兼容旧格式。老数据无法解密, 解密会返回 null。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { logger } from './logger';

const ENCRYPTION_PREFIX = 'enc:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 bytes
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16; // BUG-009: scrypt 随机 salt 长度
const SCRYPT_KEY_LENGTH = 32;

type KeySource =
  | { type: 'raw'; key: Buffer }
  | { type: 'passphrase'; passphrase: string };

let _keySource: KeySource | null | undefined;

function getKeySource(): KeySource | null {
  if (_keySource !== undefined) return _keySource;

  const directKey = process.env.IMAP_ENCRYPTION_KEY;
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;

  if (directKey) {
    try {
      const key = Buffer.from(directKey, 'base64');
      if (key.length === 32) {
        _keySource = { type: 'raw', key };
        return _keySource;
      }
      logger.warn('[Crypto] IMAP_ENCRYPTION_KEY is not 32 bytes after base64 decode, using as passphrase with scrypt');
    } catch {
      // safe to ignore: 不是合法 base64, 当作 passphrase 处理 (fallback 到 scrypt 派生)
    }
    _keySource = { type: 'passphrase', passphrase: directKey };
    return _keySource;
  }

  if (masterKey) {
    _keySource = { type: 'passphrase', passphrase: masterKey };
    return _keySource;
  }

  logger.warn('[Crypto] No encryption key configured (IMAP_ENCRYPTION_KEY or ENCRYPTION_MASTER_KEY). IMAP authCodes will be stored in plaintext.');
  _keySource = null;
  return _keySource;
}

export function encryptSensitive(plaintext: string): string {
  if (!plaintext) return plaintext;

  const source = getKeySource();
  if (!source) {
    throw new Error('ENCRYPTION_FAILED: No encryption key configured (IMAP_ENCRYPTION_KEY or ENCRYPTION_MASTER_KEY). Refusing to store plaintext.');
  }

  try {
    let salt: Buffer;
    let key: Buffer;
    if (source.type === 'passphrase') {
      salt = randomBytes(SALT_LENGTH);
      key = scryptSync(source.passphrase, salt, SCRYPT_KEY_LENGTH);
    } else {
      salt = Buffer.alloc(0);
      key = source.key;
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);
    return ENCRYPTION_PREFIX + combined.toString('base64');
  } catch (err) {
    logger.error('[Crypto] encryptSensitive failed:', err);
    throw new Error('ENCRYPTION_FAILED: ' + (err instanceof Error ? err.message : String(err)));
  }
}

export function decryptSensitive(encrypted: string): string | null {
  if (!encrypted) return encrypted;

  if (!encrypted.startsWith(ENCRYPTION_PREFIX)) {
    return encrypted;
  }

  const source = getKeySource();
  if (!source) {
    logger.error('[Crypto] decryptSensitive: encrypted data present but no encryption key configured');
    return null;
  }

  try {
    const combined = Buffer.from(encrypted.slice(ENCRYPTION_PREFIX.length), 'base64');

    let key: Buffer;
    let iv: Buffer;
    let authTag: Buffer;
    let ciphertext: Buffer;

    if (source.type === 'passphrase') {
      if (combined.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
        logger.error('[Crypto] decryptSensitive: encrypted data too short (expected salt+iv+authTag+ciphertext)');
        return null;
      }
      const salt = combined.subarray(0, SALT_LENGTH);
      key = scryptSync(source.passphrase, salt, SCRYPT_KEY_LENGTH);
      iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
      ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    } else {
      if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        logger.error('[Crypto] decryptSensitive: encrypted data too short (expected iv+authTag+ciphertext)');
        return null;
      }
      key = source.key;
      iv = combined.subarray(0, IV_LENGTH);
      authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    // safe to ignore: key 轮换或旧格式数据, 返回 null 让调用方降级处理
    logger.error('[Crypto] decryptSensitive failed (key may have been rotated or data is old format):', err);
    return null;
  }
}

export function isEncryptionConfigured(): boolean {
  return getKeySource() !== null;
}
