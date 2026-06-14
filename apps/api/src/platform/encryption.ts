import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM constants.
 * GCM provides both confidentiality (AES-256) and integrity (auth tag).
 */
const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12; // 96-bit IV — optimal for GCM
const TAG_BYTES = 16; // 128-bit auth tag

/**
 * Parses the base64-encoded 32-byte AES-256 encryption key from the environment.
 * Throws if the decoded key is not exactly 32 bytes.
 * @param base64 - Base64-encoded key string (TOKEN_ENC_KEY in .env).
 * @returns A 32-byte {@link Buffer}.
 * @throws If the key is empty or not 32 bytes after decoding.
 */
export function parseEncryptionKey(base64: string): Buffer {
  if (!base64) {
    throw new Error("TOKEN_ENC_KEY is not set; cannot encrypt or decrypt repo tokens.");
  }
  const key = Buffer.from(base64, "base64");
  if (key.byteLength !== 32) {
    throw new Error(
      `TOKEN_ENC_KEY must decode to exactly 32 bytes for AES-256 (got ${key.byteLength}).`,
    );
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Produces a compact hex string in the format: `<iv>:<ciphertext>:<authTag>`.
 * @param plaintext - The value to encrypt (e.g. a repo deploy token).
 * @param key - 32-byte AES key produced by {@link parseEncryptionKey}.
 * @returns Hex-encoded `iv:ciphertext:authTag` suitable for storage in Postgres.
 */
export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext produced by {@link encryptToken}.
 * @param ciphertext - Hex-encoded `iv:ciphertext:authTag` string.
 * @param key - 32-byte AES key produced by {@link parseEncryptionKey}.
 * @returns The original plaintext.
 * @throws If the format is invalid or the GCM auth tag verification fails.
 */
export function decryptToken(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format; expected iv:ciphertext:authTag.");
  }
  const [ivHex, encHex, tagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  if (tag.byteLength !== TAG_BYTES) {
    throw new Error(`Invalid auth tag length: ${tag.byteLength} (expected ${TAG_BYTES}).`);
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
