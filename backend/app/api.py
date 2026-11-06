"""API REST de personajes compartidos.

    POST   /api/characters        → crea; devuelve id + editToken (una sola vez)
    GET    /api/characters/{id}   → lectura pública (enlace para compartir)
    PUT    /api/characters/{id}   → actualiza; requiere Authorization: Bearer <editToken>
    DELETE /api/characters/{id}   → elimina; requiere el token
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .repository import CharacterRepository, StoredCharacter
from .security import RateLimiter, hash_token, is_valid_id, new_character_id, new_edit_token, token_matches
from .validation import DocumentError, validate_document


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


class CreateCharacterBody(BaseModel):
    document: dict[str, Any]


class UpdateCharacterBody(BaseModel):
    document: dict[str, Any]
    revision: int | None = Field(default=None, ge=1)


def _public(stored: StoredCharacter) -> dict[str, Any]:
    return {
        "id": stored.id,
        "revision": stored.revision,
        "createdAt": stored.created_at,
        "updatedAt": stored.updated_at,
        "document": stored.document,
    }


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def build_router(repo: CharacterRepository, limiter: RateLimiter, trust_proxy: bool) -> APIRouter:
    router = APIRouter(prefix="/api")

    def client_key(request: Request) -> str:
        if trust_proxy:
            forwarded = request.headers.get("x-forwarded-for", "")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def check_rate(request: Request) -> None:
        if not limiter.allow(client_key(request)):
            raise ApiError(429, "rate_limited", "Demasiadas operaciones seguidas. Espera unos minutos e inténtalo de nuevo.")

    def load(character_id: str) -> StoredCharacter:
        stored = repo.get(character_id) if is_valid_id(character_id) else None
        if stored is None:
            raise ApiError(404, "not_found", "No existe ningún personaje con ese enlace (o fue eliminado).")
        return stored

    def authorize(stored: StoredCharacter, authorization: str | None) -> None:
        if not token_matches(_bearer(authorization), stored.edit_token_hash):
            raise ApiError(403, "forbidden", "No tienes permiso para modificar este personaje.")

    def validated(document: dict[str, Any]) -> str:
        try:
            return validate_document(document)
        except DocumentError as exc:
            raise ApiError(422, "invalid_document", str(exc)) from exc

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.post("/characters", status_code=201)
    def create_character(body: CreateCharacterBody, request: Request) -> dict[str, Any]:
        check_rate(request)
        name = validated(body.document)
        token = new_edit_token()
        stored = repo.create(new_character_id(), hash_token(token), body.document, name)
        return {**_public(stored), "editToken": token}

    @router.get("/characters/{character_id}")
    def get_character(character_id: str, response: Response) -> dict[str, Any]:
        response.headers["Cache-Control"] = "no-store"
        return _public(load(character_id))

    @router.put("/characters/{character_id}")
    def update_character(
        character_id: str,
        body: UpdateCharacterBody,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        check_rate(request)
        stored = load(character_id)
        authorize(stored, authorization)
        name = validated(body.document)
        updated = repo.update(character_id, body.document, name, body.revision)
        if updated is None:
            raise ApiError(
                409,
                "conflict",
                "La copia en línea cambió desde otro dispositivo. Vuelve a cargarla o guarda una copia nueva.",
            )
        return _public(updated)

    @router.delete("/characters/{character_id}", status_code=204)
    def delete_character(
        character_id: str, request: Request, authorization: str | None = Header(default=None)
    ) -> Response:
        check_rate(request)
        stored = load(character_id)
        authorize(stored, authorization)
        repo.delete(character_id)
        return Response(status_code=204)

    return router
