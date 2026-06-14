import { describe, it, expect } from "vitest";
import { parseEncryptionKey, encryptToken, decryptToken } from "./encryption";

/** A valid 32-byte key expressed as base64 for test use. */
const VALID_KEY_B64 = Buffer.alloc(32, 0xab).toString("base64");
const VALID_KEY = parseEncryptionKey(VALID_KEY_B64);

describe("parseEncryptionKey", () => {
  it("returns a 32-byte buffer for a valid 32-byte base64 key", () => {
    const key = parseEncryptionKey(VALID_KEY_B64);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.byteLength).toBe(32);
  });

  it("throws when the input is an empty string", () => {
    expect(() => parseEncryptionKey("")).toThrow("TOKEN_ENC_KEY is not set");
  });

  it("throws when the decoded key is not 32 bytes", () => {
    const short = Buffer.alloc(16).toString("base64");
    expect(() => parseEncryptionKey(short)).toThrow("must decode to exactly 32 bytes");
  });
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a plaintext value through encrypt then decrypt", () => {
    const plaintext = "ghp_supersecret_token";
    const ciphertext = encryptToken(plaintext, VALID_KEY);
    expect(decryptToken(ciphertext, VALID_KEY)).toBe(plaintext);
  });

  it("produces different ciphertexts on each call (random IV)", () => {
    const plaintext = "same-value";
    const ct1 = encryptToken(plaintext, VALID_KEY);
    const ct2 = encryptToken(plaintext, VALID_KEY);
    expect(ct1).not.toBe(ct2);
  });

  it("ciphertext contains three colon-separated hex segments", () => {
    const ct = encryptToken("test", VALID_KEY);
    expect(ct.split(":")).toHaveLength(3);
  });

  it("throws when the ciphertext has the wrong number of segments", () => {
    expect(() => decryptToken("only-two:parts", VALID_KEY)).toThrow("Invalid ciphertext format");
  });

  it("throws when the auth tag is tampered with", () => {
    const ct = encryptToken("secret", VALID_KEY);
    const [iv, enc] = ct.split(":");
    const badTag = "0".repeat(32); // wrong tag
    expect(() => decryptToken(`${iv}:${enc}:${badTag}`, VALID_KEY)).toThrow();
  });

  it("throws when the auth tag hex length is invalid", () => {
    const ct = encryptToken("secret", VALID_KEY);
    const [iv, enc] = ct.split(":");
    const shortTag = "ab"; // only 1 byte
    expect(() => decryptToken(`${iv}:${enc}:${shortTag}`, VALID_KEY)).toThrow(
      "Invalid auth tag length",
    );
  });
});
