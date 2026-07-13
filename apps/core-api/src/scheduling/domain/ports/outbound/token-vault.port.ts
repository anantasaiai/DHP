export interface TokenVaultPort {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export const TOKEN_VAULT_PORT = Symbol('TokenVaultPort');
