"""AES-256-GCM repo token decryption (matches apps/api platform/encryption.ts)."""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_BYTES = 12
TAG_BYTES = 16


def parse_encryption_key(base64_key: str) -> bytes:
    """Decode the base64 TOKEN_ENC_KEY into a 32-byte AES key.

    @param base64_key - Base64-encoded key from the environment.
    @returns 32-byte key material.
    @raises ValueError when the key is missing or not 32 bytes after decoding.
    """
    if not base64_key:
        raise ValueError("TOKEN_ENC_KEY is not set; cannot decrypt repo tokens.")
    key = base64.b64decode(base64_key)
    if len(key) != 32:
        raise ValueError(f"TOKEN_ENC_KEY must decode to 32 bytes (got {len(key)}).")
    return key


def decrypt_token(ciphertext: str, key: bytes) -> str:
    """Decrypt an `iv:ciphertext:authTag` hex string produced by the Node API.

    @param ciphertext - Encrypted token string stored in `repos.token_enc` (UTF-8 bytes).
    @param key - 32-byte AES key from {@link parse_encryption_key}.
    @returns Plaintext deploy token.
    @raises ValueError when the format or auth tag is invalid.
    """
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid ciphertext format; expected iv:ciphertext:authTag.")
    iv_hex, enc_hex, tag_hex = parts
    iv = bytes.fromhex(iv_hex)
    encrypted = bytes.fromhex(enc_hex)
    tag = bytes.fromhex(tag_hex)
    if len(tag) != TAG_BYTES:
        raise ValueError(f"Invalid auth tag length: {len(tag)} (expected {TAG_BYTES}).")
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, encrypted + tag, None)
    return plaintext.decode("utf-8")


def token_bytes_to_ciphertext(token_enc: bytes | None) -> str | None:
    """Convert BYTEA column bytes to the hex ciphertext string used by decrypt_token.

    @param token_enc - Raw bytes from Postgres or `None`.
    @returns UTF-8 decoded ciphertext string or `None`.
    """
    if token_enc is None:
        return None
    return token_enc.decode("utf-8")
