const pool = require('../db');
const { refaccionesEspecialesDeOrden } = require('../mantenimientoRefacciones');

const SELECT_MANTENIMIENTOS = `
  SELECT
    m.idMantenimiento as id,
    m.tecnico,
    m.kilometraje,
    m.estado,
    m.fecha,
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
`;

const CHECKLIST_PREDETERMINADO = [
  ['aceite', 'Nivel y calidad de aceite de motor'],
  ['frenos', 'Estado de balatas y discos de freno'],
  ['llantas', 'Presión y desgaste de neumáticos'],
  ['bateria', 'Voltaje y limpieza de bornes de batería'],
  ['refrigerante', 'Nivel de anticongelante y fuga de mangueras'],
  ['filtros', 'Filtro de aire y filtro de cabina'],
  ['luces', 'Sistema de luces (Altas, Bajas, Intermitentes, Stop)'],
  ['suspension', 'Amortiguadores y bujes de suspensión'],
].map(([id, item]) => ({ id, item, estado: 'Pendiente', nota: '' }));

const parseChecklist = (checklist) => {
  if (!checklist) return [];
  if (Array.isArray(checklist)) return checklist;
  try {
    const parsed = JSON.parse(checklist);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseRefaccionesEspeciales = (refacciones) => {
  if (!refacciones) return [];
  if (Array.isArray(refacciones)) return refacciones;
  try {
    const parsed = JSON.parse(refacciones);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const cargarDetalle = async (row, db) => {
  const [servicios, productos] = await Promise.all([
    db.query(`
      SELECT d.idServicios as id, s.nombre, d.precio, d.descripcion
      FROM DetalleMantenimientoServicios d
      JOIN Servicios s ON d.idServicios = s.idServicios
      WHERE d.idMantenimiento = $1
    `, [row.id]),
    db.query(`
      SELECT d.idProductos as id, p.nombre, d.cantidad, d.precio
      FROM DetalleMantenimientoProductos d
      JOIN Productos p ON d.idProductos = p.idProductos
      WHERE d.idMantenimiento = $1
    `, [row.id])
  ]);

  const checklist = parseChecklist(row.checklist);
  const especiales = refaccionesEspecialesDeOrden({
    ...row,
    refacciones_especiales: parseRefaccionesEspeciales(row.refacciones_especiales),
  });

  return {
    ...row,
    vehiculo: [row.vehiculo_marca, row.vehiculo_modelo, row.vehiculo_placa].filter(Boolean).join(' '),
    servicios: servicios.rows,
    productos: [...productos.rows, ...especiales],
    checklist: checklist.length > 0 ? checklist : CHECKLIST_PREDETERMINADO,
  };
};

const obtenerMantenimientos = async ({ estado, db = pool } = {}) => {
  const params = [];
  let query = SELECT_MANTENIMIENTOS;

  if (estado) {
    params.push(estado);
    query += ` WHERE m.estado = $${params.length}`;
  }

  query += ' ORDER BY m.fecha DESC, m.idMantenimiento DESC';

  const result = await db.query(query, params);
  return Promise.all(result.rows.map((row) => cargarDetalle(row, db)));
};

const obtenerMantenimientoPorId = async (id, { db = pool } = {}) => {
  const result = await db.query(
    `${SELECT_MANTENIMIENTOS} WHERE m.idMantenimiento = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;
  return cargarDetalle(result.rows[0], db);
};

module.exports = {
  SELECT_MANTENIMIENTOS,
  parseChecklist,
  obtenerMantenimientos,
  obtenerMantenimientoPorId,
};
