import crypto from 'crypto';
import { config } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

function getMasterKey(): Buffer {
  return crypto.createHash('sha256').update(config.masterSecretKey).digest();
}

/**
 * Encrypts a sensitive string (e.g. Razorpay Key Secret) using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:encrypted_hex
 */
export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted secret reference string.
 */
export function decryptSecret(encryptedRef: string): string {
  const parts = encryptedRef.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid secret reference format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getMasterKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
