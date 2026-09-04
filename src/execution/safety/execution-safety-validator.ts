import { ExecutionAction, ExecutionContext, SafetyValidationResult } from '../types/execution.types.js';

export function validateExecutionAction(action: ExecutionAction, context: ExecutionContext): SafetyValidationResult {
  const violations: SafetyValidationResult['violations'] = [];
  if (['WHATSAPP_MESSAGE', 'SMS_MESSAGE', 'EMAIL_MESSAGE'].includes(action.actionType) && !action.recipient) {
    violations.push({ code: 'RECIPIENT_MISSING', message: 'Communication recipient is missing', severity: 'BLOCKING' });
  }
  if (action.actionType === 'EMAIL_MESSAGE' && (!action.subject || !action.content)) {
    violations.push({ code: 'EMAIL_CONTENT_MISSING', message: 'Email subject or content is missing', severity: 'BLOCKING' });
  }
  if (['WHATSAPP_MESSAGE', 'SMS_MESSAGE'].includes(action.actionType) && !action.content) {
    violations.push({ code: 'MESSAGE_CONTENT_MISSING', message: 'Message content is missing', severity: 'BLOCKING' });
  }
  if (action.content && /\b(otp|cvv|cvc|card number|api key|secret|password)\b/i.test(action.content)) {
    violations.push({ code: 'SENSITIVE_CONTENT', message: 'Content contains sensitive payment or credential data', severity: 'BLOCKING' });
  }
  if (action.content && /INTERNAL_DIAGNOSIS|risk_event|policyEvaluationId/i.test(action.content)) {
    violations.push({ code: 'INTERNAL_DATA_EXPOSED', message: 'Content contains internal system data', severity: 'BLOCKING' });
  }
  if (action.amount !== undefined && action.amount !== context.payment.amount) {
    violations.push({ code: 'AMOUNT_MISMATCH', message: 'Action amount differs from payment amount', severity: 'BLOCKING' });
  }
  if (action.currency !== undefined && action.currency !== context.payment.currency) {
    violations.push({ code: 'CURRENCY_MISMATCH', message: 'Action currency differs from payment currency', severity: 'BLOCKING' });
  }
  if (action.content && action.content.length > 4096) {
    violations.push({ code: 'CONTENT_TOO_LONG', message: 'Content exceeds the execution content limit', severity: 'BLOCKING' });
  }
  return { valid: !violations.some((violation) => violation.severity === 'BLOCKING'), violations };
}
