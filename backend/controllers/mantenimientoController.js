const pool = require('../db');
const { obtenerMantenimientos: obtenerMantenimientosData } = require('../services/mantenimientoData');

// Asegurar que la tabla Mantenimiento tenga la columna checklist
const ensureChecklistColumn = async () => {
  try {
    await pool.query(`
      ALTER TABLE Mantenimiento ADD COLUMN IF NOT EXISTS checklist TEXT;
    `);
  } catch (err) {
    console.error('Error verificando columna checklist:', err.message);
  }
};
ensureChecklistColumn();

const getMantenimientos = async (req, res) => {
  try {
    const mantenimientos = await obtenerMantenimientosData();
    res.json(mantenimientos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createMantenimiento = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { idVehiculos, tecnico, kilometraje, estado, fecha, observaciones, costo_final, servicios, productos, checklist } = req.body;
    const checklistJson = checklist ? JSON.stringify(checklist) : null;
    
    const mantRes = await client.query(`
      INSERT INTO Mantenimiento (idVehiculos, tecnico, kilometraje, estado, fecha, observaciones, costo_final, checklist)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING idMantenimiento
    `, [idVehiculos, tecnico, kilometraje, estado || 'En proceso', fecha, observaciones || '', costo_final || 0, checklistJson]);
    
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
    
    if (productos && Array.isArray(productos)) {
      for (const p of productos) {
        const pIdNum = parseInt(p.id, 10);
        if (!isNaN(pIdNum) && pIdNum > 0) {
          await client.query(`
            INSERT INTO DetalleMantenimientoProductos (idMantenimiento, idProductos, cantidad, precio)
            VALUES ($1, $2, $3, $4)
          `, [idMantenimiento, pIdNum, p.cantidad || 1, p.precio || 0]);
          
          // Descontar inventario
          await client.query(`
            UPDATE Productos SET stock_actual = stock_actual - $1 WHERE idProductos = $2
          `, [p.cantidad || 1, pIdNum]);
        } else if (p.nombre) {
          extraObservaciones.push(`[Refacción Especial: ${p.nombre} x${p.cantidad || 1} ($${p.precio || 0} c/u)]`);
        }
      }
    }

    if (extraObservaciones.length > 0) {
      const obsFinales = (observaciones || '') + ' ' + extraObservaciones.join(' ');
      await client.query(`
        UPDATE Mantenimiento SET observaciones = $1 WHERE idMantenimiento = $2
      `, [obsFinales.trim(), idMantenimiento]);
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, idMantenimiento });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

const updateMantenimientoFull = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { tecnico, kilometraje, estado, observaciones, costo_final, checklist, servicios, productos } = req.body;
    
    await client.query('BEGIN');
    
    const checklistJson = checklist ? JSON.stringify(checklist) : null;

    await client.query(`
      UPDATE Mantenimiento
      SET tecnico = COALESCE($1, tecnico),
          kilometraje = COALESCE($2, kilometraje),
          estado = COALESCE($3, estado),
          observaciones = COALESCE($4, observaciones),
          costo_final = COALESCE($5, costo_final),
          checklist = COALESCE($6, checklist)
      WHERE idMantenimiento = $7
    `, [tecnico, kilometraje, estado, observaciones, costo_final, checklistJson, id]);

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

    if (productos && Array.isArray(productos)) {
      // Revertir stock de productos anteriores
      const oldProds = await client.query(`SELECT idProductos, cantidad FROM DetalleMantenimientoProductos WHERE idMantenimiento = $1`, [id]);
      for (const oldP of oldProds.rows) {
        await client.query(`UPDATE Productos SET stock_actual = stock_actual + $1 WHERE idProductos = $2`, [oldP.cantidad, oldP.idproductos]);
      }

      await client.query(`DELETE FROM DetalleMantenimientoProductos WHERE idMantenimiento = $1`, [id]);
      for (const p of productos) {
        const pIdNum = parseInt(p.id, 10);
        if (!isNaN(pIdNum) && pIdNum > 0) {
          await client.query(`
            INSERT INTO DetalleMantenimientoProductos (idMantenimiento, idProductos, cantidad, precio)
            VALUES ($1, $2, $3, $4)
          `, [id, pIdNum, p.cantidad || 1, p.precio || 0]);

          await client.query(`
            UPDATE Productos SET stock_actual = stock_actual - $1 WHERE idProductos = $2
          `, [p.cantidad || 1, pIdNum]);
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

const updateMantenimientoEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const result = await pool.query(
      'UPDATE Mantenimiento SET estado = $1 WHERE idMantenimiento = $2 RETURNING *',
      [estado, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getMantenimientos,
  createMantenimiento,
  updateMantenimientoFull,
  updateMantenimientoEstado
};
