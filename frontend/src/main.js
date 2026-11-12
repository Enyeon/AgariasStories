import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/sheet.css';
import './styles/alignment.css';

import { createRouter } from './ui/router.js';
import { reportError } from './ui/feedback.js';
import { createCharacterService } from './services/characters.js';
import { requestPersistentStorage } from './services/local-store.js';
import { mountLibrary } from './views/library.js';
import { mountEditor } from './views/editor.js';
import { mountShared } from './views/shared.js';
import { mountReference } from './views/reference.js';
import { mountAbout } from './views/about.js';
import { mountNotFound } from './views/not-found.js';
import { mountHomebrew, mountJoin } from './views/homebrew.js';
// La Tienda se carga sólo al entrar (catálogo y simulación no pesan en el resto).
const mountShop = async (...args) => (await import('./views/shop/index.js')).mountShop(...args);
import { homebrew } from './services/homebrew.js';

const services = { characters: createCharacterService(), homebrew };
// El Homebrew guardado en el dispositivo se instala antes de abrir cualquier
// ficha; las campañas se actualizan después en segundo plano.
homebrew.init();
const container = document.getElementById('main');

const router = createRouter({
  container,
  routes: [
    { name: 'home', pattern: /^\/$/, view: (el) => mountLibrary(el, ctx) },
    { name: 'home', pattern: /^\/editar\/([\w-]{1,64})$/, view: (el, [id]) => mountEditor(el, ctx, id) },
    { name: 'home', pattern: /^\/personaje\/([\w-]{1,64})$/, view: (el, [id]) => mountShared(el, ctx, id) },
    { name: 'shop', pattern: /^\/tienda$/, view: (el) => mountShop(el, ctx) },
    { name: 'shop', pattern: /^\/tienda\/([\w-]{1,64})$/, view: (el, [id]) => mountShop(el, ctx, id) },
    { name: 'reference', pattern: /^\/referencia$/, view: (el) => mountReference(el, ctx) },
    { name: 'homebrew', pattern: /^\/homebrew$/, view: (el) => mountHomebrew(el, ctx) },
    { name: 'homebrew', pattern: /^\/homebrew\/([a-z0-9-]{1,40})$/, view: (el, [id]) => mountHomebrew(el, ctx, id) },
    { name: 'homebrew', pattern: /^\/unirse$/, view: (el) => mountJoin(el, ctx) },
    { name: 'about', pattern: /^\/acerca$/, view: (el) => mountAbout(el, ctx) },
  ],
  notFound: (el) => mountNotFound(el, ctx),
  onNavigate(_path, route) {
    for (const link of document.querySelectorAll('[data-nav]')) {
      const active = link.dataset.nav === (route?.name ?? '');
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  },
});

const ctx = { services, navigate: (path, opts) => router.navigate(path, opts) };

window.addEventListener('unhandledrejection', (e) => {
  reportError(e.reason);
});

requestPersistentStorage();
router.start();
if (homebrew.available() && homebrew.memberships().length) {
  homebrew.refreshAll().catch(() => { /* sin conexión: se usa la copia guardada */ });
}
