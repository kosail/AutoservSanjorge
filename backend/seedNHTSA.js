require('dotenv').config();
const pool = require('./db');

async function seedNHTSA({ db = pool, fetchImpl = globalThis.fetch } = {}) {
  console.log('Iniciando el proceso de carga de datos desde NHTSA API...');

  const ownsClient = typeof db.connect === 'function';
  const client = ownsClient ? await db.connect() : db;

  try {
    await client.query('BEGIN');

    console.log('Obteniendo marcas de autos (Cars)...');
    const makesResponse = await fetchImpl('https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json');
    const makesData = await makesResponse.json();
    const makes = makesData.Results || [];

    console.log(`Se encontraron ${makes.length} marcas.`);

    let countMarcas = 0;
    let countModelos = 0;

    for (const make of makes) {
      const makeName = String(make.MakeName || '').trim().toUpperCase().substring(0, 45);
      if (!makeName) continue;

      let resMarca = await client.query(
        'SELECT idmarcas FROM marca WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))',
        [makeName]
      );
      let idmarca;

      if (resMarca.rows.length > 0) {
        idmarca = resMarca.rows[0].idmarcas;
      } else {
        const insertMarca = await client.query(
          'INSERT INTO marca (nombre) VALUES ($1) ON CONFLICT DO NOTHING RETURNING idmarcas',
          [makeName]
        );

        if (insertMarca.rows.length > 0) {
          idmarca = insertMarca.rows[0].idmarcas;
          countMarcas++;
        } else {
          resMarca = await client.query(
            'SELECT idmarcas FROM marca WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))',
            [makeName]
          );
          idmarca = resMarca.rows[0]?.idmarcas;
        }
      }

      if (!idmarca) continue;

      console.log(`Procesando marca: ${makeName} (ID: ${idmarca})`);

      const modelsResponse = await fetchImpl(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeId/${make.MakeId}?format=json`);
      const modelsData = await modelsResponse.json();
      const models = modelsData.Results || [];

      for (const model of models) {
        const modelName = String(model.Model_Name || '').trim().toUpperCase().substring(0, 45);
        if (!modelName) continue;

        const resModelo = await client.query(
          'SELECT idmodelos FROM modelos WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) AND idmarcas = $2',
          [modelName, idmarca]
        );

        if (resModelo.rows.length === 0) {
          await client.query('INSERT INTO modelos (idmarcas, nombre) VALUES ($1, $2)', [idmarca, modelName]);
          countModelos++;
        }
      }

      await new Promise(r => setTimeout(r, 100));
    }

    console.log('Cargando años (1990 - 2026)...');
    let countAnios = 0;
    for (let anio = 1990; anio <= 2026; anio++) {
      const resAnio = await client.query('SELECT idanio FROM anio WHERE anio = $1', [anio]);
      if (resAnio.rows.length === 0) {
        await client.query('INSERT INTO anio (anio) VALUES ($1)', [anio]);
        countAnios++;
      }
    }

    console.log('Cargando tipos de motor comunes...');
    const motoresComunes = [
      '1.0L L3', '1.2L L3', '1.4L L4', '1.6L L4', '1.8L L4',
      '2.0L L4', '2.4L L4', '2.5L L4', '3.0L V6', '3.5L V6',
      '4.0L V6', '5.0L V8', '5.7L V8', 'Eléctrico', 'Híbrido'
    ];
    let countMotores = 0;

    for (const motor of motoresComunes) {
      const resMotor = await client.query('SELECT idmotores FROM motores WHERE tipo_motor = $1', [motor]);
      if (resMotor.rows.length === 0) {
        await client.query('INSERT INTO motores (tipo_motor) VALUES ($1)', [motor]);
        countMotores++;
      }
    }

    await client.query('COMMIT');
    console.log('\n--- RESUMEN DE CARGA ---');
    console.log(`Nuevas marcas insertadas: ${countMarcas}`);
    console.log(`Nuevos modelos insertados: ${countModelos}`);
    console.log(`Nuevos años insertados: ${countAnios}`);
    console.log(`Nuevos motores insertados: ${countMotores}`);
    console.log('¡Proceso completado exitosamente!');

    return { countMarcas, countModelos, countAnios, countMotores };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error durante la carga de datos:', error);
    if (require.main !== module) throw error;
  } finally {
    if (ownsClient) client.release();
    if (db === pool && require.main === module) await pool.end();
  }
}

if (require.main === module) {
  seedNHTSA();
}

module.exports = { seedNHTSA };
