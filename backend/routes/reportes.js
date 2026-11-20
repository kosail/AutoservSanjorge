const express = require('express');
const router = express.Router();
const pool = require('../db');
const { generarPDF } = require('../exportaciones/pdf');
const { generarExcel } = require('../exportaciones/excel');

async function consultarVentas(fecha = null) {
  // El valor por defecto de Venta.fecha usa la zona configurada en PostgreSQL.
  const zonaAlmacenamiento = "current_setting('TimeZone')";
  const fechaLocal = `(v.fecha AT TIME ZONE ${zonaAlmacenamiento} AT TIME ZONE 'America/Mexico_City')`;
  const { rows } = await pool.query(`
      SELECT 
        v.idVenta as id,
        u.nombre AS cliente,
        COALESCE(STRING_AGG(p.nombre || ' x' || dv.cantidad::text, ', ' ORDER BY p.nombre), anterior.nombre) AS servicio,
        TO_CHAR(${fechaLocal}, 'YYYY-MM-DD') AS fecha_iso,
        TO_CHAR(${fechaLocal}, 'FMDD/FMMM/YYYY') AS fecha,
        v.total,
        v.metodo_pago
      FROM Venta v
      LEFT JOIN Usuarios u ON u.idUsuarios = v.idUsuarios
      LEFT JOIN DetalleVenta dv ON dv.idVenta = v.idVenta
      LEFT JOIN Productos p ON p.idProductos = dv.idProductos
      LEFT JOIN Productos anterior ON anterior.idProductos = v.idProductos
      WHERE $1::date IS NULL OR (
        v.fecha >= ($1::date::timestamp AT TIME ZONE 'America/Mexico_City' AT TIME ZONE ${zonaAlmacenamiento})
        AND v.fecha < (($1::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City' AT TIME ZONE ${zonaAlmacenamiento})
      )
      GROUP BY v.idVenta, u.nombre, v.fecha, v.total, v.metodo_pago, anterior.nombre
      ORDER BY v.fecha DESC, v.idVenta DESC
    `, [fecha]);

  return rows.map(r => ({
    id: `V-${String(r.id).padStart(3, '0')}`,
    cliente: r.cliente || 'Cliente General',
    servicio: r.servicio || 'Venta',
    fecha: r.fecha,
    fechaISO: r.fecha_iso,
    total: Number(r.total) || 0,
    metodo: { 2: 'tarjeta', 3: 'transferencia' }[r.metodo_pago] || 'efectivo',
  }));
}

router.get('/ventas', async (req, res) => {
  try {
    res.json(await consultarVentas());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reporte de ventas' });
  }
});

router.get('/ventas/diarias', async (req, res) => {
  const { fecha, formato = 'json' } = req.query;
  const fechaValida = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    && fecha >= '0001-01-01' && new Date(fecha).toJSON()?.slice(0, 10) === fecha;
  if (!fechaValida) return res.status(400).json({ error: 'Selecciona una fecha válida (AAAA-MM-DD)' });
  if (!['json', 'pdf', 'xlsx'].includes(formato)) {
    return res.status(400).json({ error: 'Formato de reporte inválido' });
  }

  try {
    const ventas = await consultarVentas(fecha);
    const total = ventas.reduce((centavos, venta) => centavos + Math.round(venta.total * 100), 0) / 100;
    const cantidad = ventas.length;
    res.set('Cache-Control', 'private, no-store');
    if (formato === 'json') return res.json({ fecha, cantidad, total, ventas });

    if (formato === 'pdf') {
      const contenido = ventas.flatMap(v => [
        `${v.id} | ${v.cliente} | $${v.total.toFixed(2)} MXN | ${v.metodo}`,
        `Detalle: ${v.servicio}`,
        '',
      ]);
      const archivo = generarPDF('Resumen diario de ventas', fecha, [
        `Ventas registradas: ${cantidad}`,
        `Total: $${total.toFixed(2)} MXN`,
        '',
        ...(cantidad ? contenido : ['No hay ventas registradas para esta fecha.']),
      ]);
      return res.attachment(`ventas-diarias-${fecha}.pdf`).send(archivo);
    }

    const archivo = generarExcel({ fecha, cantidad, total, ventas });
    return res.attachment(`ventas-diarias-${fecha}.xlsx`).send(archivo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar el resumen diario de ventas' });
  }
});

/**
 * GET /api/reportes/productos
 */
router.get('/productos', async (req, res) => {
  try {
    // Top stats
    const valorRes = await pool.query(`SELECT COALESCE(SUM(stock_actual * precio_venta), 0) as total FROM Productos`);
    const vendidosRes = await pool.query(`
      SELECT COUNT(*) as vendidos 
      FROM Venta 
      WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE) 
        AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);
    const ingresosRes = await pool.query(`SELECT COALESCE(SUM(total), 0) as ingresos FROM Venta`);

    // Rendimiento
    const rendRes = await pool.query(`
      SELECT 
        p.idProductos as id, 
        p.nombre, 
        p.stock_actual as stock,
        COALESCE(SUM(v.total), 0) as total_ingresos,
        COUNT(v.idVenta) as ventas
      FROM Productos p
      LEFT JOIN Venta v ON v.idProductos = p.idProductos
      GROUP BY p.idProductos, p.nombre, p.stock_actual
      ORDER BY ventas DESC
    `);

    const maxVentas = Math.max(...rendRes.rows.map(r => Number(r.ventas)), 1);

    const rendimiento = rendRes.rows.map(r => ({
      id: r.id,
      nombre: r.nombre,
      stock: r.stock,
      total: `$${Number(r.total_ingresos).toLocaleString('en-US', {minimumFractionDigits:0})}`,
      ventas: Number(r.ventas),
      progress: `w-[${Math.round((Number(r.ventas) / maxVentas) * 100)}%]` // Tailored inline width isn't always supported by Tailwind JIT unless whitelisted, so we might need inline style, but let's pass a percentage number
    }));

    res.json({
      valorInventario: Number(valorRes.rows[0].total),
      productosVendidosMes: Number(vendidosRes.rows[0].vendidos),
      ingresosTotales: Number(ingresosRes.rows[0].ingresos),
      rendimiento
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reporte de productos' });
  }
});

/**
 * GET /api/reportes/servicios
 */
router.get('/servicios', async (req, res) => {
  try {
    // Top stats
    const countRes = await pool.query(`SELECT COUNT(*) as cantidad FROM DetalleMantenimientoServicios`);
    const ingresosRes = await pool.query(`SELECT COALESCE(SUM(precio), 0) as ingresos FROM DetalleMantenimientoServicios`);
    
    const realizados = Number(countRes.rows[0].cantidad);
    const ingresos = Number(ingresosRes.rows[0].ingresos);
    const ticketPromedio = realizados > 0 ? ingresos / realizados : 0;

    // Distribución
    const distRes = await pool.query(`
      SELECT 
        s.nombre, 
        COUNT(d.idDetalle) as cantidad
      FROM Servicios s
      LEFT JOIN DetalleMantenimientoServicios d ON s.idServicios = d.idServicios
      GROUP BY s.idServicios, s.nombre
      ORDER BY cantidad DESC
    `);

    res.json({
      serviciosRealizados: realizados,
      ingresosPorServicios: ingresos,
      ticketPromedio: ticketPromedio,
      distribucion: distRes.rows.map(r => ({
        nombre: r.nombre,
        cantidad: Number(r.cantidad)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reporte de servicios' });
  }
});

module.exports = router;
