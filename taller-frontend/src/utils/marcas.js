export const MENSAJE_MARCA_DUPLICADA = 'Ya existe una marca con ese nombre.';

export function normalizarNombreMarca(nombre) {
  return String(nombre ?? '').trim().toLowerCase();
}

export function buscarMarcaDuplicada(marcas, nombre, idExcluir = null) {
  const clave = normalizarNombreMarca(nombre);
  if (!clave) return null;

  return (marcas || []).find((marca) => {
    if (idExcluir != null && String(marca.id) === String(idExcluir)) return false;
    return normalizarNombreMarca(marca.nombre) === clave;
  }) || null;
}

export function mensajeErrorMarca(error) {
  if (error?.status === 409) return MENSAJE_MARCA_DUPLICADA;
  return error?.message || 'No se pudo guardar la marca.';
}
