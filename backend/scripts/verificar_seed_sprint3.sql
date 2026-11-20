-- Consultas de lectura para confirmar la carga de seed_sprint3.sql.
-- Esperado después de la primera carga: 3 ventas de hoy ($1,937.00)
-- y 1 venta de ayer ($371.00), en el horario de Saltillo.
WITH ventas_demo AS (
  SELECT v.idVenta AS folio, v.total,
         (v.fecha AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'America/Mexico_City')::date AS fecha
  FROM Venta v
  JOIN Usuarios u ON u.idUsuarios = v.idUsuarios
  WHERE u.email IN ('sprint3.ana@example.test', 'sprint3.luis@example.test')
    AND EXISTS (
      SELECT 1 FROM DetalleVenta dv
      JOIN Productos p ON p.idProductos = dv.idProductos
      WHERE dv.idVenta = v.idVenta AND p.sku LIKE 'S3-DEMO-%'
    )
)
SELECT fecha, COUNT(*) AS ventas, SUM(total) AS total_mxn,
       STRING_AGG('V-' || LPAD(folio::text, GREATEST(3, LENGTH(folio::text)), '0'), ', ' ORDER BY folio) AS folios
FROM ventas_demo
GROUP BY fecha
ORDER BY fecha DESC;

-- Al inicio hay cuatro órdenes. La placa S3-DEMO-04 tiene cero refacciones.
SELECT m.idMantenimiento AS orden, v.placa, m.estado, m.fecha,
       (SELECT COUNT(*) FROM DetalleMantenimientoProductos p
        WHERE p.idMantenimiento = m.idMantenimiento) AS renglones_de_refacciones,
       m.costo_final AS total_mxn
FROM Mantenimiento m
JOIN Vehiculos v ON v.idVehiculos = m.idVehiculos
WHERE v.placa IN ('S3-DEMO-01', 'S3-DEMO-02', 'S3-DEMO-03', 'S3-DEMO-04')
ORDER BY v.placa, m.idMantenimiento;
