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
  categoryEconomics: z.record(z.object({ margin_rate: z.number() })).optional(),
});

const connectRazorpaySchema = z.object({
  razorpayKeyId: z.string().min(1),
  razorpayKeySecret: z.string().min(1),
});

export async function createMerchant(req: Request, res: Response): Promise<void> {
  try {
    const data = createMerchantSchema.parse(req.body);
    const secretRef = encryptSecret(data.razorpayKeySecret);

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
          categoryEconomics: data.categoryEconomics || {},
        },
      },
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
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
