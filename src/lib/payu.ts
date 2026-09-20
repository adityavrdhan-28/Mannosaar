import crypto from 'crypto';
import PayU from 'payu-websdk';

export interface PayUSessionDate {
  date: string;
  slotId: string;
  startTime: string;
  endTime: string;
}

export type PayUPaymentMode = 'auto' | 'cards' | 'netbanking' | 'wallets' | 'upi_intent' | 'upi_qr';
export type PayUUpiAppName = 'any' | 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'qr';

export interface PayUBookingContext {
  userId: string;
  userEmail: string;
  userName: string;
  userPhone?: string;
  sessionType: string;
  amount: number;
  slotId?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  bundle?: number | null;
  sessionDates?: PayUSessionDate[];
  notes?: string;
  returnUrl?: string;
  callbackUrl?: string;
  paymentMode?: PayUPaymentMode;
  s2sClientIp?: string;
  s2sDeviceInfo?: string;
  upiAppName?: PayUUpiAppName | null;
}

export type PayUInitiationInput = PayUBookingContext;

interface PayUPaymentModeFields {
  pg?: string;
  bankcode?: string;
  txn_s2s_flow?: string;
  upiAppName?: string;
}

export interface PayUInitiationResult {
  paymentUrl: string;
  fields: Record<string, string>;
  txnid: string;
  paymentMode: PayUPaymentMode;
}

export interface PayUHostedCheckoutResult {
  paymentHtml: string;
  txnid: string;
  paymentMode: PayUPaymentMode;
}

export interface PayUVerifiedTransaction {
  amount: string;
  mihpayid: string;
  raw: Record<string, unknown>;
  status: string;
  txnid: string;
  unmappedStatus: string;
}

export interface PayUVerifyPaymentResult {
  isSuccess: boolean;
  message: string;
  raw: Record<string, unknown> | null;
  transaction: PayUVerifiedTransaction | null;
}

function isTestPaymentUrl(paymentUrl: string) {
  return paymentUrl.includes('test.payu.in');
}

function toRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function getPayUSdkEnvironment(paymentUrl: string) {
  return isTestPaymentUrl(paymentUrl) ? 'TEST' : 'PROD';
}

function getPayUClient() {
  const { key, salt, paymentUrl } = getPayUConfig();

  if (!key || !salt) {
    throw new Error('PayU credentials are not configured');
  }

  return new PayU(
    {
      key,
      salt,
    },
    getPayUSdkEnvironment(paymentUrl)
  );
}

export function getPayUConfig() {
  const key =
    process.env.PAYU_KEY ||
    process.env.PAYU_MERCHANT_KEY ||
    process.env.NEXT_PUBLIC_PAYU_KEY ||
    '';
  const salt =
    process.env.PAYU_SALT ||
    process.env.PAYU_MERCHANT_SALT ||
    '';
  const paymentUrl = process.env.PAYU_PAYMENT_URL || process.env.PAYU_BASE_URL || 'https://secure.payu.in/_payment';

  return { key, salt, paymentUrl };
}

function buildPayUPaymentPayload(input: PayUInitiationInput, txnid = generatePayUTxnId()) {
  const { paymentUrl } = getPayUConfig();
  const bundleSize = input.sessionDates?.length || input.bundle || 1;
  const productinfo = getPayUProductInfo(input.sessionType, bundleSize);
  const amount = normalizePayUAmount(input.amount);
  const firstSession = input.sessionDates?.[0];
  const paymentMode = input.paymentMode || 'auto';
  const encodedContext = encodePayUContext({
    userId: input.userId,
    userEmail: input.userEmail,
    userName: input.userName,
    userPhone: input.userPhone,
    sessionType: input.sessionType,
    amount: input.amount,
    slotId: input.slotId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    bundle: input.bundle,
    sessionDates: input.sessionDates,
    notes: input.notes,
    returnUrl: input.returnUrl,
    paymentMode,
    s2sClientIp: input.s2sClientIp,
    s2sDeviceInfo: input.s2sDeviceInfo,
    upiAppName: input.upiAppName,
  });

  const paymentModeFields = getPayUPaymentModeFields(paymentMode, input.upiAppName);
  const params: Record<string, string> = {
    txnid,
    amount,
    productinfo,
    firstname: input.userName,
    email: input.userEmail,
    phone: input.userPhone || '',
    surl: input.callbackUrl || input.returnUrl || '',
    furl: input.callbackUrl || input.returnUrl || '',
    udf1: encodedContext,
    udf2: input.returnUrl || '',
    udf3: input.sessionType,
    udf4: String(input.userId),
    udf5: input.slotId || firstSession?.slotId || '',
    service_provider: 'payu_paisa',
  };

  if (input.s2sClientIp) {
    params.s2s_client_ip = input.s2sClientIp;
  }

  if (input.s2sDeviceInfo) {
    params.s2s_device_info = input.s2sDeviceInfo;
  }

  if (paymentModeFields.pg) {
    params.pg = paymentModeFields.pg;
  }

  if (paymentModeFields.bankcode) {
    params.bankcode = paymentModeFields.bankcode;
  }

  if (paymentModeFields.txn_s2s_flow) {
    params.txn_s2s_flow = paymentModeFields.txn_s2s_flow;
  }

  if (paymentModeFields.upiAppName) {
    params.upiAppName = paymentModeFields.upiAppName;
  }

  return {
    params,
    paymentMode,
    paymentUrl,
    txnid,
  };
}

