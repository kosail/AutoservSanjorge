const test = require('node:test');
const assert = require('node:assert/strict');
const { seedNHTSA } = require('../seedNHTSA');

function normalizar(nombre) {
  return String(nombre ?? '').trim().toLowerCase();
}

function createSeedDb(initialMarcas = []) {
  const state = {
    marcas: [...initialMarcas],
    modelos: [],
    anios: [],
    motores: [],
  };

  const query = async (sql, params = []) => {
    const text = String(sql).trim();

    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(text)) return { rows: [] };

    if (text.includes('SELECT idmarcas FROM marca')) {
      const marca = state.marcas.find((item) => normalizar(item.nombre) === normalizar(params[0]));
      return { rows: marca ? [{ idmarcas: marca.idmarcas }] : [] };
    }

    if (text.includes('INSERT INTO marca')) {
      const existente = state.marcas.find((item) => normalizar(item.nombre) === normalizar(params[0]));
      if (existente) return { rows: [] };
      const idmarcas = state.marcas.length + 1;
      state.marcas.push({ idmarcas, nombre: params[0] });
      return { rows: [{ idmarcas }] };
    }

    if (text.includes('SELECT idmodelos FROM modelos')) {
      const modelo = state.modelos.find(
        (item) => normalizar(item.nombre) === normalizar(params[0]) && item.idmarcas === params[1]
      );
      return { rows: modelo ? [{ idmodelos: modelo.idmodelos }] : [] };
    }

    if (text.includes('INSERT INTO modelos')) {
      state.modelos.push({
        idmodelos: state.modelos.length + 1,
        idmarcas: params[0],
        nombre: params[1],
      });
      return { rows: [] };
    }

    if (text.includes('SELECT idanio FROM anio')) {
      return { rows: state.anios.includes(params[0]) ? [{ idanio: params[0] }] : [] };
    }

    if (text.includes('INSERT INTO anio')) {
      state.anios.push(params[0]);
      return { rows: [] };
    }

    if (text.includes('SELECT idmotores FROM motores')) {
      return { rows: state.motores.includes(params[0]) ? [{ idmotores: params[0] }] : [] };
    }

    if (text.includes('INSERT INTO motores')) {
      state.motores.push(params[0]);
      return { rows: [] };
    }

    throw new Error(`Consulta no soportada por el fake: ${sql}`);
  };

  return { state, db: { query } };
}

function createFetch() {
  return async (url) => {
    if (url.includes('GetMakesForVehicleType')) {
      return { json: async () => ({ Results: [{ MakeName: 'Toyota', MakeId: 1 }] }) };
    }
    if (url.includes('GetModelsForMakeId/1')) {
      return { json: async () => ({ Results: [{ Model_Name: 'Corolla' }] }) };
    }
    throw new Error(`URL no esperada: ${url}`);
  };
}

test('seedNHTSA es idempotente para marcas y modelos', async () => {
  const { state, db } = createSeedDb();
  const fetchImpl = createFetch();

  const primera = await seedNHTSA({ db, fetchImpl });
  const segunda = await seedNHTSA({ db, fetchImpl });

  assert.equal(primera.countMarcas, 1);
  assert.equal(segunda.countMarcas, 0);
  assert.equal(primera.countModelos, 1);
  assert.equal(segunda.countModelos, 0);
  assert.equal(state.marcas.length, 1);
  assert.equal(state.modelos.length, 1);
});

test('seedNHTSA reutiliza una marca existente sin distinguir mayusculas', async () => {
  const { state, db } = createSeedDb([{ idmarcas: 7, nombre: 'toyota' }]);

  const resultado = await seedNHTSA({ db, fetchImpl: createFetch() });

  assert.equal(resultado.countMarcas, 0);
  assert.equal(state.marcas.length, 1);
  assert.equal(state.modelos[0].idmarcas, 7);
});
