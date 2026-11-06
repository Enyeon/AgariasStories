"""Punto de entrada de la aplicación FastAPI.

Ejecutar en desarrollo (desde backend/):
    uvicorn app.main:create_app --factory --reload
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import ApiError, build_router, error_response
from .config import Settings, load_settings
from .db import init_db
from .repository import CharacterRepository
from .security import BodySizeLimitMiddleware, RateLimiter, SecurityHeadersMiddleware

logger = logging.getLogger("agarias")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    init_db(settings.database_path)
    repo = CharacterRepository(settings.database_path)
    limiter = RateLimiter(settings.rate_limit_writes, settings.rate_limit_window_seconds)

    app = FastAPI(
        title="Stories of Agarias API",
        version="2.0.0",
        docs_url="/api/docs" if settings.enable_docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.enable_docs else None,
    )
    app.state.settings = settings

    # Orden: el último añadido es el más externo.
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=["Content-Type", "Authorization"],
            max_age=600,
        )
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        logger.info("Petición inválida: %s", exc.errors()[:3])
        return error_response(422, "invalid_request", "Los datos enviados no tienen el formato esperado.")

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        message = "Recurso no encontrado." if exc.status_code == 404 else "Operación no permitida."
        return error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Error inesperado", exc_info=exc)
        return error_response(500, "server_error", "Ocurrió un error en el servidor. Inténtalo más tarde.")

    app.include_router(build_router(repo, limiter, settings.trust_proxy_headers))

    if settings.frontend_dist:
        _mount_frontend(app, settings.frontend_dist)
    else:
        _mount_dev_notice(app)

    return app


def _mount_dev_notice(app: FastAPI) -> None:
    """Sin build del frontend, "/" explica cómo abrir la app en vez de dar 404."""
    from fastapi.responses import HTMLResponse

    page = """<!doctype html><html lang="es"><meta charset="utf-8">
<title>Stories of Agarias · API</title>
<body style="font-family:system-ui;background:#0f1116;color:#ebe8e1;max-width:640px;margin:10vh auto;padding:0 1rem;line-height:1.6">
<h1>La API está funcionando ✓</h1>
<p>Este servidor (puerto 8000) sólo sirve la API porque todavía no existe <code>frontend/dist</code>.</p>
<p><strong>En desarrollo</strong>, abre la aplicación en <a style="color:#a78bfa" href="http://localhost:5173">http://localhost:5173</a>
(ejecuta <code>npm run dev</code> dentro de la carpeta <code>frontend</code>).</p>
<p><strong>En producción</strong>, ejecuta <code>npm run build</code> en <code>frontend</code> y reinicia este servidor:
la aplicación se servirá aquí mismo.</p>
<p>Comprobación de la API: <a style="color:#a78bfa" href="/api/health">/api/health</a></p>
</body></html>"""

    @app.get("/", include_in_schema=False)
    async def dev_notice() -> HTMLResponse:
        return HTMLResponse(page)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Sirve el build del frontend y devuelve index.html para las rutas de la SPA."""
    dist = dist.resolve()
    index = dist / "index.html"

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path.startswith("api/") or path == "api":
            raise StarletteHTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(dist):
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        if "." in Path(path).name:
            raise StarletteHTTPException(status_code=404)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

