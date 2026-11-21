export const MENSAJE_LISTADO_VACIO = 'No hay mantenimientos para exportar con el filtro actual.';

export function nombreArchivoConFecha(base, extension, fecha = new Date()) {
  const nombreBase = String(base || 'archivo').replace(/\.(pdf|xlsx)$/i, '');
  const fechaTexto = fecha.toISOString().slice(0, 10);
  return `${nombreBase}-${fechaTexto}.${extension}`;
}

export function parseFilenameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;

  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].replace(/["']/g, ''));
    } catch {
      return fallback;
    }
  }

  const normal = disposition.match(/filename="?([^";]+)"?/i);
  if (normal?.[1]) {
    return normal[1].trim();
  }

  return fallback;
}

export function listadoTieneDatos(mantenimientos) {
  return Array.isArray(mantenimientos) && mantenimientos.length > 0;
}

export function descargarBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = filename;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
