const pool = require('../db');
const { esRefaccionValida, mensajeRefacciones, refaccionesEspecialesDeOrden } = require('../mantenimientoRefacciones');
const { generarPDF } = require('../exportaciones/pdf');

const puntosDeInspeccion = {
  aceite: 'Nivel y calidad de aceite de motor',
  frenos: 'Estado de balatas y discos de freno',
  llantas: 'Presión y desgaste de neumáticos',
  bateria: 'Voltaje y limpieza de bornes de batería',
  refrigerante: 'Nivel de anticongelante y fuga de mangueras',
  filtros: 'Filtro de aire y filtro de cabina',
  luces: 'Sistema de luces (Altas, Bajas, Intermitentes, Stop)',
  suspension: 'Amortiguadores y bujes de suspensión',
};

function checklistPredeterminado() {
  return Object.entries(puntosDeInspeccion).map(([id, item]) => ({ id, item, estado: 'Pendiente', nota: '' }));
}

let mantenimientoColumns;
function ensureMantenimientoColumns() {
  if (!mantenimientoColumns) {
    mantenimientoColumns = pool.query('SELECT checklist, refacciones_especiales FROM Mantenimiento LIMIT 0')
      .catch(err => {
        if (err.code !== '42703') throw err;
        return pool.query(`
          ALTER TABLE Mantenimiento
            ADD COLUMN IF NOT EXISTS checklist TEXT,
            ADD COLUMN IF NOT EXISTS refacciones_especiales JSONB
        `);
      }).catch(err => {
        mantenimientoColumns = undefined;
        throw err;
      });
  }
  return mantenimientoColumns;
}

function refaccionesEspeciales(productos) {
  return productos.filter(p => String(p.id).startsWith('custom_prod_')).map(p => ({
    id: p.id,
    nombre: p.nombre.trim(),
    cantidad: Number(p.cantidad),
    precio: Number(p.precio) || 0,
  }));
}

function productosValidos(productos) {
  return Array.isArray(productos) && productos.length > 0 && productos.every(esRefaccionValida);
}

async function consultarMantenimientos(id = null) {
    await ensureMantenimientoColumns();
    const result = await pool.query(`
      SELECT 
        m.idMantenimiento as id,
        m.tecnico,
        m.kilometraje,
        m.estado,
        m.fecha,
        TO_CHAR(m.fecha, 'YYYY-MM-DD') AS fecha_orden,
        m.observaciones,
        m.costo_final,
        m.checklist,
        m.refacciones_especiales,
        v.idVehiculos as vehiculo_id,
        v.placa as vehiculo_placa,
        mo.nombre as vehiculo_modelo,
        ma.nombre as vehiculo_marca,
        u.nombre as cliente_nombre,
        u.email as cliente_email
      FROM Mantenimiento m
      LEFT JOIN Vehiculos v ON m.idVehiculos = v.idVehiculos
      LEFT JOIN Usuarios u ON v.idUsuarios = u.idUsuarios
      LEFT JOIN Modelos mo ON v.idModelos = mo.idModelos
      LEFT JOIN Marca ma ON v.idMarcas = ma.idMarcas
      WHERE ($1::int IS NULL OR m.idMantenimiento = $1)
      ORDER BY m.fecha DESC, m.idMantenimiento DESC
    `, [id]);
    
    return Promise.all(result.rows.map(async (m) => {
      // Fetch servicios
      const servRes = await pool.query(`
        SELECT d.idServicios as id, s.nombre, d.precio, d.descripcion
        FROM DetalleMantenimientoServicios d
        JOIN Servicios s ON d.idServicios = s.idServicios
        WHERE d.idMantenimiento = $1
      `, [m.id]);
      
      // Fetch productos
      const prodRes = await pool.query(`
        SELECT d.idProductos as id, p.nombre, d.cantidad, d.precio
        FROM DetalleMantenimientoProductos d
        JOIN Productos p ON d.idProductos = p.idProductos
        WHERE d.idMantenimiento = $1
      `, [m.id]);

      let parsedChecklist = [];
      if (m.checklist) {
        try {
          parsedChecklist = JSON.parse(m.checklist);
        } catch {
          parsedChecklist = [];
        }
      }

      const { refacciones_especiales, fecha_orden, ...orden } = m;
      return {
        ...orden,
        ...(id && { fecha_orden }),
        vehiculo: [m.vehiculo_marca, m.vehiculo_modelo, m.vehiculo_placa].filter(Boolean).join(' '),
        servicios: servRes.rows,
        productos: [...prodRes.rows, ...refaccionesEspecialesDeOrden({ ...orden, refacciones_especiales })],
        checklist: Array.isArray(parsedChecklist) && parsedChecklist.length ? parsedChecklist : checklistPredeterminado()
      };
    }));
}

