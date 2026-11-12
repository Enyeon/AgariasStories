// Formularios del mundo de la Tienda (sólo el DM): comerciantes, regiones,
// facciones y eventos. Usan el editor genérico (content-editor.js); las
// opciones son funciones para incluir el Homebrew del paquete que se edita.

import { CATEGORIES, RARITIES } from '../../domain/shop/catalog.js';
import { PHASE_OPTIONS, ARCHETYPE_OPTIONS, RACE_FAMILY_OPTIONS, TOPIC_OPTIONS, VOICE_OPTIONS, RUMOR_TOPIC_OPTIONS, ATTITUDE_KINDS } from '../../data/shop/options.js';
import {
  TIER_OPTIONS, SECRET_HOW, CHECK_SKILLS, FAVOR_KINDS, RUMOR_TRUTH, RUMOR_VALUE, ATTITUDE_EFFECTS, CATALOG_MODES, DIALOGUE_KEYS, WEEKDAY_OPTIONS,
} from '../../content/world-schema.js';
import {
  regionOptions, locationOptions, factionOptions, eventOptions, shopOptions, revealOptions, professionOptions, itemOptions, itemOrNone, productOptions, merchantOptions,
} from '../../content/world-options.js';

const CATEGORY_OPTIONS = Object.fromEntries(CATEGORIES.map((c) => [c.id, `${c.icon} ${c.label}`]));
const RARITY_OPTIONS = Object.fromEntries(RARITIES.map((r) => [r.id, r.label]));
const YES_NO = { no: 'No', si: 'Sí' };

const HEAD = [
  { key: 'name', label: 'Nombre *', kind: 'text', required: true },
  { key: 'description', label: 'Descripción', kind: 'textarea', rows: 3 },
];
const SOURCE = { key: 'source', label: 'Fuente o autor (opcional)', kind: 'text' };
const baseField = (options, label) => ({ key: 'base', label, kind: 'select', options, empty: '— Nuevo (no sustituye a nada) —' });

const ATTITUDE_ROWS = (add) => ({
  kind: 'rows', add, fields: [
    { key: 'kind', label: 'Hacia', options: ATTITUDE_KINDS },
    { key: 'target', label: 'Cuál (enano, mago, soldado, mano-gris, legal…)' },
    { key: 'value', label: 'Trato (−60 a 60)', number: true, min: -60, max: 60 },
    { key: 'label', label: 'Cómo se nota', maxlength: 120 },
    { key: 'hidden', label: '¿Oculto?', options: { no: 'Visible', si: 'Oculto (Perspicacia)' } },
    { key: 'effect', label: 'Además…', options: ATTITUDE_EFFECTS },
    { key: 'item', label: 'Objeto que reserva', options: itemOrNone },
  ],
});

const RUMOR_ROWS = {
  kind: 'rows', add: 'Añadir rumor', fields: [
    { key: 'text', label: 'Rumor', long: true },
    { key: 'topic', label: 'Tema', options: RUMOR_TOPIC_OPTIONS },
    { key: 'truth', label: '¿Es verdad? (el jugador no lo ve)', options: RUMOR_TRUTH },
    { key: 'value', label: 'Valor', options: RUMOR_VALUE },
  ],
};

const MODIFIER_ROWS = (add) => ({
  kind: 'rows', add, fields: [
    { key: 'product', label: 'Productos', options: productOptions },
    { key: 'pct', label: 'Precio (%)', number: true, min: -80, max: 300 },
    { key: 'label', label: 'Explicación para el jugador', maxlength: 120 },
  ],
});
const DEMAND_ROWS = (add) => ({
  kind: 'rows', add, fields: [
    { key: 'product', label: 'Productos', options: productOptions },
    { key: 'mult', label: 'Demanda (% más o menos)', number: true, min: -90, max: 400 },
  ],
});