export function encodePayUContext(context: PayUBookingContext): string {
  return Buffer.from(JSON.stringify(context), 'utf8').toString('base64');
}

export function decodePayUContext(encodedContext?: string | null): PayUBookingContext | null {
  if (!encodedContext) {
    return null;
  }

  try {
    const decoded = Buffer.from(encodedContext, 'base64').toString('utf8');
    return JSON.parse(decoded) as PayUBookingContext;
  } catch (error) {
    console.error('Failed to decode PayU context:', error);
    return null;
  }
}

export function serializePayUSessionDates(sessionDates?: PayUSessionDate[]) {
  if (!sessionDates?.length) {
    return '';
  }

  return sessionDates
    .map((session) =>
      [session.date, session.startTime, session.endTime, session.slotId]
        .map((value) => encodeURIComponent(value || ''))
        .join('~')
    )
    .join(';');
}

export function deserializePayUSessionDates(serialized?: string | null): PayUSessionDate[] {
  if (!serialized) {
    return [];
  }

  try {
    return serialized
      .split(';')
      .map((entry) => {
        const [date, startTime, endTime, slotId] = entry
          .split('~')
          .map((value) => decodeURIComponent(value || ''));

        return { date, startTime, endTime, slotId };
      })
      .filter((session) => session.date && session.startTime && session.endTime && session.slotId);
  } catch (error) {
    console.error('Failed to deserialize PayU session dates:', error);
    return [];
  }
}