const getMantenimientos = async (req, res) => {
  try {
    res.json(await consultarMantenimientos());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const descargarOrdenMantenimiento = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    return res.status(400).json({ error: 'Identificador de mantenimiento inválido' });
  }

  try {
    const [orden] = await consultarMantenimientos(id);
    if (!orden) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    const dinero = (cantidad) => `$${Number(cantidad || 0).toFixed(2)} MXN`;
    const pdf = generarPDF('Hoja de mantenimiento', `Orden #${id}  |  ${orden.fecha_orden || 'Sin fecha'}  |  ${orden.estado}`, [
      `Cliente: ${orden.cliente_nombre || 'Sin registrar'}`,
      `Vehículo: ${orden.vehiculo || 'Sin registrar'}`,
      `Técnico: ${orden.tecnico || 'Sin asignar'}`,
      `Kilometraje: ${orden.kilometraje || 'Sin registrar'}`,
      '',
      'SERVICIOS',
      ...(orden.servicios.length
        ? orden.servicios.map(s => `- ${s.nombre}: ${dinero(s.precio)}${s.descripcion ? ` / ${s.descripcion}` : ''}`)
        : ['Sin servicios registrados.']),
      '',
      'REFACCIONES',
      ...(orden.productos.length
        ? orden.productos.map(p => `- ${p.nombre} x${p.cantidad}: ${dinero(p.precio)} por unidad`)
        : ['Sin refacciones registradas.']),
      '',
      'LISTA DE VERIFICACIÓN',
      ...orden.checklist.map(c => `- ${c.item}: ${c.estado}${c.nota ? ` / ${c.nota}` : ''}`),
      '',
      `Observaciones: ${orden.observaciones || 'Sin observaciones'}`,
      `Total: ${dinero(orden.costo_final)}`,
    ]);
    res.set('Cache-Control', 'private, no-store').attachment(`orden-mantenimiento-${id}.pdf`).send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar la orden de mantenimiento' });
  }
};

const createMantenimiento = async (req, res) => {
  const { idVehiculos, tecnico, kilometraje, estado, fecha, observaciones, costo_final, servicios, productos, checklist } = req.body;
  if (!productosValidos(productos)) return res.status(400).json({ error: mensajeRefacciones });

  let client;
  try {
    await ensureMantenimientoColumns();
    client = await pool.connect();
    await client.query('BEGIN');
    
    const checklistJson = JSON.stringify(checklist ?? checklistPredeterminado());
    
    const mantRes = await client.query(`
      INSERT INTO Mantenimiento (idVehiculos, tecnico, kilometraje, estado, fecha, observaciones, costo_final, checklist, refacciones_especiales)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING idMantenimiento
    `, [idVehiculos, tecnico, kilometraje, estado || 'En proceso', fecha, observaciones || '', costo_final || 0, checklistJson,
      JSON.stringify(refaccionesEspeciales(productos))]);
    
    const idMantenimiento = mantRes.rows[0].idmantenimiento;
    
    let extraObservaciones = [];

    if (servicios && Array.isArray(servicios)) {
      for (const s of servicios) {
        const sIdNum = parseInt(s.id, 10);
        if (!isNaN(sIdNum) && sIdNum > 0) {
          await client.query(`
            INSERT INTO DetalleMantenimientoServicios (idMantenimiento, idServicios, precio, descripcion)
            VALUES ($1, $2, $3, $4)
          `, [idMantenimiento, sIdNum, s.precio || 0, s.descripcion || '']);
        } else if (s.nombre) {
          extraObservaciones.push(`[Servicio Adicional: ${s.nombre} ($${s.precio || 0}) ${s.descripcion ? '- ' + s.descripcion : ''}]`);
        }
      }
    }
    
    await insertarProductos(client, idMantenimiento, productos);

    if (extraObservaciones.length > 0) {
      const obsFinales = (observaciones || '') + ' ' + extraObservaciones.join(' ');
      await client.query(`
        UPDATE Mantenimiento SET observaciones = $1 WHERE idMantenimiento = $2
      `, [obsFinales.trim(), idMantenimiento]);
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, idMantenimiento });
  } catch (err) {
    await client?.query('ROLLBACK');
    res.status(err.code === '23503' ? 400 : 500).json({ error: err.message });
  } finally {
    client?.release();
  }
};