export const WORLD_FORMS = {
  mercader: [
    ...HEAD,
    baseField(merchantOptions, 'Sustituye a un comerciante existente (conserva su relación y memoria con los personajes)'),
    { key: 'title', label: 'Oficio o título', kind: 'text', placeholder: 'Herrero del puerto, tabernera…' },
    { key: 'portrait', label: 'Icono (emoji)', kind: 'text' },
    { key: 'profession', label: 'Profesión (decide catálogo y costumbres)', kind: 'select', options: professionOptions },
    { section: 'Dónde y cuándo' },
    { key: 'location', label: 'Ubicación', kind: 'select', options: locationOptions, empty: '— Elige un lugar (o una ruta) —' },
    { key: 'hours', label: 'Horario (p. ej. 08:00-20:00)', kind: 'text', placeholder: '08:00-20:00' },
    { key: 'phases', label: '…o franjas en las que atiende (vacío = siempre)', kind: 'chips', options: PHASE_OPTIONS },
    { key: 'weekdays', label: 'Días que abre (vacío = todos)', kind: 'chips', options: WEEKDAY_OPTIONS },
    { key: 'events', label: 'Sólo aparece durante estos eventos', kind: 'chips', options: eventOptions },
    { key: 'secret', label: 'Comerciante secreto: sólo lo ve quien lo descubre (por un secreto de otro comerciante o el DM)', kind: 'checkbox' },
    { key: 'route', label: 'Ruta de errante (si la tiene, cambia de lugar solo)', kind: 'rows', add: 'Añadir parada', fields: [
      { key: 'location', label: 'Parada', options: locationOptions },
      { key: 'days', label: 'Días que se queda', number: true, min: 1, max: 30 },
    ] },
    { key: 'gap', label: 'Días de viaje entre paradas', kind: 'number', min: 0, max: 30 },
    { section: 'Quién es' },
    { key: 'race', label: 'Raza', kind: 'select', options: RACE_FAMILY_OPTIONS, empty: '— Sin especificar —' },
    { key: 'faction', label: 'Facción', kind: 'select', options: factionOptions, empty: '— Ninguna —' },
    { key: 'archetypes', label: 'Personalidad (hasta 4)', kind: 'chips', options: ARCHETYPE_OPTIONS, max: 4 },
    { key: 'disposition', label: 'Trato de partida con todo el mundo (−60 hostil … 60 afable)', kind: 'number', min: -60, max: 60 },
    { key: 'voice', label: 'Forma de hablar', kind: 'select', options: VOICE_OPTIONS },
    { key: 'traits.greed', label: 'Codicia (0-10)', kind: 'number', min: 0, max: 10 },
    { key: 'traits.patience', label: 'Paciencia (0-10)', kind: 'number', min: 0, max: 10 },
    { key: 'traits.pride', label: 'Orgullo (0-10)', kind: 'number', min: 0, max: 10 },
    { key: 'traits.warmth', label: 'Calidez (0-10)', kind: 'number', min: 0, max: 10 },
    { key: 'traits.shrewdness', label: 'Astucia (0-10)', kind: 'number', min: 0, max: 10 },
    { key: 'likes', label: 'Temas que le gustan', kind: 'chips', options: TOPIC_OPTIONS },
    { key: 'dislikes', label: 'Temas que le disgustan', kind: 'chips', options: TOPIC_OPTIONS },
    { key: 'gifts', label: 'Regalos que le encantan', kind: 'chips', options: CATEGORY_OPTIONS },
    { key: 'attitudes', label: 'Afinidades y prejuicios (razas, clases, trasfondos, facciones…)', ...ATTITUDE_ROWS('Añadir actitud') },
    { section: 'Facción y reputación' },
    { kind: 'note', text: 'Cómo le afecta la reputación del personaje con SU facción (la ajusta el DM desde la Tienda o con favores).' },
    { key: 'reputation.good', label: 'Aliado a partir de', kind: 'number', min: -100, max: 100 },
    { key: 'reputation.goodPct', label: 'Rebaja a aliados (%)', kind: 'number', min: 0, max: 50 },
    { key: 'reputation.bad', label: 'Desconfía por debajo de', kind: 'number', min: -100, max: 100 },
    { key: 'reputation.badPct', label: 'Recargo por mala reputación (%)', kind: 'number', min: 0, max: 100 },
    { key: 'reputation.enemy', label: 'Enemigo por debajo de', kind: 'number', min: -100, max: 100 },
    { key: 'reputation.refuseEnemies', label: 'Se niega a comerciar con los enemigos de su facción', kind: 'checkbox' },
    { section: 'Negociación y contratación' },
    { key: 'negotiation.enabled', label: 'Acepta regatear', kind: 'checkbox' },
    { key: 'negotiation.maxDiscount', label: 'Rebaja máxima al regatear (%)', kind: 'number', min: 0, max: 50 },
    { key: 'negotiation.patience', label: 'Paciencia (velas; 0 = según su carácter)', kind: 'number', min: 0, max: 10 },
    { key: 'negotiation.reason', label: 'Si no regatea, qué dice', kind: 'text' },
    { key: 'hire.enabled', label: 'Se le puede contratar', kind: 'checkbox' },
    { key: 'hire.minTier', label: 'Relación mínima para contratarle', kind: 'select', options: TIER_OPTIONS },
    { key: 'hire.fee', label: 'Prima de contratación (po)', kind: 'number', min: 0, max: 100000, step: 0.01 },
    { key: 'hire.wage', label: 'Salario diario (po)', kind: 'number', min: 0, max: 1000, step: 0.01 },
    { key: 'hire.mobile', label: 'Acepta trasladarse a otro lugar', kind: 'checkbox' },
    { section: 'Tienda e inventario' },
    { key: 'shopName', label: 'Nombre de la tienda', kind: 'text' },
    { key: 'shopIcon', label: 'Icono de la tienda', kind: 'text' },
    { key: 'catalogMode', label: 'Catálogo', kind: 'select', options: CATALOG_MODES },
    { key: 'sells', label: 'Categorías que vende', kind: 'chips', options: CATEGORY_OPTIONS },
    { key: 'maxRarity', label: 'Rareza máxima de esas categorías', kind: 'select', options: RARITY_OPTIONS },
    { key: 'homebrewItems', label: 'Vende también los objetos Homebrew con precio', kind: 'checkbox' },
    { key: 'addItems', label: 'Objetos concretos que siempre tiene', kind: 'rows', add: 'Añadir objeto', fields: [
      { key: 'item', label: 'Objeto', options: itemOptions },
      { key: 'qty', label: 'Cuántos tiene', number: true, min: 1, max: 50 },
    ] },
    { key: 'removeItems', label: 'Objetos que NO vende nunca', kind: 'rows', add: 'Quitar objeto', fields: [{ key: 'item', label: 'Objeto', options: itemOptions }] },
    { key: 'buys', label: 'Categorías que compra', kind: 'chips', options: CATEGORY_OPTIONS },
    { key: 'priceMod', label: 'Precios de la casa (% sobre lo normal)', kind: 'number', min: -50, max: 100 },
    { key: 'prices', label: 'Precios fijos de objetos concretos', kind: 'rows', add: 'Fijar precio', fields: [
      { key: 'item', label: 'Objeto', options: itemOptions },
      { key: 'price', label: 'Precio base (po)', number: true, min: 0.01, max: 1000000, step: 0.01 },
    ] },
    { key: 'cash', label: 'Caja diaria (po)', kind: 'number', min: 0, max: 100000, step: 0.01 },
    { section: 'Diálogos, rumores y secretos' },
    { key: 'dialogue', label: 'Frases propias', kind: 'rows', add: 'Añadir frase', fields: [
      { key: 'key', label: 'Cuándo', options: DIALOGUE_KEYS },
      { key: 'text', label: 'Qué dice', long: true },
    ] },
    { key: 'knows', label: 'Temas de rumores que conoce', kind: 'chips', options: RUMOR_TOPIC_OPTIONS },
    { key: 'rumors', label: 'Rumores propios', ...RUMOR_ROWS },
    { key: 'secrets', label: 'Secretos', kind: 'rows', add: 'Añadir secreto', fields: [
      { key: 'title', label: 'Título' },
      { key: 'text', label: 'Qué revela', long: true },
      { key: 'how', label: 'Cómo se descubre', options: SECRET_HOW },
      { key: 'tier', label: 'Relación necesaria', options: TIER_OPTIONS },
      { key: 'skill', label: 'Habilidad (si hay que investigar)', options: CHECK_SKILLS },
      { key: 'dc', label: 'CD', number: true, min: 5, max: 30 },
      { key: 'reveals', label: 'Revela un lugar', options: revealOptions },
      { key: 'unlock', label: 'Le reserva un objeto', options: itemOrNone },
    ] },
    { key: 'favors', label: 'Favores que pide', kind: 'rows', add: 'Añadir favor', fields: [
      { key: 'title', label: 'Título' },
      { key: 'text', label: 'Qué pide', long: true },
      { key: 'kind', label: 'Tipo', options: FAVOR_KINDS },
      { key: 'item', label: 'Objeto a traer', options: itemOrNone },
      { key: 'qty', label: 'Cantidad', number: true, min: 1, max: 50 },
      { key: 'minTier', label: 'Relación necesaria', options: TIER_OPTIONS },
      { key: 'days', label: 'Plazo en días (0 = sin plazo)', number: true, min: 0, max: 60 },
      { key: 'rep', label: 'Mejora del trato', number: true, min: 0, max: 50 },
      { key: 'coins', label: 'Recompensa (po)', number: true, min: 0, max: 100000, step: 0.01 },
      { key: 'discount', label: 'Descuento 7 días (%)', number: true, min: 0, max: 50 },
      { key: 'unlock', label: 'Le reserva un objeto', options: itemOrNone },
    ] },
    SOURCE,
  ],

  region: [
    ...HEAD,
    baseField(regionOptions, 'Sustituye a una región existente (conserva sus lugares)'),
    { key: 'icon', label: 'Icono', kind: 'text' },
    { key: 'type', label: 'Tipo de región', kind: 'text', placeholder: 'Minera, agrícola, frontera en guerra, puerto…' },
    { key: 'danger', label: 'Nivel de peligro (0-5)', kind: 'number', min: 0, max: 5 },
    { key: 'factions', label: 'Facciones presentes', kind: 'chips', options: factionOptions },
    { key: 'races', label: 'Razas predominantes (los de fuera se notan)', kind: 'chips', options: RACE_FAMILY_OPTIONS },
    { section: 'Economía' },
    { key: 'resources', label: 'Recursos de la región (más baratos y se reponen antes)', kind: 'chips', options: productOptions },
    { key: 'common', label: 'Productos comunes (algo más baratos, más existencias)', kind: 'chips', options: productOptions },
    { key: 'scarce', label: 'Productos escasos (más caros, pocas existencias, mucha demanda)', kind: 'chips', options: productOptions },
    { key: 'economy', label: 'Reglas económicas especiales', ...MODIFIER_ROWS('Añadir regla') },
    { key: 'demand', label: 'Demanda de la región', ...DEMAND_ROWS('Añadir demanda') },
    { section: 'Lugares y rumores' },
    { key: 'locations', label: 'Lugares (los comerciantes se colocan aquí)', kind: 'rows', add: 'Añadir lugar', fields: [
      { key: 'name', label: 'Nombre' },
      { key: 'icon', label: 'Icono' },
      { key: 'description', label: 'Descripción', long: true },
      { key: 'hidden', label: '¿Oculto hasta descubrirlo?', options: YES_NO },
    ] },
    { key: 'rumors', label: 'Rumores de la región (los cuentan los comerciantes de aquí)', ...RUMOR_ROWS },
    SOURCE,
  ],

  faccion: [
    ...HEAD,
    baseField(factionOptions, 'Sustituye a una facción existente'),
    { key: 'icon', label: 'Icono', kind: 'text' },
    { key: 'ideology', label: 'Ideología', kind: 'textarea', rows: 2 },
    { key: 'regions', label: 'Regiones donde opera', kind: 'chips', options: regionOptions },
    { key: 'allies', label: 'Aliados', kind: 'chips', options: factionOptions },
    { key: 'rivals', label: 'Rivales (sus comerciantes desconfían de quien sea de ellas)', kind: 'chips', options: factionOptions },
    { key: 'goods', label: 'Mercancías propias (especialidad de sus comerciantes; precio de aliado)', kind: 'chips', options: productOptions },
    { key: 'events', label: 'Eventos vinculados', kind: 'chips', options: eventOptions },
    { kind: 'note', text: 'Los comerciantes asociados son los que tienen esta facción. La reputación de cada personaje se ajusta desde la Tienda (🎲 DM).' },
    SOURCE,
  ],

  evento: [
    ...HEAD,
    baseField(eventOptions, 'Sustituye a un evento existente'),
    { key: 'icon', label: 'Icono', kind: 'text' },
    { key: 'notice', label: 'Aviso para los jugadores (tablón de anuncios)', kind: 'textarea', rows: 2 },
    { key: 'durationMin', label: 'Duración mínima (días)', kind: 'number', min: 1, max: 60 },
    { key: 'durationMax', label: 'Duración máxima (días)', kind: 'number', min: 1, max: 60 },
    { key: 'manual', label: 'Sólo lo lanza el DM (no ocurre por azar)', kind: 'checkbox' },
    { key: 'weight', label: 'Probabilidad relativa (0-10)', kind: 'number', min: 0, max: 10 },
    { key: 'cooldown', label: 'Días mínimos entre repeticiones', kind: 'number', min: 0, max: 120 },
    { key: 'regions', label: 'Regiones afectadas (vacío = todas)', kind: 'chips', options: regionOptions },
    { section: 'Efectos' },
    { key: 'modifiers', label: 'Cambios de precio', ...MODIFIER_ROWS('Añadir cambio') },
    { key: 'demand', label: 'Cambios de demanda', ...DEMAND_ROWS('Añadir demanda') },
    { key: 'attitudes', label: 'Cambios de actitud de los comerciantes (de la región)', ...ATTITUDE_ROWS('Añadir actitud') },
    { key: 'closes', label: 'Tiendas que cierran', kind: 'chips', options: shopOptions },
    { key: 'stock', label: 'Mercancía que llega con el evento (a las tiendas de sus regiones)', kind: 'rows', add: 'Añadir mercancía', fields: [
      { key: 'item', label: 'Objeto', options: itemOptions },
      { key: 'qty', label: 'Cantidad', number: true, min: 1, max: 20 },
    ] },
    SOURCE,
  ],
};
