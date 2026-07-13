import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { TokenVaultPort } from '../../domain/ports/outbound/token-vault.port.js';
import { TOKEN_VAULT_PORT } from '../../domain/ports/outbound/token-vault.port.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getKey(): Buffer {
  const raw = process.env['TOKEN_VAULT_KEY'];
  if (!raw) {
    throw new Error('TOKEN_VAULT_KEY environment variable is not set. Provide a hex-encoded 32-byte key.');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_VAULT_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). Provide a valid hex-encoded 32-byte key.`,
    );
  }
  return key;
}

@Injectable()
export class AesTokenVault implements TokenVaultPort {
  async encrypt(plaintext: string): Promise<string> {
    const key = getKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  async decrypt(ciphertext: string): Promise<string> {
    const key = getKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format. Expected iv_hex:authTag_hex:ciphertext_hex.');
    }
    const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}

export { TOKEN_VAULT_PORT };
