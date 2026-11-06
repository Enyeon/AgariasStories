// Exportación e importación de personajes como archivos .json.

import { createDocument, LIMITS } from '../domain/schema.js';
import { parseDocument, InvalidDocumentError } from '../domain/validation.js';

export const APP_VERSION = '2.0.0';

/** Nombre de archivo seguro a partir del nombre del personaje. */
export function exportFileName(name) {
  const slug = (name || 'personaje')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'personaje'}.json`;
}

/** Contenido JSON de exportación. */
export function serializeForExport(character) {
  const doc = { ...createDocument(character), exportedAt: new Date().toISOString(), appVersion: APP_VERSION };
  return JSON.stringify(doc, null, 2);
}

export function downloadCharacter(character) {
  const blob = new Blob([serializeForExport(character)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(character.identity.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Lee y valida un archivo de personaje.
 * @returns {Promise<{ character: object, warnings: string[] }>}
 */
export async function readCharacterFile(file) {
  if (!file) throw new InvalidDocumentError('No se seleccionó ningún archivo.');
  if (file.size > LIMITS.importBytes) {
    throw new InvalidDocumentError('El archivo es demasiado grande para ser un personaje (máx. 2 MB).');
  }
  if (file.type && !/json|text/.test(file.type) && !/\.json$/i.test(file.name)) {
    throw new InvalidDocumentError('El archivo debe ser un .json exportado desde la aplicación.');
  }
  return parseCharacterText(await readText(file));
}

function readText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new InvalidDocumentError('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}

export function parseCharacterText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new InvalidDocumentError('El archivo está dañado o no es un JSON válido.', err.message);
  }
  return parseDocument(raw);
}
