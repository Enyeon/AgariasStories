// Página «Acerca de». Conserva el easter egg de la «lluvia binaria» del
// proyecto original (mensajes del autor codificados en binario).

import { html, setHtml } from '../ui/dom.js';
import { listClasses, data } from '../data/index.js';

// Mensajes originales (form--flecha.js), como bytes UTF-8 en binario.
const MESSAGES = [
  ['01000101', '01101110', '01111001', '01100101', '01101111', '01101110', '01100011', '01110010', '01100101', '01100001', '01100100', '01101111', '01110010', '01000001', '01100111', '01100001', '01110010', '01101001', '01100001', '01110011'],
  ['01000101', '01101110', '01111001', '01100101', '01101111', '01101110', '01100101', '01110011', '01110100', '01110101', '01110110', '01101111', '01100001', '01110001', '01110101', '11000011', '10101101'],
];

function binaryRain(el) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.replaceChildren();
  for (let i = 0; i < (prefersReduced ? 0 : 60); i++) {
    const col = document.createElement('div');
    col.className = 'binary-rain__col';
    let bits = '';
    if (Math.random() < 0.3) {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      const start = Math.floor(Math.random() * (msg.length - 4));
      msg.slice(start, start + 4).forEach((byte) => { bits += [...byte].join('\n') + '\n'; });
      col.classList.add('is-message');
    } else {
      for (let j = 0; j < 10 + Math.floor(Math.random() * 11); j++) bits += Math.random() < 0.5 ? '0\n' : '1\n';
    }
    col.textContent = bits;
    col.style.left = `${Math.random() * 100}%`;
    col.style.animationDuration = `${8 + Math.random() * 5}s`;
    col.style.animationDelay = `${Math.random() * 6}s`;
    el.append(col);
  }
}

export function mountAbout(container) {
  const page = document.createElement('section');
  page.className = 'page';
  container.append(page);
  setHtml(page, html`
    <div class="prose stack">
      <h1>Stories of Agarias</h1>
      <p>Herramienta para crear y gestionar personajes de <strong>Dungeons &amp; Dragons 5e</strong> con el contenido oficial y el material propio del mundo de Agarias: ${Object.keys(data.races).length} razas, ${listClasses().length} clases (incluidas las de Agarias) y una biblioteca de conjuros.</p>
      <h2>Tus datos</h2>
      <ul>
        <li>Los personajes se guardan automáticamente en este navegador y funcionan sin conexión.</li>
        <li><strong>Exportar</strong> descarga un archivo .json que puedes guardar como copia de seguridad o importar en otro dispositivo.</li>
        <li><strong>Compartir</strong> sube una copia al servidor y genera un enlace de sólo lectura. Sólo el navegador que lo creó puede actualizarlo o eliminarlo.</li>
      </ul>
      <h2>Créditos</h2>
      <p>Creado por Enyeon para la campaña Stories of Agarias. D&amp;D y Dungeons &amp; Dragons son marcas de Wizards of the Coast; este es un proyecto de fans sin ánimo de lucro.</p>
      <div class="binary-rain-box">
        <div class="binary-rain" data-rain aria-hidden="true"></div>
        <button type="button" class="btn btn--ghost btn--sm" data-toggle-rain aria-pressed="false">Activar modo matrix</button>
      </div>
    </div>`);
  const rain = page.querySelector('[data-rain]');
  page.querySelector('[data-toggle-rain]').addEventListener('click', (e) => {
    const on = rain.classList.toggle('is-on');
    if (on && !rain.childElementCount) binaryRain(rain);
    e.currentTarget.textContent = on ? 'Desactivar modo matrix' : 'Activar modo matrix';
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });
  return null;
}
