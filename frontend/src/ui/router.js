// Router mínimo basado en la History API.
// Cada vista exporta mount(container, params) y puede devolver
// { unmount?, beforeLeave? } — beforeLeave() puede devolver false para cancelar.

export function createRouter({ routes, container, notFound, onNavigate }) {
  let current = null;
  let navigating = Promise.resolve();

  function match(pathname) {
    for (const route of routes) {
      const m = route.pattern.exec(pathname);
      if (m) return { route, params: m.slice(1).map(decodeURIComponent) };
    }
    return null;
  }

  async function render(pathname) {
    if (current?.beforeLeave && (await current.beforeLeave()) === false) return false;
    try { current?.unmount?.(); } catch (err) { console.error('[router] unmount', err); }
    current = null;
    container.replaceChildren();
    container.removeAttribute('aria-busy');
    const found = match(pathname);
    const view = found ? found.route.view : notFound;
    onNavigate?.(pathname, found?.route);
    try {
      current = (await view(container, found?.params ?? [])) ?? null;
    } catch (err) {
      console.error('[router] Error al montar la vista', err);
      container.innerHTML = '<section class="page"><div class="empty-state"><h1>Algo salió mal</h1><p>No se pudo mostrar esta página. Recarga e inténtalo de nuevo.</p><a class="btn btn--primary" href="/" data-link>Volver al inicio</a></div></section>';
    }
    window.scrollTo(0, 0);
    container.focus({ preventScroll: true });
    return true;
  }

  function navigate(path, { replace = false } = {}) {
    navigating = navigating.then(async () => {
      const ok = await render(new URL(path, location.origin).pathname);
      if (ok) {
        if (replace) history.replaceState({}, '', path);
        else if (location.pathname + location.search !== path) history.pushState({}, '', path);
      }
    });
    return navigating;
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });

  let lastPath = location.pathname;
  window.addEventListener('popstate', async () => {
    const target = location.pathname;
    const ok = await render(target);
    if (!ok) history.pushState({}, '', lastPath); // navegación cancelada
    else lastPath = target;
  });

  return {
    navigate: async (path, opts) => { await navigate(path, opts); lastPath = location.pathname; },
    start: () => render(location.pathname),
  };
}
