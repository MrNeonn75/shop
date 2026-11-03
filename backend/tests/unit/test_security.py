"""Təhlükəsizlik və Parol Həşləmə Testləri (Argon2id Security)."""

from __future__ import annotations

from app.core.security import hash_password, needs_rehash, verify_password


def test_argon2id_hash_and_verify() -> None:
    raw_password = "SuperSecretPassword123!"
    hashed = hash_password(raw_password)

    assert hashed.startswith("$argon2id$")
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert needs_rehash(hashed) is False


def test_verify_password_invalid_hash() -> None:
    assert verify_password("secret", "invalid_hash_string") is False
