const mensajeRefacciones = 'Agrega al menos una refacción con cantidad válida para continuar con el mantenimiento.';

function esRefaccionValida(producto) {
  if (!producto || !/^\d+$/.test(String(producto.cantidad))
      || Number(producto.cantidad) < 1 || Number(producto.cantidad) > 2147483647) {
    return false;
  }
  const id = Number(producto.id);
  return (/^\d+$/.test(String(producto.id)) && id > 0 && id <= 2147483647)
    || (typeof producto.id === 'string' && /^custom_prod_\w+$/.test(producto.id)
      && typeof producto.nombre === 'string' && Boolean(producto.nombre.trim()));
}

function refaccionesEspecialesDeOrden(orden) {
  if (Array.isArray(orden.refacciones_especiales)) return orden.refacciones_especiales;

  // Las órdenes anteriores guardaban las solicitudes especiales en observaciones.
  return [...(orden.observaciones || '').matchAll(/\[Refacci[oó]n Especial: (.*?) x(\d+) \(\$([\d.]+) c\/u\)\]/g)]
    .map(([, nombre, cantidad, precio], index) => ({
      id: `custom_prod_legacy_${index}`, nombre, cantidad: Number(cantidad), precio: Number(precio),
    }))
    .filter(esRefaccionValida);
}

module.exports = { esRefaccionValida, mensajeRefacciones, refaccionesEspecialesDeOrden };
