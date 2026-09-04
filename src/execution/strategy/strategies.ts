import { generateRecoveryContent } from '../content/recovery-content-generator.js';
import { ExecutionAction, ExecutionContext } from '../types/execution.types.js';
import { ExecutionStrategy } from './execution-strategy.js';

export class CommunicationStrategy implements ExecutionStrategy {
  constructor(private readonly interventionType: 'SEND_WHATSAPP' | 'SEND_SMS' | 'SEND_EMAIL') {}
  supports(type: string): boolean { return type === this.interventionType; }
  async execute(context: ExecutionContext): Promise<ExecutionAction> {
    const content = generateRecoveryContent(context);
    if (this.interventionType === 'SEND_EMAIL') return { actionType: 'EMAIL_MESSAGE', interventionType: this.interventionType, provider: 'RESEND', recipient: context.customer.email || undefined, subject: content.subject, content: content.body };
    return { actionType: this.interventionType === 'SEND_WHATSAPP' ? 'WHATSAPP_MESSAGE' : 'SMS_MESSAGE', interventionType: this.interventionType, provider: 'TWILIO', recipient: context.customer.phone || undefined, content: content.body, metadata: { customerName: context.customer.name || 'there', amount: `${context.payment.currency} ${context.payment.amount}` } };
  }
}

export class PaymentLinkStrategy implements ExecutionStrategy {
  supports(type: string): boolean { return type === 'SEND_PAYMENT_LINK'; }
  async execute(context: ExecutionContext): Promise<ExecutionAction> {
    return { actionType: 'PAYMENT_LINK', interventionType: 'SEND_PAYMENT_LINK', provider: 'RAZORPAY', amount: context.payment.amount, currency: context.payment.currency, merchantOrderId: context.payment.merchantOrderId, metadata: { customer: context.customer, merchantId: context.merchant.id } };
  }
}

export class SimpleStrategy implements ExecutionStrategy {
  constructor(private readonly interventionType: string, private readonly actionType: ExecutionAction['actionType'], private readonly provider: string) {}
  supports(type: string): boolean { return type === this.interventionType; }
  async execute(context: ExecutionContext): Promise<ExecutionAction> { return { actionType: this.actionType, interventionType: this.interventionType, provider: this.provider, metadata: { paymentAttemptId: context.payment.paymentAttemptId, merchantId: context.merchant.id } }; }
}

export function createStrategies(): ExecutionStrategy[] {
  return [
    new CommunicationStrategy('SEND_WHATSAPP'), new CommunicationStrategy('SEND_SMS'), new CommunicationStrategy('SEND_EMAIL'),
    new PaymentLinkStrategy(),
    new SimpleStrategy('RETRY_PAYMENT', 'PAYMENT_RETRY', 'RAZORPAY'),
    new SimpleStrategy('CHANGE_PAYMENT_METHOD_PROMPT', 'PAYMENT_METHOD_PROMPT', 'INTERNAL'),
    new SimpleStrategy('HUMAN_REVIEW', 'HUMAN_REVIEW', 'INTERNAL'),
  ];
}
