/**
 * Utilidades mínimas de DOM para las vistas de la Tienda.
 * Todo el texto entra como textContent (nunca innerHTML con datos): los
 * nombres de objetos Homebrew o personajes no pueden inyectar HTML.
 */

import { formatCp } from '../../domain/money.js';

export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
        else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'text') el.textContent = value;
        else if (value === true) el.setAttribute(key, '');
        else el.setAttribute(key, value);
    }
    append(el, children);
    return el;
}

function append(el, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}

export function replace(el, ...children) {
    el.replaceChildren();
    append(el, children);
    return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    for (const c of children.flat()) if (c) el.append(c);
    return el;
}

/** Precio como monedas: <span class="coins"><span class="coin coin-gp">14</span>…</span> */
export function coins(amount, { size = '' } = {}) {
    const parts = formatCp(amount, { parts: true });
    return h(
        'span',
        { class: ['coins', size && `coins-${size}`], title: formatCp(amount), 'aria-label': formatCp(amount) },
        parts.map((p) => h('span', { class: `coin coin-${p.code}` }, h('b', {}, p.amount.toLocaleString('es-AR')), h('i', { 'aria-hidden': 'true' }, p.short))),
    );
}

export function pct(value) {
    const n = Math.round(value * 100);
    return `${n > 0 ? '+' : ''}${n} %`;
}

/** Sparkline del historial de precios. */
export function sparkline(points, { width = 220, height = 46 } = {}) {
    if (!points || points.length < 2) return h('p', { class: 'muted small' }, 'Aún no hay historial.');
    const values = points.map((p) => p[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 4;
    const x = (i) => pad + (i * (width - pad * 2)) / (points.length - 1);
    const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${d} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
    const last = values.length - 1;
    return svg(
        'svg',
        { viewBox: `0 0 ${width} ${height}`, class: 'sparkline', role: 'img', 'aria-label': 'Evolución del precio en los últimos días' },
        svg('path', { d: area, class: 'spark-area' }),
        svg('path', { d, class: 'spark-line' }),
        svg('circle', { cx: x(last), cy: y(values[last]), r: 3, class: 'spark-dot' }),
    );
}

export function debounce(fn, ms = 150) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
