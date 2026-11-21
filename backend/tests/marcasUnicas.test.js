const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MARCAS_UNIQUE_INDEX_SQL,
  asegurarMarcasUnicas,
} = require('../migrations/marcasUnicas');

function createFakeDb(state) {
  const db = {
    state,
    indexCreated: false,
    async query(sql, params = []) {
      if (sql.includes('SELECT idMarcas, nombre FROM Marca')) {
        return { rows: state.marcas.map((marca) => ({ ...marca })) };
      }

      if (sql.includes('UPDATE Modelos')) {
        const [keepId, duplicateIds] = params;
        state.modelos.forEach((modelo) => {
          if (duplicateIds.includes(modelo.idMarcas)) modelo.idMarcas = keepId;
        });
        return { rowCount: state.modelos.length };
      }

      if (sql.includes('UPDATE Vehiculos')) {
        const [keepId, duplicateIds] = params;
        state.vehiculos.forEach((vehiculo) => {
          if (duplicateIds.includes(vehiculo.idMarcas)) vehiculo.idMarcas = keepId;
        });
        return { rowCount: state.vehiculos.length };
      }

      if (sql.includes('UPDATE Productos_compatibilidad')) {
        const [keepId, duplicateIds] = params;
        state.compatibilidades.forEach((compatibilidad) => {
          if (duplicateIds.includes(compatibilidad.idMarcas)) compatibilidad.idMarcas = keepId;
        });
        return { rowCount: state.compatibilidades.length };
      }

      if (sql.includes('DELETE FROM Marca')) {
        const [duplicateIds] = params;
        state.marcas = state.marcas.filter((marca) => !duplicateIds.includes(marca.idMarcas));
        return { rowCount: duplicateIds.length };
      }

      if (sql.includes('CREATE UNIQUE INDEX')) {
        db.indexCreated = true;
        return { rows: [] };
      }

      throw new Error(`Consulta no soportada por el fake: ${sql}`);
    },
  };

  return db;
}

function createState() {
  return {
    marcas: [
      { idMarcas: 1, nombre: 'Toyota' },
      { idMarcas: 2, nombre: 'toyota' },
      { idMarcas: 3, nombre: ' Toyota ' },
      { idMarcas: 4, nombre: 'Ford' },
    ],
    modelos: [
      { idModelos: 10, idMarcas: 1 },
      { idModelos: 11, idMarcas: 2 },
      { idModelos: 12, idMarcas: 3 },
      { idModelos: 13, idMarcas: 4 },
    ],
    vehiculos: [
      { idVehiculos: 20, idMarcas: 2 },
      { idVehiculos: 21, idMarcas: 3 },
      { idVehiculos: 22, idMarcas: 4 },
    ],
    compatibilidades: [
      { id: 30, idMarcas: 2 },
      { id: 31, idMarcas: 3 },
      { id: 32, idMarcas: 4 },
    ],
  };
}

test('consolida marcas duplicadas conservando el menor idMarcas', async () => {
  const state = createState();
  const db = createFakeDb(state);

  const resultado = await asegurarMarcasUnicas(db);

  assert.equal(resultado.marcasEliminadas, 2);
  assert.deepEqual(state.marcas, [
    { idMarcas: 1, nombre: 'Toyota' },
    { idMarcas: 4, nombre: 'Ford' },
  ]);
  assert.equal(db.indexCreated, true);
});

test('reasigna modelos, vehiculos y compatibilidades sin perder registros', async () => {
  const state = createState();
  const db = createFakeDb(state);

  await asegurarMarcasUnicas(db);

  assert.deepEqual(state.modelos.map((m) => m.idMarcas), [1, 1, 1, 4]);
  assert.deepEqual(state.vehiculos.map((v) => v.idMarcas), [1, 1, 4]);
  assert.deepEqual(state.compatibilidades.map((c) => c.idMarcas), [1, 1, 4]);
  assert.equal(state.modelos.length, 4);
  assert.equal(state.vehiculos.length, 3);
  assert.equal(state.compatibilidades.length, 3);

  const marcasIds = new Set(state.marcas.map((m) => m.idMarcas));
  assert.equal(state.modelos.every((m) => marcasIds.has(m.idMarcas)), true);
  assert.equal(state.vehiculos.every((v) => marcasIds.has(v.idMarcas)), true);
  assert.equal(state.compatibilidades.every((c) => marcasIds.has(c.idMarcas)), true);
});

test('es idempotente en una segunda ejecucion', async () => {
  const state = createState();
  const db = createFakeDb(state);

  await asegurarMarcasUnicas(db);
  const resultado = await asegurarMarcasUnicas(db);

  assert.equal(resultado.marcasEliminadas, 0);
  assert.equal(state.marcas.length, 2);
});

test('crea un indice unico sobre LOWER(TRIM(nombre))', () => {
  assert.match(MARCAS_UNIQUE_INDEX_SQL, /LOWER\(TRIM\(nombre\)\)/);
  assert.match(MARCAS_UNIQUE_INDEX_SQL, /marca_nombre_normalizado_key/);
});
