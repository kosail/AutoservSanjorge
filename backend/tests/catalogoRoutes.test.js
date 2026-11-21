const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  createCatalogoRouter,
  MARCA_DUPLICADA_ERROR,
} = require('../routes/catalogoRoutes');

async function withServer(db, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/catalogo', createCatalogoRouter(db));

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}/api/catalogo`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function createPool(query) {
  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

function jsonRequest(url, method, body) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /marcas responde 409 cuando el backend detecta duplicado', async () => {
  const pool = createPool(async () => {
    const error = new Error('duplicate key');
    error.code = '23505';
    throw error;
  });

  await withServer(pool, async (baseUrl) => {
    const response = await jsonRequest(`${baseUrl}/marcas`, 'POST', { nombre: 'toyota' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: MARCA_DUPLICADA_ERROR });
  });
});

test('POST /marcas envia el nombre sin espacios exteriores', async () => {
  let receivedParams;
  const pool = createPool(async (sql, params) => {
    receivedParams = params;
    return { rows: [{ id: 1, nombre: params[0] }] };
  });

  await withServer(pool, async (baseUrl) => {
    const response = await jsonRequest(`${baseUrl}/marcas`, 'POST', { nombre: ' Toyota ' });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedParams, ['Toyota']);
    assert.deepEqual(await response.json(), { id: 1, nombre: 'Toyota' });
  });
});

test('PUT /marcas/:id permite guardar la misma marca editada', async () => {
  const pool = createPool(async (sql, params) => ({
    rows: [{ id: Number(params[1]), nombre: params[0] }],
  }));

  await withServer(pool, async (baseUrl) => {
    const response = await jsonRequest(`${baseUrl}/marcas/1`, 'PUT', { nombre: 'Toyota' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 1, nombre: 'Toyota' });
  });
});

test('PUT /marcas/:id responde 409 al editar hacia un nombre existente', async () => {
  const pool = createPool(async () => {
    const error = new Error('duplicate key');
    error.code = '23505';
    throw error;
  });

  await withServer(pool, async (baseUrl) => {
    const response = await jsonRequest(`${baseUrl}/marcas/2`, 'PUT', { nombre: 'Toyota' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: MARCA_DUPLICADA_ERROR });
  });
});

test('POST /marcas rechaza nombres vacios sin consultar la base', async () => {
  let called = false;
  const pool = createPool(async () => {
    called = true;
    return { rows: [] };
  });

  await withServer(pool, async (baseUrl) => {
    const response = await jsonRequest(`${baseUrl}/marcas`, 'POST', { nombre: '   ' });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  });
});

test('PUT /marcas/:id valida el identificador', async () => {
  const pool = createPool(async () => ({ rows: [] }));

  await withServer(pool, async (baseUrl) => {
    const response = await jsonRequest(`${baseUrl}/marcas/abc`, 'PUT', { nombre: 'Toyota' });
    assert.equal(response.status, 400);
  });
});
