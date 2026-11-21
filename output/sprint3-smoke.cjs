const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const routes = {};
const history = [];
let order = { observaciones: '[Refacción Especial: Bujías x2 ($13.5 c/u)]', refacciones_especiales: null };
let stock = [];
let dateFilter;
const client = {
  query: async (sql, params) => {
    history.push({ sql, params });
    if (/FOR UPDATE/.test(sql)) return { rows: order ? [order] : [] };
    if (/SELECT idProductos AS id/.test(sql)) return { rows: stock };
    if (/RETURNING idMantenimiento/.test(sql)) return { rows: [{ idmantenimiento: 42 }] };
    if (/RETURNING \*/.test(sql)) return { rows: [{ idmantenimiento: 42, estado: params[2] }] };
    return { rows: [] };
  },
  release() {},
};
const pool = {
  connect: async () => client,
  query: async (sql, params) => {
    if (/FROM Venta v/.test(sql)) {
      fs.writeFileSync(path.join(__dirname, 'sprint3-ventas-query.sql'), sql.trim().replace(/\s+/g, ' '));
      dateFilter = params[0];
      return { rows: dateFilter === '2026-11-20' ? [] : [
        { id: 7, cliente: 'García & Hijos', servicio: 'Bujía x1', fecha: '19/11/2026', fecha_iso: '2026-11-19', total: '42.75', metodo_pago: 2 },
      ] };
    }
    if (/FROM Mantenimiento m/.test(sql)) return { rows: order ? [{ ...order, id: 42, cliente_nombre: 'García', fecha_orden: '2026-11-19', checklist: '[{"item":"Bujías","estado":"OK"}]' }] : [] };
    if (/DetalleMantenimientoProductos d/.test(sql)) return { rows: stock };
    return { rows: [] };
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  if (request === '../db') return pool;
  if (request === 'express') return { Router: () => ({ get: (route, handler) => routes[route] = handler }) };
  return originalLoad.call(this, request, parent, ...args);
};
const base = path.join(__dirname, 'AutoservSanjorge-sprint3', 'backend');
require(path.join(base, 'routes/reportes.js'));
const mantenimiento = require(path.join(base, 'controllers/mantenimientoController.js'));
function response() {
  return {
    code: 200,
    status(n) { this.code = n; return this; },
    json(data) { this.body = data; return this; },
    set() { return this; },
    attachment(name) { this.name = name; return this; },
    send(data) { this.body = data; return this; },
  };
}
async function call(handler, data) {
  const res = response();
  await handler(data, res);
  return res;
}
function verifyPdf(pdf) {
  const source = pdf.toString('latin1');
  assert.match(source, /^%PDF-1.4/);
  assert.match(source, /\/Subtype \/Image/);
  const offset = Number(source.match(/startxref\n(\d+)/)[1]);
  assert.equal(source.slice(offset, offset + 4), 'xref');
  const entries = source.slice(offset).split('\n').slice(3);
  for (let idx = 0; entries[idx]?.endsWith('n '); idx++) {
    const pos = Number(entries[idx].slice(0, 10));
    assert.ok(source.slice(pos).startsWith(Number(idx + 1) + ' 0 obj\n'));
  }
}
(async () => {
  const params = { id: '42' };
  const a = await call(mantenimiento.createMantenimiento, { body: { productos: [] } });
  assert.equal(a.code, 400);
  const b = await call(mantenimiento.createMantenimiento, { body: { productos: [{ id: 3, cantidad: -1 }] } });
  assert.equal(b.code, 400);
  const c = await call(mantenimiento.createMantenimiento, { body: { productos: [{ id: 3, cantidad: 2 }] } });
  assert.equal(c.code, 201);
  assert.ok(history.some(q => q.sql.includes('stock_actual - $1') && q.params[0] === 2));
  const d = await call(mantenimiento.updateMantenimientoEstado, { params, body: { estado: 'Completado' } });
  assert.equal(d.code, 200);
  assert.ok(history.findLast(q => q.sql.includes('RETURNING *')).params[6].includes('Bujías'));
  order = { observaciones: '', refacciones_especiales: [], estado: 'En proceso' };
  const e = await call(mantenimiento.updateMantenimientoEstado, { params, body: { estado: 'Completado' } });
  assert.equal(e.code, 400);
  const f = await call(mantenimiento.updateMantenimientoFull, { params, body: { estado: 'Completado', productos: [{ id: 'custom_prod_3', nombre: 'Bujías', cantidad: 2, precio: 30 }] } });
  assert.equal(f.code, 200);
  assert.ok(history.findLast(q => q.sql.includes('RETURNING *')).params[6].includes('Bujías'));
  const g = await call(mantenimiento.descargarOrdenMantenimiento, { params });
  assert.equal(g.code, 409);
  order.estado = 'Completado';
  const h = await call(mantenimiento.descargarOrdenMantenimiento, { params });
  assert.equal(h.name, 'orden-mantenimiento-42.pdf');
  verifyPdf(h.body);

  const diario = routes['/ventas/diarias'];
  assert.equal((await call(diario, { query: { fecha: '2026-02-30' } })).code, 400);
  assert.equal((await call(diario, { query: { fecha: '2026-11-19', formato: 'csv' } })).code, 400);
  const dia = await call(diario, { query: { fecha: '2026-11-19' } });
  assert.equal(dateFilter, '2026-11-19');
  assert.equal(dia.body.cantidad, 1);
  assert.equal(dia.body.total, 42.75);
  assert.equal((await call(diario, { query: { fecha: '2026-11-20' } })).body.cantidad, 0);
  const pdf = await call(diario, { query: { fecha: '2026-11-19', formato: 'pdf' } });
  verifyPdf(pdf.body);
  const xlsx = await call(diario, { query: { fecha: '2026-11-19', formato: 'xlsx' } });
  assert.equal(xlsx.name, 'ventas-diarias-2026-11-19.xlsx');
  fs.writeFileSync(path.join(__dirname, 'sprint3-prueba.xlsx'), xlsx.body);
  console.log('Validación de refacciones, cierre, API diaria y exportaciones PDF/Excel correcta.');
})().catch(err => { console.error(err); process.exitCode = 1; });
