"""Identificadores, tokens de edición, límite de tamaño, rate limit y cabeceras."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import deque

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# ── Identificadores y tokens ────────────────────────────────────────────────

# 12 bytes → 16 caracteres URL-safe (96 bits): imposible de adivinar o enumerar.
ID_RE = re.compile(r"^[A-Za-z0-9_-]{16}$")


def new_character_id() -> str:
    return secrets.token_urlsafe(12)


def new_edit_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(token: str | None, expected_hash: str) -> bool:
    if not token:
        return False
    return hmac.compare_digest(hash_token(token), expected_hash)


def is_valid_id(value: str) -> bool:
    return bool(ID_RE.fullmatch(value))


# ── Límite de tamaño del cuerpo (también para cuerpos sin Content-Length) ──


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            await _too_large(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await _too_large(scope, receive, send)


class _BodyTooLarge(Exception):
    pass


async def _too_large(scope: Scope, receive: Receive, send: Send) -> None:
    response = JSONResponse(
        {"error": {"code": "payload_too_large", "message": "El personaje es demasiado grande para guardarlo."}},
        status_code=413,
    )
    await response(scope, receive, send)


# ── Rate limit en memoria (suficiente para una única instancia) ─────────────


class RateLimiter:
    def __init__(self, max_events: int, window_seconds: int) -> None:
        self.max_events = max_events
        self.window = window_seconds
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        if self.max_events <= 0:
            return True
        now = time.monotonic()
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and now - events[0] > self.window:
                events.popleft()
            if len(events) >= self.max_events:
                return False
            events.append(now)
            # Limpieza ocasional para que el diccionario no crezca sin límite.
            if len(self._events) > 10_000:
                self._events = {k: v for k, v in self._events.items() if v and now - v[-1] <= self.window}
            return True


# ── Cabeceras de seguridad ───────────────────────────────────────────────────

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # La UI asigna algunos estilos en línea (barras de progreso, etc.).
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                existing = {k.lower() for k, _ in headers}
                extra = {
                    b"x-content-type-options": b"nosniff",
                    b"referrer-policy": b"same-origin",
                    b"x-frame-options": b"DENY",
                    b"permissions-policy": b"camera=(), microphone=(), geolocation=()",
                    b"content-security-policy": CONTENT_SECURITY_POLICY.encode(),
                }
                if self.hsts:
                    extra[b"strict-transport-security"] = b"max-age=31536000; includeSubDomains"
                headers.extend((k, v) for k, v in extra.items() if k not in existing)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