async function insertarProductos(client, id, productos) {
  const catalogo = productos.filter(p => Number.isSafeInteger(Number(p.id)));
  for (const p of catalogo) {
    await client.query(`
      INSERT INTO DetalleMantenimientoProductos (idMantenimiento, idProductos, cantidad, precio)
      VALUES ($1, $2, $3, $4)
    `, [id, Number(p.id), Number(p.cantidad), p.precio || 0]);
    await client.query('UPDATE Productos SET stock_actual = stock_actual - $1 WHERE idProductos = $2',
      [Number(p.cantidad), Number(p.id)]);
  }
}

async function actualizarOrden(req, res, soloEstado) {
  const { id } = req.params;
  const { tecnico, kilometraje, estado, observaciones, costo_final, checklist, servicios, productos } =
    soloEstado ? { estado: req.body.estado } : req.body;

  if (productos !== undefined && !productosValidos(productos)) {
    return res.status(400).json({ error: mensajeRefacciones });
  }

  let client;
  try {
    await ensureMantenimientoColumns();
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: [orden] } = await client.query(
      'SELECT observaciones, refacciones_especiales FROM Mantenimiento WHERE idMantenimiento = $1 FOR UPDATE', [id]
    );
    if (!orden) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    }

    const { rows: anteriores } = await client.query(
      'SELECT idProductos AS id, cantidad FROM DetalleMantenimientoProductos WHERE idMantenimiento = $1', [id]
    );
    const especiales = productos ? refaccionesEspeciales(productos) : refaccionesEspecialesDeOrden(orden);
    if (!productos && ![...anteriores, ...especiales].some(esRefaccionValida)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: mensajeRefacciones });
    }

    const checklistJson = checklist ? JSON.stringify(checklist) : null;

    const { rows: [actualizada] } = await client.query(`
      UPDATE Mantenimiento
      SET tecnico = COALESCE($1, tecnico),
          kilometraje = COALESCE($2, kilometraje),
          estado = COALESCE($3, estado),
          observaciones = COALESCE($4, observaciones),
          costo_final = COALESCE($5, costo_final),
          checklist = COALESCE($6, checklist),
          refacciones_especiales = $7
      WHERE idMantenimiento = $8
      RETURNING *
    `, [tecnico, kilometraje, estado, observaciones, costo_final, checklistJson, JSON.stringify(especiales), id]);

    if (servicios && Array.isArray(servicios)) {
      await client.query(`DELETE FROM DetalleMantenimientoServicios WHERE idMantenimiento = $1`, [id]);
      for (const s of servicios) {
        const sIdNum = parseInt(s.id, 10);
        if (!isNaN(sIdNum) && sIdNum > 0) {
          await client.query(`
            INSERT INTO DetalleMantenimientoServicios (idMantenimiento, idServicios, precio, descripcion)
            VALUES ($1, $2, $3, $4)
          `, [id, sIdNum, s.precio || 0, s.descripcion || '']);
        }
      }
    }

    if (productos) {
      // Revertir stock de productos anteriores
      for (const anterior of anteriores) {
        await client.query('UPDATE Productos SET stock_actual = stock_actual + $1 WHERE idProductos = $2',
          [anterior.cantidad, anterior.id]);
      }

      await client.query(`DELETE FROM DetalleMantenimientoProductos WHERE idMantenimiento = $1`, [id]);
      await insertarProductos(client, id, productos);
    }

    await client.query('COMMIT');
    res.json(soloEstado ? actualizada : { success: true });
  } catch (err) {
    await client?.query('ROLLBACK');
    res.status(err.code === '23503' ? 400 : 500).json({ error: err.message });
  } finally {
    client?.release();
  }
}

module.exports = {
  getMantenimientos,
  descargarOrdenMantenimiento,
  createMantenimiento,
  updateMantenimientoFull: (req, res) => actualizarOrden(req, res, false),
  updateMantenimientoEstado: (req, res) => actualizarOrden(req, res, true)
};
