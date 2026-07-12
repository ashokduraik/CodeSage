"""Tests for repo token decryption."""

import base64

import pytest

from services.encryption import decrypt_token, parse_encryption_key, token_bytes_to_ciphertext


def test_parse_encryption_key_valid() -> None:
    key = b"a" * 32
    encoded = base64.b64encode(key).decode()
    assert parse_encryption_key(encoded) == key


def test_parse_encryption_key_missing_raises() -> None:
    with pytest.raises(ValueError, match="TOKEN_ENC_KEY"):
        parse_encryption_key("")


def test_token_bytes_to_ciphertext() -> None:
    assert token_bytes_to_ciphertext(None) is None
    assert token_bytes_to_ciphertext(b"abc:def:ghi") == "abc:def:ghi"


def test_parse_encryption_key_wrong_length() -> None:
    short = base64.b64encode(b"short").decode()
    with pytest.raises(ValueError, match="32 bytes"):
        parse_encryption_key(short)


def test_decrypt_token_invalid_format() -> None:
    key = b"k" * 32
    with pytest.raises(ValueError, match="Invalid ciphertext format"):
        decrypt_token("not-valid", key)


def test_decrypt_token_invalid_tag_length() -> None:
    key = b"k" * 32
    with pytest.raises(ValueError, match="Invalid auth tag length"):
        decrypt_token(f"{'aa' * 12}:{'bb' * 4}:{'cc' * 2}", key)


def test_decrypt_token_roundtrip_with_node_format() -> None:
    """Verify Python can decrypt ciphertext produced by Node's encryptToken layout."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = b"k" * 32
    iv = b"i" * 12
    aesgcm = AESGCM(key)
    plaintext = b"ghp_secret"
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    enc = ciphertext[:-16]
    tag = ciphertext[-16:]
    stored = f"{iv.hex()}:{enc.hex()}:{tag.hex()}"
    assert decrypt_token(stored, key) == "ghp_secret"
