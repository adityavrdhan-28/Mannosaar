import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key(): Buffer | null {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value) return null;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_INVALID');
  return decoded;
}
export function protectToken(token: string) {
  const secret = key();
  if (!secret) return token;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['enc1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}
export function revealToken(token: string) {
  if (!token.startsWith('enc1.')) return token;
  const secret = key();
  if (!secret) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_REQUIRED');
  const [, iv, tag, ciphertext] = token.split('.');
  const decipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
