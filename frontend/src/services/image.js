// Retratos: se redimensionan en el navegador antes de guardarlos para que el
// personaje siga siendo pequeño (exportable, compartible y rápido de sincronizar).

const MAX_INPUT_BYTES = 15_000_000;
const MAX_SIDE = 512;
const QUALITY = 0.85;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export class ImageError extends Error {
  constructor(userMessage) {
    super(userMessage);
    this.name = 'ImageError';
    this.userMessage = userMessage;
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ImageError('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

/** Devuelve un data URL JPEG/WebP de como máximo 512 px de lado. */
export async function portraitFromFile(file) {
  if (!file) throw new ImageError('No se seleccionó ninguna imagen.');
  if (!ACCEPTED.includes(file.type)) throw new ImageError('Formato no admitido. Usa PNG, JPG, WebP o GIF.');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('La imagen es demasiado grande (máx. 15 MB).');

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', QUALITY);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALITY);
}
