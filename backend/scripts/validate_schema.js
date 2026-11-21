require('dotenv').config();

const pool = require('../db');

const TABLAS_REQUERIDAS = [
  'roles',
  'usuarios',
  'marca',
  'modelos',
  'motores',
  'modelos_has_motores',
  'anio',
  'vehiculos',
  'productos',
  'servicios',
  'productos_has_servicios',
  'proveedor',
  'compra',
  'detallecompra',
  'cotizacion',
  'venta',
  'detalleventa',
  'productos_compatibilidad',
  'factura',
  'mantenimiento',
  'detallemantenimientoservicios',
  'detallemantenimientoproductos',
  'cita',
  'schema_migrations',
];

const COLUMNAS_REQUERIDAS = {
  usuarios: ['idusuarios', 'idroles', 'email', 'contrasena', 'nombre', 'telefono'],
  marca: ['idmarcas', 'nombre'],
  productos_has_servicios: ['idproductos', 'idservicios', 'cantidad'],
  servicios: ['idservicios', 'nombre', 'mano_obra', 'refacciones_estimadas'],
  mantenimiento: ['idmantenimiento', 'idvehiculos', 'tecnico', 'estado', 'fecha', 'costo_final'],
  detallemantenimientoproductos: ['iddetalle', 'idmantenimiento', 'idproductos', 'cantidad', 'precio'],
  schema_migrations: ['id', 'applied_at'],
};

const MIGRACIONES_REQUERIDAS = ['001_marcas_unicas'];

async function validateSchema({ logger = console } = {}) {
  const errores = [];

  const tablasRes = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const tablas = new Set(tablasRes.rows.map((row) => row.table_name.toLowerCase()));

  for (const tabla of TABLAS_REQUERIDAS) {
    if (!tablas.has(tabla)) errores.push(`Falta la tabla: ${tabla}`);
  }

  for (const [tabla, columnas] of Object.entries(COLUMNAS_REQUERIDAS)) {
    if (!tablas.has(tabla)) continue;

    const columnasRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [tabla]);
    const existentes = new Set(columnasRes.rows.map((row) => row.column_name.toLowerCase()));

    for (const columna of columnas) {
      if (!existentes.has(columna)) errores.push(`Falta la columna: ${tabla}.${columna}`);
    }
  }

  const indiceRes = await pool.query(`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'marca_nombre_normalizado_key'
  `);

  if (indiceRes.rows.length === 0) {
    errores.push('Falta el índice único: marca_nombre_normalizado_key');
  } else {
    const definicion = indiceRes.rows[0].indexdef;
    if (!/lower\(/i.test(definicion) || !/trim\(/i.test(definicion)) {
      errores.push('El índice de marcas no usa LOWER(TRIM(nombre))');
    }
  }

  if (tablas.has('schema_migrations')) {
    const migracionesRes = await pool.query('SELECT id FROM schema_migrations');
    const aplicadas = new Set(migracionesRes.rows.map((row) => row.id));

    for (const migracion of MIGRACIONES_REQUERIDAS) {
      if (!aplicadas.has(migracion)) errores.push(`Migración no registrada: ${migracion}`);
    }
  }

  if (errores.length > 0) {
    logger.error('[esquema] Validación fallida:');
    errores.forEach((error) => logger.error(`  - ${error}`));
    const error = new Error(`Esquema inválido (${errores.length} problemas)`);
    error.detalles = errores;
    throw error;
  }

  logger.log('[esquema] Validación correcta');
  return true;
}

if (require.main === module) {
  validateSchema()
    .then(async () => {
      await pool.end();
    })
    .catch(async () => {
      await pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = {
  TABLAS_REQUERIDAS,
  COLUMNAS_REQUERIDAS,
  MIGRACIONES_REQUERIDAS,
  validateSchema,
};
