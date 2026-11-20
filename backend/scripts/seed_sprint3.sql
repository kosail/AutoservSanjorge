-- Datos ficticios de Sprint 3. Ejecutar en la base PostgreSQL local de pruebas.
-- Requiere el esquema backend/supabase_schema.sql y sus roles base.
-- Se puede repetir. Las ventas de hoy y ayer se completan si todavía faltan.
BEGIN;

DO $seed$
DECLARE
  hoy date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date;
  zona_bd text := current_setting('TimeZone');
  clave_demo constant text := '$2a$10$TFEFT.ndigfMVKdPVqFzD.tm4GW6ii7TW1s4eguGfIo8f96ngaI/a';
  cliente_a integer;
  cliente_b integer;
  id_marca integer;
  id_modelo integer;
  id_motor integer;
  id_anio integer;
  id_vehiculo integer;
  id_aceite integer;
  id_filtro integer;
  id_balatas integer;
  id_servicio integer;
  id_orden integer;
  id_venta integer;
  fecha_venta timestamp;
  total_venta numeric(10,2);
  caso record;
BEGIN
  PERFORM pg_advisory_xact_lock(31270, 3);

  INSERT INTO Usuarios (idRoles, email, contrasena, nombre, telefono)
  SELECT r.idRoles, u.email, clave_demo, u.nombre, u.telefono
  FROM (VALUES
    ('Cliente', 'sprint3.ana@example.test', 'Ana Torres Demo', '8440000101'),
    ('Cliente', 'sprint3.luis@example.test', 'Luis Rivera Demo', '8440000102'),
    ('Técnico', 'sprint3.tecnico@example.test', 'Diego Morales Demo', '8440000103')
  ) AS u(rol, email, nombre, telefono)
  JOIN Roles r ON r.nombre = u.rol
  ON CONFLICT (email) DO NOTHING;

  SELECT idUsuarios INTO STRICT cliente_a FROM Usuarios WHERE email = 'sprint3.ana@example.test';
  SELECT idUsuarios INTO STRICT cliente_b FROM Usuarios WHERE email = 'sprint3.luis@example.test';
  PERFORM 1 FROM Usuarios WHERE email = 'sprint3.tecnico@example.test';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta el rol Técnico del esquema base.';
  END IF;

  -- Reutiliza entradas del catálogo si la base local ya las tiene.
  SELECT idMarcas INTO id_marca FROM Marca WHERE lower(btrim(nombre)) = 'nissan' ORDER BY idMarcas LIMIT 1;
  IF id_marca IS NULL THEN
    INSERT INTO Marca (nombre) VALUES ('Nissan') RETURNING idMarcas INTO id_marca;
  END IF;

  SELECT idModelos INTO id_modelo FROM Modelos
  WHERE idMarcas = id_marca AND lower(btrim(nombre)) = 'versa' ORDER BY idModelos LIMIT 1;
  IF id_modelo IS NULL THEN
    INSERT INTO Modelos (idMarcas, nombre) VALUES (id_marca, 'Versa') RETURNING idModelos INTO id_modelo;
  END IF;

  SELECT idMotores INTO id_motor FROM Motores WHERE tipo_motor = '1.6 L' ORDER BY idMotores LIMIT 1;
  IF id_motor IS NULL THEN
    INSERT INTO Motores (tipo_motor) VALUES ('1.6 L') RETURNING idMotores INTO id_motor;
  END IF;
  INSERT INTO Modelos_has_Motores (idModelos, idMotores) VALUES (id_modelo, id_motor) ON CONFLICT DO NOTHING;

  SELECT idAnio INTO id_anio FROM Anio WHERE anio = 2022 ORDER BY idAnio LIMIT 1;
  IF id_anio IS NULL THEN
    INSERT INTO Anio (anio) VALUES (2022) RETURNING idAnio INTO id_anio;
  END IF;

  INSERT INTO Productos (nombre, precio_unitario, precio_venta, stock_minimo, stock_actual, categoria, sku, ubicacion_almacen, marca)
  VALUES
    ('Aceite 5W-30 1 L Demo', 140.00, 185.50, 6, 24, 'Lubricantes', 'S3-DEMO-ACEITE', 'A-01', 'Demo'),
    ('Filtro de aceite Demo', 90.00, 135.00, 3, 12, 'Filtros', 'S3-DEMO-FILTRO', 'A-02', 'Demo'),
    ('Balatas delanteras Demo', 580.00, 790.00, 2, 8, 'Frenos', 'S3-DEMO-BALATAS', 'B-01', 'Demo')
  ON CONFLICT (sku) DO NOTHING;

  SELECT idProductos INTO STRICT id_aceite FROM Productos WHERE sku = 'S3-DEMO-ACEITE';
  SELECT idProductos INTO STRICT id_filtro FROM Productos WHERE sku = 'S3-DEMO-FILTRO';
  SELECT idProductos INTO STRICT id_balatas FROM Productos WHERE sku = 'S3-DEMO-BALATAS';

  SELECT idServicios INTO id_servicio FROM Servicios WHERE nombre = 'Afinación básica Demo' ORDER BY idServicios LIMIT 1;
  IF id_servicio IS NULL THEN
    INSERT INTO Servicios (nombre, descripcion, tiempo_estimado, costo, categoria, mano_obra, refacciones_estimadas)
    VALUES ('Afinación básica Demo', 'Cambio de aceite y filtro. Revisión general.', 1, 850, 1, 350, 500)
    RETURNING idServicios INTO id_servicio;
  END IF;

  INSERT INTO Productos_has_Servicios (idProductos, idServicios, cantidad)
  VALUES (id_aceite, id_servicio, 4), (id_filtro, id_servicio, 1)
  ON CONFLICT DO NOTHING;

  INSERT INTO Productos_compatibilidad (idProductos, idMarcas, idModelos, cantidad)
  SELECT sugerencia.producto, id_marca, id_modelo, sugerencia.unidades
  FROM (VALUES (id_aceite, 4), (id_filtro, 1), (id_balatas, 1)) AS sugerencia(producto, unidades)
  WHERE NOT EXISTS (
    SELECT 1 FROM Productos_compatibilidad pc
    WHERE pc.idProductos = sugerencia.producto AND pc.idMarcas = id_marca AND pc.idModelos = id_modelo
  );

  -- Cada placa y VIN identifica un escenario, aunque su estado cambie en la interfaz.
  FOR caso IN SELECT * FROM (VALUES
    ('S3-DEMO-01', '3N1CN8DV0NL900001', cliente_a, 'Blanco', 42350, 'Pendiente de Aprobación', 0, true, 'Orden lista para aprobar.'),
    ('S3-DEMO-02', '3N1CN8DV0NL900002', cliente_b, 'Gris', 73500, 'En proceso', 0, true, 'Hay puntos de inspección pendientes.'),
    ('S3-DEMO-03', '3N1CN8DV0NL900003', cliente_a, 'Azul', 61800, 'Completado', 1, true, 'Servicio finalizado y revisado.'),
    ('S3-DEMO-04', '3N1CN8DV0NL900004', cliente_b, 'Rojo', 98200, 'Pendiente de Aprobación', 0, false, 'Orden de prueba para validar el requisito de refacciones.')
  ) AS datos(placa, vin, cliente, color, km, estado, dias_atras, lleva_refacciones, nota)
  LOOP
    SELECT idVehiculos INTO id_vehiculo FROM Vehiculos WHERE vin = caso.vin ORDER BY idVehiculos LIMIT 1;
    IF id_vehiculo IS NULL THEN
      INSERT INTO Vehiculos (idUsuarios, idAnio, idMarcas, idMotores, idModelos, placa, color, km, vin)
      VALUES (caso.cliente, id_anio, id_marca, id_motor, id_modelo, caso.placa, caso.color, caso.km, caso.vin)
      RETURNING idVehiculos INTO id_vehiculo;
    END IF;

    IF EXISTS (SELECT 1 FROM Mantenimiento WHERE idVehiculos = id_vehiculo) THEN
      CONTINUE;
    END IF;

    INSERT INTO Mantenimiento (idVehiculos, tecnico, kilometraje, estado, fecha, observaciones, costo_final, checklist)
    VALUES (
      id_vehiculo, 'Diego Morales Demo', caso.km::text, caso.estado, hoy - caso.dias_atras,
      '[Sprint 3 Demo] ' || caso.nota, CASE WHEN caso.lleva_refacciones THEN 1000 ELSE 350 END,
      (SELECT jsonb_agg(jsonb_build_object(
        'id', punto.id, 'item', punto.descripcion,
        'estado', CASE
          WHEN caso.estado IN ('En proceso', 'Completado') AND punto.id IN ('aceite', 'filtro') THEN 'Cambiado'
          WHEN caso.estado = 'Completado' THEN 'OK'
          ELSE 'Pendiente'
        END,
        'nota', CASE WHEN caso.estado = 'En proceso' AND punto.id = 'frenos' THEN 'Medir desgaste.' ELSE '' END
      ) ORDER BY punto.orden)::text
      FROM (VALUES
        (1, 'aceite', 'Nivel y calidad del aceite del motor'),
        (2, 'filtro', 'Filtro de aceite'),
        (3, 'frenos', 'Estado de balatas y discos'),
        (4, 'llantas', 'Presión de neumáticos')
      ) AS punto(orden, id, descripcion))
    ) RETURNING idMantenimiento INTO id_orden;

    INSERT INTO DetalleMantenimientoServicios (idMantenimiento, idServicios, precio, descripcion)
    VALUES (id_orden, id_servicio, 350, 'Afinación básica y revisión general del vehículo.');

    IF caso.lleva_refacciones THEN
      INSERT INTO DetalleMantenimientoProductos (idMantenimiento, idProductos, cantidad, precio)
      VALUES (id_orden, id_aceite, 4, 140), (id_orden, id_filtro, 1, 90);
    END IF;
  END LOOP;

  -- Convierte las horas de Saltillo a la zona usada por Venta.fecha (TIMESTAMP).
  FOR caso IN SELECT * FROM (VALUES
    (0, TIME '09:15', cliente_a, 1, id_aceite, 4, 185.50, id_filtro, 1, 135.00),
    (0, TIME '11:30', cliente_b, 2, id_balatas, 1, 790.00, NULL, 0, 0.00),
    (0, TIME '15:45', cliente_a, 3, id_filtro, 2, 135.00, NULL, 0, 0.00),
    (1, TIME '17:10', cliente_b, 1, id_aceite, 2, 185.50, NULL, 0, 0.00)
  ) AS datos(dias_atras, hora_local, cliente, metodo, producto, cantidad, precio, adicional, cantidad_extra, precio_extra)
  LOOP
    fecha_venta := ((hoy - caso.dias_atras + caso.hora_local) AT TIME ZONE 'America/Mexico_City') AT TIME ZONE zona_bd;
    IF EXISTS (SELECT 1 FROM Venta v JOIN DetalleVenta d ON d.idVenta = v.idVenta
               WHERE v.idUsuarios = caso.cliente AND v.fecha = fecha_venta
                 AND v.metodo_pago = caso.metodo AND d.idProductos = caso.producto) THEN
      CONTINUE;
    END IF;

    total_venta := caso.cantidad * caso.precio + caso.cantidad_extra * caso.precio_extra;
    INSERT INTO Venta (idProductos, idUsuarios, metodo_pago, total, fecha)
    VALUES (caso.producto, caso.cliente, caso.metodo, total_venta, fecha_venta) RETURNING idVenta INTO id_venta;

    INSERT INTO DetalleVenta (idVenta, idProductos, cantidad, precio_unitario, subtotal)
    VALUES (id_venta, caso.producto, caso.cantidad, caso.precio, caso.cantidad * caso.precio);
    IF caso.adicional IS NOT NULL THEN
      INSERT INTO DetalleVenta (idVenta, idProductos, cantidad, precio_unitario, subtotal)
      VALUES (id_venta, caso.adicional, caso.cantidad_extra, caso.precio_extra, caso.cantidad_extra * caso.precio_extra);
    END IF;
  END LOOP;
END
$seed$;

COMMIT;
