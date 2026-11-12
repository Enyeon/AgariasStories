// Ruta /tienda (y /tienda/<personaje>): la Tienda general.
//
// Es una vista más de la app: usa los mismos servicios (personajes,
// Homebrew/campañas) y no guarda dinero ni inventario propios. Lo comprado
// aparece en la ficha del personaje (pestañas Equipo y Taller).

// Tipografías de la Tienda, servidas desde la propia app (la CSP no permite
// fuentes externas). Sólo se cargan al entrar en /tienda.
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './shop.css';
import { html, setHtml } from '../../ui/dom.js';
import { createShopService } from '../../services/shop.js';
import { mountShopView } from './shop-view.js';

export async function mountShop(container, { services }, characterId = null) {
  const page = document.createElement('section');
  page.className = 'page page--shop';
  container.append(page);
  setHtml(page, html`<div class="loading" role="status"><span class="spinner"></span> Abriendo los puestos del mercado…</div>`);

  let service;
  try {
    service = await createShopService({ characters: services.characters, homebrew: services.homebrew }).init(characterId);
  } catch (err) {
    console.error('[tienda] No se pudo abrir', err);
    setHtml(page, html`<div class="empty-state"><h1>No se pudo abrir la Tienda</h1><p>${err?.userMessage ?? 'Revisa la conexión e inténtalo de nuevo.'}</p><a class="btn btn--primary" href="/" data-link>Volver a mis personajes</a></div>`);
    return null;
  }

  if (!service.state.characters.length) {
    setHtml(page, html`<div class="empty-state"><h1>🛒 La Tienda</h1><p>Para comprar necesitas un personaje: la Tienda cobra de sus monedas y deja lo comprado en su inventario.</p><a class="btn btn--primary" href="/" data-link>Crear o importar un personaje</a></div>`);
    return null;
  }

  // La URL sigue al personaje elegido, sin recargar la vista.
  if (service.state.characterId && characterId !== service.state.characterId) {
    history.replaceState({}, '', `/tienda/${encodeURIComponent(service.state.characterId)}`);
  }
  const view = mountShopView(page, service, {
    onCharacterChange: (id) => history.replaceState({}, '', `/tienda/${encodeURIComponent(id)}`),
  });
  return { unmount: () => view.destroy() };
}
