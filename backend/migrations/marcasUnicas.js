const MARCAS_UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS marca_nombre_normalizado_key
ON Marca (LOWER(TRIM(nombre)));
`;

const normalizarNombreMarca = (nombre) => String(nombre ?? '').trim().toLowerCase();

async function consolidarMarcasDuplicadas(db) {
  const { rows } = await db.query('SELECT idMarcas, nombre FROM Marca ORDER BY idMarcas');
  const grupos = new Map();

  for (const row of rows) {
    if (row.nombre == null) continue;
    const clave = normalizarNombreMarca(row.nombre);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(Number(row.idMarcas));
  }

  let marcasEliminadas = 0;

  for (const ids of grupos.values()) {
    if (ids.length < 2) continue;

    const [keepId, ...duplicateIds] = ids.sort((a, b) => a - b);

    await db.query(
      'UPDATE Modelos SET idMarcas = $1 WHERE idMarcas = ANY($2::int[])',
      [keepId, duplicateIds]
    );
    await db.query(
      'UPDATE Vehiculos SET idMarcas = $1 WHERE idMarcas = ANY($2::int[])',
      [keepId, duplicateIds]
    );
    await db.query(
      'UPDATE Productos_compatibilidad SET idMarcas = $1 WHERE idMarcas = ANY($2::int[])',
      [keepId, duplicateIds]
    );
    await db.query(
      'DELETE FROM Marca WHERE idMarcas = ANY($1::int[])',
      [duplicateIds]
    );

    marcasEliminadas += duplicateIds.length;
  }

  return { marcasEliminadas };
}

async function crearIndiceUnicoMarca(db) {
  await db.query(MARCAS_UNIQUE_INDEX_SQL);
}

async function asegurarMarcasUnicas(db) {
  let client = db;
  let release = null;

  if (typeof db.connect === 'function') {
    client = await db.connect();
    release = () => client.release();
  }

  try {
    if (release) await client.query('BEGIN');
    const resultado = await consolidarMarcasDuplicadas(client);
    await crearIndiceUnicoMarca(client);
    if (release) await client.query('COMMIT');
    return resultado;
  } catch (err) {
    if (release) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (release) release();
  }
}

module.exports = {
  MARCAS_UNIQUE_INDEX_SQL,
  normalizarNombreMarca,
  consolidarMarcasDuplicadas,
  crearIndiceUnicoMarca,
  asegurarMarcasUnicas,
};
