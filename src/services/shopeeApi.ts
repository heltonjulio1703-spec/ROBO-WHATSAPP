import crypto from 'crypto';

interface ShopeeAuthParams {
  appKey: string;
  appSecret: string;
  payload: string;
  timestamp?: number;
}

export interface ShopeeAuthResult {
  authHeader: string;
  headerVariants: string[];
  timestamp: number;
  payloadStr: string;
  signature: string;
}

/**
 * Validates if the given timestamp (or current time) is within the 10-minute allowed window.
 */
export function validateTimestamp(timestamp: number): void {
  const now = Math.floor(Date.now() / 1000);
  // 10 minutes = 600 seconds
  if (Math.abs(now - timestamp) > 600) {
    throw new Error('Timestamp está fora da janela de 10 minutos permitida pela Shopee.');
  }
}

/**
 * Generates the Official Shopee Affiliate API Authorization Header and fallback variants.
 * Uses the formula: SHA256(AppKey + Timestamp + MinifiedPayload + AppSecret)
 */
export function generateShopeeAuthHeader({
  appKey,
  appSecret,
  payload,
  timestamp = Math.floor(Date.now() / 1000)
}: ShopeeAuthParams): ShopeeAuthResult {
  // Validate timestamp within 10-minute window
  validateTimestamp(timestamp);

  // Clean credentials
  const cleanAppKey = (appKey || '').trim();
  const cleanAppSecret = (appSecret || '').trim();

  // Stringify the payload consistently to ensure no extra spaces or line breaks
  let payloadStr = payload;
  try {
    payloadStr = JSON.stringify(JSON.parse(payload));
  } catch (e) {
    // If it's already a string, ensure linebreaks are stripped
    payloadStr = payload.replace(/[\r\n]+/g, '').trim();
  }

  // 1. Official SHA256 concatenation: AppKey + Timestamp + Payload + Secret
  const factorSimple = cleanAppKey + timestamp + payloadStr + cleanAppSecret;
  const signatureSimple = crypto
    .createHash('sha256')
    .update(factorSimple)
    .digest('hex');
  const signatureSimpleUpper = signatureSimple.toUpperCase();

  // 2. Secret-first SHA256 concatenation: Secret + AppKey + Timestamp + Payload
  const factorSecretFirst = cleanAppSecret + cleanAppKey + timestamp + payloadStr;
  const signatureSecretFirst = crypto
    .createHash('sha256')
    .update(factorSecretFirst)
    .digest('hex');

  // 3. HMAC-SHA256 variant
  const factorHmac = cleanAppKey + timestamp + payloadStr;
  const signatureHmac = crypto
    .createHmac('sha256', cleanAppSecret)
    .update(factorHmac)
    .digest('hex');

  // Primary Header (Official format: SHA256 Credential=..., Timestamp=..., Signature=...)
  const authHeader = `SHA256 Credential=${cleanAppKey}, Timestamp=${timestamp}, Signature=${signatureSimple}`;

  // Header variants to handle any Shopee gateway variations
  const headerVariants = [
    `SHA256 Credential=${cleanAppKey}, Timestamp=${timestamp}, Signature=${signatureSimple}`,
    `SHA256 Credential=${cleanAppKey},Timestamp=${timestamp},Signature=${signatureSimple}`,
    `SHA256 Credential=${cleanAppKey}, Timestamp=${timestamp}, Signature=${signatureSimpleUpper}`,
    `SHA256 Credential=${cleanAppKey}, Timestamp=${timestamp}, Signature=${signatureSecretFirst}`,
    `SHA256 Credential=${cleanAppKey}, Timestamp=${timestamp}, Signature=${signatureHmac}`,
    `SHA256 Credential=${cleanAppKey},Timestamp=${timestamp},Signature=${signatureHmac}`
  ];

  return {
    authHeader,
    headerVariants,
    timestamp,
    payloadStr,
    signature: signatureSimple
  };
}

