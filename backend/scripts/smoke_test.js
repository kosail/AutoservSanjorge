require('dotenv').config();

const pool = require('../db');

async function smokeTest({ logger = console } = {}) {
  const conexion = await pool.query('SELECT 1 AS ok');
  if (conexion.rows[0]?.ok !== 1) {
    throw new Error('La consulta de conectividad no devolvió el resultado esperado');
  }

  const { rows: conteos } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM Roles) AS roles,
      (SELECT COUNT(*)::int FROM Usuarios) AS usuarios,
      (SELECT COUNT(*)::int FROM Marca) AS marcas,
      (SELECT COUNT(*)::int FROM Servicios) AS servicios
  `);

  logger.log(
    `[smoke] OK roles=${conteos[0].roles} usuarios=${conteos[0].usuarios} marcas=${conteos[0].marcas} servicios=${conteos[0].servicios}`
  );

  return conteos[0];
}

if (require.main === module) {
  smokeTest()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error) => {
      console.error('[smoke] Error:', error.message);
      await pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { smokeTest };
