const express = require('express');
const pool = require('../db');

const MARCA_DUPLICADA_ERROR = 'Ya existe una marca con ese nombre.';

function createCatalogoRouter(db = pool) {
  const router = express.Router();

  const esConflictoUnico = (err) => err?.code === '23505';

  router.get('/marcas', async (req, res) => {
    try {
      const { rows } = await db.query('SELECT idMarcas AS id, nombre FROM Marca ORDER BY nombre');
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/marcas', async (req, res) => {
    const nombre = String(req.body?.nombre ?? '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    try {
      const { rows } = await db.query(
        'INSERT INTO Marca (nombre) VALUES ($1) RETURNING idMarcas AS id, nombre',
        [nombre]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (esConflictoUnico(err)) return res.status(409).json({ error: MARCA_DUPLICADA_ERROR });
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/marcas/:id', async (req, res) => {
    const id = Number(req.params.id);
    const nombre = String(req.body?.nombre ?? '').trim();
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    try {
      const { rows } = await db.query(
        'UPDATE Marca SET nombre = $1 WHERE idMarcas = $2 RETURNING idMarcas AS id, nombre',
        [nombre, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
      res.json(rows[0]);
    } catch (err) {
      if (esConflictoUnico(err)) return res.status(409).json({ error: MARCA_DUPLICADA_ERROR });
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/marcas/:id', async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const id = req.params.id;
      await client.query('UPDATE Vehiculos SET idMarcas = NULL WHERE idMarcas = $1', [id]);
      await client.query('UPDATE Modelos SET idMarcas = NULL WHERE idMarcas = $1', [id]);
      await client.query('DELETE FROM Marca WHERE idMarcas = $1', [id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  router.get('/modelos', async (req, res) => {
    try {
      const { rows } = await db.query(`
        SELECT mo.idModelos AS id, mo.nombre, mo.idMarcas, ma.nombre AS marca
        FROM Modelos mo
        LEFT JOIN Marca ma ON ma.idMarcas = mo.idMarcas
        ORDER BY ma.nombre, mo.nombre
      `);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/modelos/marca/:idMarcas', async (req, res) => {
    const idMarcas = Number(req.params.idMarcas);
    if (isNaN(idMarcas)) return res.status(400).json({ error: 'idMarcas inválido' });
    try {
      const { rows } = await db.query(`
        SELECT mo.idModelos AS id, mo.nombre, mo.idMarcas, ma.nombre AS marca
        FROM Modelos mo
        LEFT JOIN Marca ma ON ma.idMarcas = mo.idMarcas
        WHERE mo.idMarcas = $1
        ORDER BY mo.nombre
      `, [idMarcas]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/modelos', async (req, res) => {
    const { nombre, idMarcas } = req.body;
    if (!nombre?.trim() || !idMarcas) return res.status(400).json({ error: 'Nombre y marca son requeridos' });
    try {
      const { rows } = await db.query(
        'INSERT INTO Modelos (nombre, idMarcas) VALUES ($1, $2) RETURNING idModelos AS id, nombre, idMarcas',
        [nombre.trim(), idMarcas]
      );
      res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/modelos/:id', async (req, res) => {
    const { nombre, idMarcas } = req.body;
    if (!nombre?.trim() || !idMarcas) return res.status(400).json({ error: 'Nombre y marca son requeridos' });
    try {
      const { rows } = await db.query(
        'UPDATE Modelos SET nombre = $1, idMarcas = $2 WHERE idModelos = $3 RETURNING idModelos AS id, nombre, idMarcas',
        [nombre.trim(), idMarcas, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/modelos/:id', async (req, res) => {
    try {
      await db.query('UPDATE Vehiculos SET idModelos = NULL WHERE idModelos = $1', [req.params.id]);
      await db.query('DELETE FROM Modelos WHERE idModelos = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/motores', async (req, res) => {
    try {
      const { rows } = await db.query('SELECT idMotores AS id, tipo_motor AS nombre FROM Motores ORDER BY tipo_motor');
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/motores', async (req, res) => {
    const { tipo_motor } = req.body;
    if (!tipo_motor?.trim()) return res.status(400).json({ error: 'El tipo de motor es requerido' });
    try {
      const { rows } = await db.query(
        'INSERT INTO Motores (tipo_motor) VALUES ($1) RETURNING idMotores AS id, tipo_motor AS nombre',
        [tipo_motor.trim()]
      );
      res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/motores/:id', async (req, res) => {
    const { tipo_motor } = req.body;
    if (!tipo_motor?.trim()) return res.status(400).json({ error: 'El tipo de motor es requerido' });
    try {
      const { rows } = await db.query(
        'UPDATE Motores SET tipo_motor = $1 WHERE idMotores = $2 RETURNING idMotores AS id, tipo_motor AS nombre',
        [tipo_motor.trim(), req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/motores/:id', async (req, res) => {
    try {
      await db.query('UPDATE Vehiculos SET idMotores = NULL WHERE idMotores = $1', [req.params.id]);
      await db.query('DELETE FROM Motores WHERE idMotores = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/anios', async (req, res) => {
    try {
      const { rows } = await db.query('SELECT idAnio AS id, anio FROM Anio ORDER BY anio DESC');
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/anios', async (req, res) => {
    const { anio } = req.body;
    if (!anio || isNaN(anio)) return res.status(400).json({ error: 'El año debe ser un número válido' });
    try {
      const { rows } = await db.query(
        'INSERT INTO Anio (anio) VALUES ($1) RETURNING idAnio AS id, anio',
        [Number(anio)]
      );
      res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/anios/:id', async (req, res) => {
    const { anio } = req.body;
    if (!anio || isNaN(anio)) return res.status(400).json({ error: 'El año debe ser un número válido' });
    try {
      const { rows } = await db.query(
        'UPDATE Anio SET anio = $1 WHERE idAnio = $2 RETURNING idAnio AS id, anio',
        [Number(anio), req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/anios/:id', async (req, res) => {
    try {
      await db.query('UPDATE Vehiculos SET idAnio = NULL WHERE idAnio = $1', [req.params.id]);
      await db.query('DELETE FROM Anio WHERE idAnio = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

const router = createCatalogoRouter();

module.exports = router;
module.exports.createCatalogoRouter = createCatalogoRouter;
module.exports.MARCA_DUPLICADA_ERROR = MARCA_DUPLICADA_ERROR;
