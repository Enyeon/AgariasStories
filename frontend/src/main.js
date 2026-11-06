import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/sheet.css';

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

const services = { characters: createCharacterService() };
const container = document.getElementById('main');

const router = createRouter({
  container,
  routes: [
    { name: 'home', pattern: /^\/$/, view: (el) => mountLibrary(el, ctx) },
    { name: 'home', pattern: /^\/editar\/([\w-]{1,64})$/, view: (el, [id]) => mountEditor(el, ctx, id) },
    { name: 'home', pattern: /^\/personaje\/([\w-]{1,64})$/, view: (el, [id]) => mountShared(el, ctx, id) },
    { name: 'reference', pattern: /^\/referencia$/, view: (el) => mountReference(el, ctx) },
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
