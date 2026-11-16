// Enlaces para apoyar el proyecto (Ko-fi, Cafecito, Patreon, PayPal…).
//
// El Ko-fi del autor viene puesto (DEFAULTS). Los demás (o otro Ko-fi) se
// configuran con variables de entorno (frontend/.env en local y en el panel de
// tu hosting al publicar):
//
//   VITE_KOFI_URL=https://ko-fi.com/tu-usuario
//   VITE_CAFECITO_URL=https://cafecito.app/tu-usuario
//   VITE_PATREON_URL=https://www.patreon.com/tu-usuario
//   VITE_PAYPAL_URL=https://www.paypal.me/tu-usuario
//
// Sólo se aceptan enlaces https de esos sitios (nada de javascript: ni dominios
// raros). Sin ninguno configurado, no aparece nada.
//
// Importante (Política de Contenido de Fans de Wizards of the Coast): la página
// sigue siendo gratuita. Las donaciones son voluntarias y NO desbloquean nada.

// Enlaces del autor que vienen puestos (una variable de entorno con valor los reemplaza).
const DEFAULTS = Object.freeze({
  VITE_KOFI_URL: 'https://ko-fi.com/Y8Y51PN6IF',
});

const fromEnv = import.meta.env ?? {};
const env = { ...DEFAULTS, ...Object.fromEntries(Object.entries(fromEnv).filter(([, v]) => typeof v === 'string' && v.trim())) };

const PLATFORMS = [
  { id: 'kofi', label: 'Ko-fi', icon: '☕', key: 'VITE_KOFI_URL', hosts: ['ko-fi.com', 'www.ko-fi.com'] },
  { id: 'cafecito', label: 'Cafecito', icon: '🧉', key: 'VITE_CAFECITO_URL', hosts: ['cafecito.app', 'www.cafecito.app'] },
  { id: 'patreon', label: 'Patreon', icon: '🎨', key: 'VITE_PATREON_URL', hosts: ['patreon.com', 'www.patreon.com'] },
  { id: 'paypal', label: 'PayPal', icon: '💙', key: 'VITE_PAYPAL_URL', hosts: ['paypal.me', 'www.paypal.me', 'www.paypal.com', 'paypal.com'] },
];

/** URL segura de la plataforma o null. */
export function safeSupportUrl(raw, hosts) {
  try {
    const url = new URL(String(raw ?? '').trim());
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Plataformas configuradas: [{ id, label, icon, url }]. La primera es la principal. */
export function supportLinks(source = env) {
  return PLATFORMS.map((p) => ({ id: p.id, label: p.label, icon: p.icon, url: safeSupportUrl(source[p.key], p.hosts) })).filter((p) => p.url);
}
