import { randomBytes } from 'node:crypto';
import { createPayUPaymentFields, buildPayUResponseHash, getPayUConfig, verifyPayUPayment } from '../payu';
import { check, db, origin, rpc } from '../whatsapp/server';
import { digest, equalSecret, type Session } from '../whatsapp/core';
export interface Hold { id: string; expires_at: string; status: string; slot_id: string }
export async function preparePayment(session: Session, hold: Hold): Promise<string> {
  const userId = await rpc<string>('wa_patient', { p_session: session.id, p_name: session.data.name });
  const existing = await db().from('whatsapp_payments').select('txnid').eq('hold_id', hold.id).maybeSingle(); check(existing.error);
  // Checkout capability is deterministically derived from server secret and hold, so retries recover the same URL.
  const { createHmac } = await import('node:crypto');
  const secret = process.env.WHATSAPP_CHECKOUT_SECRET;
  if (!secret || secret.length < 32) throw new Error('CHECKOUT_SECRET_REQUIRED');
  const capability = createHmac('sha256', secret).update(hold.id).digest('hex');
  const url = `${origin()}/api/whatsapp/pay/${capability}`;
  if (existing.data) return url;
  const price = await db().from('pricing_config').select('price,currency').eq('session_type', session.data.service).eq('bundle_size', 1).single(); check(price.error);
  if (!price.data || price.data.currency !== 'INR' || Number(price.data.price) <= 0) throw new Error('PRICE_UNAVAILABLE');
  if (Number(price.data.price) !== session.data.quotedAmount) throw new Error('PRICE_CHANGED');
  const checkout = createPayUPaymentFields({
    userId, userName: session.data.name!, userEmail: session.data.email!, userPhone: session.wa_id,
    amount: Number(price.data.price), sessionType: session.data.service!, slotId: hold.slot_id,
    callbackUrl: `${origin()}/api/whatsapp/payment-return`, returnUrl: `${origin()}/api/whatsapp/payment-return`,
  });
  // Do not echo patient context into PayU UDFs. Sign minimal server-resolved fields instead.
  const { buildPayUInitiationHash } = await import('../payu');
  checkout.fields.udf1 = ''; checkout.fields.udf2 = ''; checkout.fields.udf3 = ''; checkout.fields.udf4 = ''; checkout.fields.udf5 = '';
  const config = getPayUConfig();
  checkout.fields.hash = buildPayUInitiationHash({ key: config.key, salt: config.salt, txnid: checkout.txnid, amount: checkout.fields.amount, productinfo: checkout.fields.productinfo, firstname: checkout.fields.firstname, email: checkout.fields.email });
  check((await db().from('whatsapp_payments').insert({ txnid: checkout.txnid, hold_id: hold.id, session_id: session.id, user_id: userId, amount: Number(price.data.price), service: session.data.service, token_hash: digest(capability), checkout })).error);
  return url;
}
export async function validatePayUWebhook(fields: Record<string, string>) {
  const config = getPayUConfig();
  if (!config.key || !config.salt || fields.key !== config.key || !fields.txnid || fields.txnid.length > 100) return false;
  const hash = buildPayUResponseHash({ key: fields.key, salt: config.salt, txnid: fields.txnid, amount: fields.amount, productinfo: fields.productinfo, firstname: fields.firstname, email: fields.email, status: fields.status, udf1: fields.udf1, udf2: fields.udf2, udf3: fields.udf3, udf4: fields.udf4, udf5: fields.udf5, additionalCharges: fields.additional_charges || fields.additionalCharges });
  return equalSecret(hash, fields.hash?.toLowerCase() || '');
}
export async function settlePayment(txnid: string) {
  const result = await verifyPayUPayment(txnid);
  if (!result.transaction) throw new Error('PAYU_VERIFICATION_UNAVAILABLE');
  const t = result.transaction;
  if (t.txnid !== txnid || !Number.isFinite(Number(t.amount)) || (t.status === 'success' && !t.mihpayid)) throw new Error('PAYU_TRANSACTION_INVALID');
  await rpc('wa_payment_result', { p_txnid: txnid, p_status: t.status, p_provider: t.mihpayid, p_amount: Number(t.amount), p_event: digest(`${txnid}:${t.mihpayid}:${t.status}`) });
  if (!['success', 'failure'].includes(t.status)) throw new Error('PAYU_PENDING');
}
export const checkoutNonce = () => randomBytes(18).toString('base64');
