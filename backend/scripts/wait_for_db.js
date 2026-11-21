require('dotenv').config();

const pool = require('../db');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDb({ intentos = 30, esperaMs = 1000, logger = console } = {}) {
  let ultimoError;

  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      await pool.query('SELECT 1');
      logger.log('[db] Conexión disponible');
      return true;
    } catch (error) {
      ultimoError = error;
      if (intento < intentos) await esperar(esperaMs);
    }
  }

  throw new Error(`No fue posible conectar a la base de datos: ${ultimoError?.message || 'error desconocido'}`);
}

if (require.main === module) {
  waitForDb()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error) => {
      console.error('[db] Error:', error.message);
      await pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { waitForDb };
