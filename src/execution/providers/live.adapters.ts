import crypto from 'node:crypto';
import { Pool } from 'pg';
import { config } from '../../config/env.js';
import { ExecutionAction, ProviderExecutionResult } from '../types/execution.types.js';
import { ProviderAdapter } from './provider-adapter.js';

function requireConfig(values: Array<[string, string | undefined]>): void {
  const missing = values.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`PROVIDER_CONFIGURATION_MISSING: ${missing.join(', ')}`);
}

function normalizeWhatsAppAddress(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  return normalized.startsWith('whatsapp:') ? normalized : `whatsapp:${normalized.startsWith('+') ? normalized : `+${normalized}`}`;
}

function normalizePhoneAddress(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

export class TwilioAdapter implements ProviderAdapter {
  supports(actionType: string): boolean { return actionType === 'WHATSAPP_MESSAGE' || actionType === 'SMS_MESSAGE'; }

  async execute(action: ExecutionAction): Promise<ProviderExecutionResult> {
    requireConfig([
      ['TWILIO_ACCOUNT_SID', config.TWILIO_ACCOUNT_SID],
      ['TWILIO_AUTH_TOKEN', config.TWILIO_AUTH_TOKEN],
      ['TWILIO_RECIPIENT', action.recipient],
    ]);
    const isWhatsApp = action.actionType === 'WHATSAPP_MESSAGE';
    const from = isWhatsApp ? config.TWILIO_WHATSAPP_FROM : config.TWILIO_SMS_FROM;
    requireConfig([['TWILIO_FROM', from]]);
    const form: Record<string, string> = {
      To: isWhatsApp ? normalizeWhatsAppAddress(action.recipient!) : normalizePhoneAddress(action.recipient!),
      From: isWhatsApp ? normalizeWhatsAppAddress(from!) : normalizePhoneAddress(from!),
    };
    if (isWhatsApp && config.TWILIO_WHATSAPP_CONTENT_SID) {
      form.ContentSid = config.TWILIO_WHATSAPP_CONTENT_SID;
      form.ContentVariables = buildContentVariables(action);
    } else {
      form.Body = action.content || '';
    }
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form),
    });
    const data = await response.json() as any;
    if (!response.ok) return { provider: 'TWILIO', success: false, status: 'FAILED', failureCode: `TWILIO_HTTP_${response.status}`, failureReason: data.message || 'Twilio request failed' };
    return { provider: 'TWILIO', success: true, status: data.status || 'QUEUED', providerExecutionId: data.sid };
  }
}

function buildContentVariables(action: ExecutionAction): string {
  const template = config.TWILIO_WHATSAPP_CONTENT_VARIABLES;
  if (!template) return JSON.stringify({ '1': action.metadata?.customerName || 'there', '2': action.metadata?.amount || '' });
  return template
    .replace(/\{\{customerName\}\}/g, String(action.metadata?.customerName || 'there'))
    .replace(/\{\{amount\}\}/g, String(action.metadata?.amount || ''));
}

export class ResendAdapter implements ProviderAdapter {
  supports(actionType: string): boolean { return actionType === 'EMAIL_MESSAGE'; }

  async execute(action: ExecutionAction): Promise<ProviderExecutionResult> {
    requireConfig([['RESEND_API_KEY', config.RESEND_API_KEY], ['RESEND_FROM_EMAIL', config.RESEND_FROM_EMAIL], ['EMAIL_RECIPIENT', action.recipient]]);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.RESEND_FROM_EMAIL, to: [action.recipient], subject: action.subject, text: action.content }),
    });
    const data = await response.json() as any;
    if (!response.ok) return { provider: 'RESEND', success: false, status: 'FAILED', failureCode: `RESEND_HTTP_${response.status}`, failureReason: data.message || 'Resend request failed' };
    return { provider: 'RESEND', success: true, status: 'QUEUED', providerExecutionId: data.id };
  }
}

export class RazorpayAdapter implements ProviderAdapter {
  supports(actionType: string): boolean { return actionType === 'PAYMENT_LINK' || actionType === 'PAYMENT_RETRY'; }

  async execute(action: ExecutionAction): Promise<ProviderExecutionResult> {
    const credentials = await resolveRazorpayCredentials(action.metadata?.merchantId as string | undefined);
    const endpoint = action.actionType === 'PAYMENT_LINK' ? 'https://api.razorpay.com/v1/payment_links' : 'https://api.razorpay.com/v1/orders';
    const body = action.actionType === 'PAYMENT_LINK'
      ? { amount: Math.round((action.amount || 0) * 100), currency: action.currency, reference_id: action.merchantOrderId, description: 'Payment recovery' }
      : { amount: Math.round((action.amount || 0) * 100), currency: action.currency, receipt: action.merchantOrderId };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as any;
    if (!response.ok) return { provider: 'RAZORPAY', success: false, status: 'FAILED', failureCode: `RAZORPAY_HTTP_${response.status}`, failureReason: data.error?.description || 'Razorpay request failed' };
    return { provider: 'RAZORPAY', success: true, status: 'CREATED', providerResourceId: data.id, paymentLinkUrl: data.short_url };
  }
}

async function resolveRazorpayCredentials(merchantId?: string): Promise<{ keyId: string; secret: string }> {
  if (merchantId && process.env.DATABASE_URL) {
    requireConfig([['MASTER_SECRET_KEY', config.MASTER_SECRET_KEY]]);
  } else {
    requireConfig([['RAZORPAY_KEY_ID', config.RAZORPAY_KEY_ID], ['RAZORPAY_KEY_SECRET', config.RAZORPAY_KEY_SECRET]]);
    return { keyId: config.RAZORPAY_KEY_ID!, secret: config.RAZORPAY_KEY_SECRET! };
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : undefined });
  try {
    const result = await pool.query<{ razorpayKeyId: string; razorpaySecretRef: string }>('SELECT "razorpayKeyId", "razorpaySecretRef" FROM "merchants" WHERE "id" = $1', [merchantId]);
    if (!result.rowCount) throw new Error('RAZORPAY_MERCHANT_NOT_FOUND');
    const [ivHex, authTagHex, encryptedHex] = result.rows[0].razorpaySecretRef.split(':');
    const key = crypto.createHash('sha256').update(config.MASTER_SECRET_KEY!).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return { keyId: result.rows[0].razorpayKeyId, secret: decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8') };
  } finally {
    await pool.end();
  }
}
