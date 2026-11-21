process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
process.env.DB_SSL = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createMantenimientoRouter } = require('../routes/mantenimientoRoutes');
const { createMantenimientoExportController } = require('../controllers/mantenimientoExportController');
const { JWT_SECRET } = require('../middleware/auth');

const mantenimiento = {
  id: 12,
  cliente_nombre: 'Juan Pérez',
  vehiculo: 'Toyota Corolla • ABC123',
  fecha: '2026-11-20',
  tecnico: 'Luis Ramírez',
  estado: 'Completado',
  observaciones: 'Cambio de aceite',
  costo_final: 430,
  servicios: [],
  productos: [],
  checklist: [],
};

const crearToken = (role) => jwt.sign({ id: 1, email: 'admin@admin.com', role }, JWT_SECRET);

const crearExportService = () => ({
  generarPdfMantenimiento: async () => Buffer.from('%PDF-1.4 mantenimiento'),
  generarPdfListado: async () => Buffer.from('%PDF-1.4 listado'),
  generarXlsxMantenimiento: async () => Buffer.from('504b0304', 'hex'),
  generarXlsxListado: async () => Buffer.from('504b0304', 'hex'),
});

async function withServer({ data, exportService = crearExportService() }, callback) {
  const controller = createMantenimientoExportController({ data, exportService });
  const app = express();
  app.use(express.json());
  app.use('/api/mantenimientos', createMantenimientoRouter({ exportController: controller }));

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}/api/mantenimientos`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function authHeaders(role = 'Administrador') {
  return { Authorization: `Bearer ${crearToken(role)}` };
}

test('exporta un mantenimiento individual en PDF con cabeceras correctas', async () => {
  const data = {
    obtenerMantenimientoPorId: async (id) => (id === 12 ? mantenimiento : null),
    obtenerMantenimientos: async () => [mantenimiento],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/12/export?formato=pdf`, {
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/pdf/);
    assert.match(
      response.headers.get('content-disposition'),
      /^attachment; filename="mantenimiento-12-\d{4}-\d{2}-\d{2}\.pdf"$/
    );
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  });
});

test('exporta un mantenimiento individual en XLSX', async () => {
  const data = {
    obtenerMantenimientoPorId: async () => mantenimiento,
    obtenerMantenimientos: async () => [mantenimiento],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/12/export?formato=xlsx`, {
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /spreadsheetml\.sheet/);
    assert.match(
      response.headers.get('content-disposition'),
      /^attachment; filename="mantenimiento-12-\d{4}-\d{2}-\d{2}\.xlsx"$/
    );
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString('hex'), '504b');
  });
});

test('exporta el listado respetando el filtro de estado', async () => {
  let estadoRecibido;
  const data = {
    obtenerMantenimientoPorId: async () => mantenimiento,
    obtenerMantenimientos: async ({ estado }) => {
      estadoRecibido = estado;
      return [mantenimiento];
    },
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/export?formato=xlsx&estado=Completado`, {
      headers: authHeaders(),
    });

    assert.equal(response.status, 200);
    assert.equal(estadoRecibido, 'Completado');
    assert.match(
      response.headers.get('content-disposition'),
      /^attachment; filename="mantenimientos-\d{4}-\d{2}-\d{2}\.xlsx"$/
    );
  });
});

test('responde 400 si el formato es invalido', async () => {
  const data = {
    obtenerMantenimientoPorId: async () => mantenimiento,
    obtenerMantenimientos: async () => [mantenimiento],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/12/export?formato=docx`, {
      headers: authHeaders(),
    });
    assert.equal(response.status, 400);
  });
});

test('responde 404 si el mantenimiento no existe', async () => {
  const data = {
    obtenerMantenimientoPorId: async () => null,
    obtenerMantenimientos: async () => [mantenimiento],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/99/export?formato=pdf`, {
      headers: authHeaders(),
    });
    assert.equal(response.status, 404);
  });
});

test('responde 404 si el listado no tiene datos', async () => {
  const data = {
    obtenerMantenimientoPorId: async () => mantenimiento,
    obtenerMantenimientos: async () => [],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/export?formato=pdf`, {
      headers: authHeaders(),
    });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
  });
});

test('rechaza exportaciones sin token', async () => {
  const data = {
    obtenerMantenimientoPorId: async () => mantenimiento,
    obtenerMantenimientos: async () => [mantenimiento],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/12/export?formato=pdf`);
    assert.equal(response.status, 401);
  });
});

test('rechaza exportaciones de usuarios sin rol Administrador', async () => {
  const data = {
    obtenerMantenimientoPorId: async () => mantenimiento,
    obtenerMantenimientos: async () => [mantenimiento],
  };

  await withServer({ data }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/12/export?formato=pdf`, {
      headers: authHeaders('Cliente'),
    });
    assert.equal(response.status, 403);
  });
});
