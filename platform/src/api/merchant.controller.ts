import { Request, Response } from 'express';
import { Repository } from '../infrastructure/db/repository.js';
import { encryptSecret } from '../infrastructure/crypto/secret-manager.js';
import { z } from 'zod';

const createMerchantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  environment: z.enum(['production', 'test']).default('production'),
  defaultCurrency: z.string().default('INR'),
  timezone: z.string().default('UTC'),
  razorpayKeyId: z.string().min(1),
  razorpayKeySecret: z.string().min(1),
  defaultMarginRate: z.number().min(0).max(1).optional().default(0.20),
  categoryEconomics: z.array(z.object({
    category: z.string(),
    marginRate: z.number(),
  })).optional(),
  recoveryConfig: z.object({
    allowedChannels: z.array(z.string()).optional(),
    humanReview: z.object({
      enabled: z.boolean().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
  }).optional(),
  recoveryPolicy: z.object({
    recoveryEnabled: z.boolean().default(true),
    policies: z.record(z.object({
      allowed: z.boolean().optional(),
      maxAttempts: z.number().int().nonnegative().optional(),
      coolOffSeconds: z.number().int().nonnegative().optional(),
    })).optional(),
  }).optional(),
});

const connectRazorpaySchema = z.object({
  razorpayKeyId: z.string().min(1),
  razorpayKeySecret: z.string().min(1),
});

export async function createMerchant(req: Request, res: Response): Promise<void> {
  try {
    const data = createMerchantSchema.parse(req.body);
    const secretRef = encryptSecret(data.razorpayKeySecret);

    const allowedChannels = data.recoveryConfig?.allowedChannels || ['whatsapp', 'email'];
    const policies = data.recoveryPolicy?.policies || {};
    const policy = {
      recoveryEnabled: data.recoveryPolicy?.recoveryEnabled ?? true,
      retryAllowed: policies.RETRY_PAYMENT?.allowed,
      retryMaxAttempts: policies.RETRY_PAYMENT?.maxAttempts,
      retryCoolOffSeconds: policies.RETRY_PAYMENT?.coolOffSeconds,
      smsAllowed: policies.SEND_SMS?.allowed,
      smsMaxAttempts: policies.SEND_SMS?.maxAttempts,
      smsCoolOffSeconds: policies.SEND_SMS?.coolOffSeconds,
      whatsappAllowed: policies.SEND_WHATSAPP?.allowed,
      whatsappMaxAttempts: policies.SEND_WHATSAPP?.maxAttempts,
      whatsappCoolOffSeconds: policies.SEND_WHATSAPP?.coolOffSeconds,
      emailAllowed: policies.SEND_EMAIL?.allowed,
      emailMaxAttempts: policies.SEND_EMAIL?.maxAttempts,
      emailCoolOffSeconds: policies.SEND_EMAIL?.coolOffSeconds,
      paymentLinkAllowed: policies.SEND_PAYMENT_LINK?.allowed,
      paymentLinkMaxAttempts: policies.SEND_PAYMENT_LINK?.maxAttempts,
      paymentLinkCoolOffSeconds: policies.SEND_PAYMENT_LINK?.coolOffSeconds,
      paymentMethodPromptAllowed: policies.CHANGE_PAYMENT_METHOD_PROMPT?.allowed,
      paymentMethodPromptMaxAttempts: policies.CHANGE_PAYMENT_METHOD_PROMPT?.maxAttempts,
      paymentMethodPromptCoolOffSeconds: policies.CHANGE_PAYMENT_METHOD_PROMPT?.coolOffSeconds,
      humanReviewAllowed: policies.HUMAN_REVIEW?.allowed,
      humanReviewMaxAttempts: policies.HUMAN_REVIEW?.maxAttempts,
    };

    const merchant = await Repository.createMerchant({
      id: data.id,
      name: data.name,
      domain: data.domain,
      environment: data.environment,
      defaultCurrency: data.defaultCurrency,
      timezone: data.timezone,
      razorpayKeyId: data.razorpayKeyId,
      razorpaySecretRef: secretRef,
      status: 'ACTIVE',
      economics: {
        create: {
          defaultMarginRate: data.defaultMarginRate,
          categoryEconomics: data.categoryEconomics || [],
        },
      },
      recoveryConfig: {
        create: {
          emailEnabled: allowedChannels.includes('email'),
          smsEnabled: allowedChannels.includes('sms'),
          whatsappEnabled: allowedChannels.includes('whatsapp'),
          inAppNotificationEnabled: allowedChannels.includes('in-app notification'),
          humanReviewEnabled: data.recoveryConfig?.humanReview?.enabled ?? (!!data.recoveryConfig?.humanReview?.email),
          humanReviewEmail: data.recoveryConfig?.humanReview?.email || null,
          humanReviewPhone: data.recoveryConfig?.humanReview?.phone || null,
        },
      },
      recoveryPolicy: { create: policy },
    });

    res.status(201).json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        domain: merchant.domain,
        environment: merchant.environment,
        defaultCurrency: merchant.defaultCurrency,
        timezone: merchant.timezone,
        razorpayKeyId: merchant.razorpayKeyId,
        status: merchant.status,
        createdAt: merchant.createdAt,
        economics: merchant.economics,
        recoveryConfig: merchant.recoveryConfig,
        recoveryPolicy: merchant.recoveryPolicy,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to onboard merchant' });
  }
}

export async function connectRazorpay(req: Request, res: Response): Promise<void> {
  try {
    const merchantId = req.params.merchantId as string;
    const { razorpayKeyId, razorpayKeySecret } = connectRazorpaySchema.parse(req.body);

    const secretRef = encryptSecret(razorpayKeySecret);

    const updated = await Repository.updateMerchant(merchantId, {
      razorpayKeyId,
      razorpaySecretRef: secretRef,
    });

    res.json({
      success: true,
      merchantId: updated.id,
      razorpayKeyId: updated.razorpayKeyId,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to connect Razorpay' });
  }
}

export async function updateEconomics(req: Request, res: Response): Promise<void> {
  res.json({ success: true });
}

export async function getMerchant(req: Request, res: Response): Promise<void> {
  try {
    const merchantId = req.params.merchantId as string;
    const merchant = await Repository.findMerchantById(merchantId);

    if (!merchant) {
      res.status(404).json({ success: false, error: 'Merchant not found' });
      return;
    }

    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        domain: merchant.domain,
        environment: merchant.environment,
        defaultCurrency: merchant.defaultCurrency,
        timezone: merchant.timezone,
        razorpayKeyId: merchant.razorpayKeyId,
        status: merchant.status,
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
        economics: merchant.economics,
        recoveryPolicy: merchant.recoveryPolicy,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
