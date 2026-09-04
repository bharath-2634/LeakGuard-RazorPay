import { ExecutionContext } from '../types/execution.types.js';

export function generateRecoveryContent(context: ExecutionContext, paymentLink = '{{PAYMENT_LINK}}') {
  const customerName = context.customer.name || 'there';
  const amount = `${context.payment.currency} ${context.payment.amount}`;
  return {
    subject: `Complete your payment for ${context.merchant.name}`,
    body: `Hi ${customerName}, your payment of ${amount} could not be completed. You can try again using this secure payment link: ${paymentLink}`,
  };
}