export function generatePayUTxnId() {
  return `payu_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function normalizePayUAmount(amount: number) {
  return Number(amount).toFixed(2);
}

export function getPayUProductInfo(sessionType: string, bundleSize: number) {
  const typeLabel = sessionType === 'couple' ? 'Couple Therapy' : 'Personal Therapy';
  return bundleSize > 1 ? `${typeLabel} Bundle x${bundleSize}` : `${typeLabel} Session`;
}

export function getPayUUpiAppCode(upiAppName?: PayUUpiAppName | null) {
  switch (upiAppName) {
    case 'gpay':
      return 'gpay';
    case 'phonepe':
      return 'phonepe';
    case 'paytm':
      return 'paytm';
    case 'bhim':
      return 'bhim';
    case 'qr':
      return 'qr';
    case 'any':
    default:
      return 'gpay/phonepe/paytm/bhim';
  }
}

export function getPayUPaymentModeFields(
  paymentMode?: PayUPaymentMode,
  upiAppName?: PayUUpiAppName | null
): PayUPaymentModeFields {
  switch (paymentMode) {
    case 'upi_intent':
      return {
        pg: 'UPI',
        bankcode: 'INTENT',
        upiAppName: getPayUUpiAppCode(upiAppName),
      };
    case 'upi_qr':
      return {
        pg: 'UPI',
        bankcode: 'INTENT',
        upiAppName: 'qr',
      };
    case 'cards':
      return { pg: 'CC' };
    case 'netbanking':
      return { pg: 'NB' };
    case 'wallets':
      return { pg: 'CASH' };
    default:
      return {};
  }
}

export function buildPayUInitiationHash(params: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  salt: string;
}) {
  const client = new PayU(
    {
      key: params.key,
      salt: params.salt,
    },
    'TEST'
  );

  return client.hasher.generatePaymentHash({
    txnid: params.txnid,
    amount: params.amount,
    productinfo: params.productinfo,
    firstname: params.firstname,
    email: params.email,
    udf1: params.udf1 || '',
    udf2: params.udf2 || '',
    udf3: params.udf3 || '',
    udf4: params.udf4 || '',
    udf5: params.udf5 || '',
  });
}

export function buildPayUCommandHash(params: {
  key: string;
  command: string;
  salt: string;
  var1: string;
}) {
  const hashSequence = [params.key, params.command, params.var1, params.salt];
  return crypto.createHash('sha512').update(hashSequence.join('|')).digest('hex');
}

export function getPayUCommandUrl(explicitUrl?: string) {
  if (explicitUrl) {
    return explicitUrl;
  }

  const paymentUrl = getPayUConfig().paymentUrl;
  return isTestPaymentUrl(paymentUrl)
    ? 'https://test.payu.in/merchant/postservice.php?form=2'
    : 'https://secure.payu.in/merchant/postservice?form=2';
}

export function getPayUVerifyPaymentUrl() {
  return getPayUCommandUrl(process.env.PAYU_VERIFY_PAYMENT_URL);
}

export function buildPayUVerifyPaymentHash(params: {
  key: string;
  txnid: string;
  salt: string;
}) {
  return buildPayUCommandHash({
    key: params.key,
    command: 'verify_payment',
    salt: params.salt,
    var1: params.txnid,
  });
}

export function buildPayUResponseHash(params: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  status: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  salt: string;
  additionalCharges?: string;
}) {
  // PayU only prefixes the reverse hash when its callback includes additional_charges.
  // The SDK adds an `undefined` prefix for normal responses, which rejects valid payments.
  const reverseHashSequence = `${params.salt}|${params.status}||||||${params.udf5 || ''}|${params.udf4 || ''}|${params.udf3 || ''}|${params.udf2 || ''}|${params.udf1 || ''}|${params.email}|${params.firstname}|${params.productinfo}|${params.amount}|${params.txnid}|${params.key}`;
  const hashSequence = params.additionalCharges
    ? `${params.additionalCharges}|${reverseHashSequence}`
    : reverseHashSequence;

  return crypto.createHash('sha512').update(hashSequence).digest('hex');
}

export async function verifyPayUPayment(txnid: string): Promise<PayUVerifyPaymentResult> {
  try {
    const { key, salt } = getPayUConfig();
    if (!key || !salt) throw new Error('PAYU_CONFIG_MISSING');
    const response = await fetch(getPayUVerifyPaymentUrl(), {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key, command: 'verify_payment', var1: txnid, hash: buildPayUVerifyPaymentHash({ key, salt, txnid }) }),
    });
    if (!response.ok) throw new Error('PAYU_VERIFICATION_UNAVAILABLE');
    const raw = await response.json();
    const rawRecord = toRecord(raw);
    const detailsContainer = toRecord(rawRecord?.transaction_details);
    const transaction = toRecord(detailsContainer?.[txnid]);

    if (!transaction) {
      return {
        isSuccess: false,
        message: 'Verify payment response did not include the requested transaction',
        raw: rawRecord,
        transaction: null,
      };
    }

    const normalizedTransaction: PayUVerifiedTransaction = {
      amount: toStringValue(transaction.amt || transaction.amount || transaction.transaction_amount),
      mihpayid: toStringValue(transaction.mihpayid || transaction.paymentId),
      raw: transaction,
      status: toStringValue(transaction.status).toLowerCase(),
      txnid: toStringValue(transaction.txnid || txnid),
      unmappedStatus: toStringValue(transaction.unmappedstatus || transaction.unmappedStatus).toLowerCase(),
    };

    return {
      isSuccess: normalizedTransaction.status === 'success',
      message: toStringValue(rawRecord?.msg || rawRecord?.message) || 'Verify payment response received',
      raw: rawRecord,
      transaction: normalizedTransaction,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : 'Verify payment request failed',
      raw: null,
      transaction: null,
    };
  }
}

export function createPayUPaymentFields(input: PayUInitiationInput): PayUInitiationResult {
  const { key, paymentUrl } = getPayUConfig();
  const { params, paymentMode, txnid } = buildPayUPaymentPayload(input);
  const hash = getPayUClient().hasher.generatePaymentHash(params);

  return {
    paymentUrl,
    paymentMode,
    txnid,
    fields: {
      ...params,
      key,
      hash,
    },
  };
}

export function createPayUPaymentHtml(input: PayUInitiationInput): PayUHostedCheckoutResult {
  const { params, paymentMode, txnid } = buildPayUPaymentPayload(input);
  const paymentHtml = getPayUClient().paymentInitiate(params);

  return {
    paymentHtml,
    paymentMode,
    txnid,
  };
}
