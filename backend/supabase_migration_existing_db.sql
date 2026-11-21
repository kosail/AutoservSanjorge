BEGIN;

DO $$
DECLARE
  grupo RECORD;
  duplicate_ids INTEGER[];
BEGIN
  FOR grupo IN
    SELECT LOWER(TRIM(nombre)) AS clave, MIN(idMarcas) AS keep_id
    FROM Marca
    WHERE nombre IS NOT NULL
    GROUP BY LOWER(TRIM(nombre))
    HAVING COUNT(*) > 1
  LOOP
    SELECT ARRAY_AGG(idMarcas)
    INTO duplicate_ids
    FROM Marca
    WHERE LOWER(TRIM(nombre)) = grupo.clave
      AND idMarcas <> grupo.keep_id;

    UPDATE Modelos
    SET idMarcas = grupo.keep_id
    WHERE idMarcas = ANY(duplicate_ids);

    UPDATE Vehiculos
    SET idMarcas = grupo.keep_id
    WHERE idMarcas = ANY(duplicate_ids);

    UPDATE Productos_compatibilidad
    SET idMarcas = grupo.keep_id
    WHERE idMarcas = ANY(duplicate_ids);

    DELETE FROM Marca
    WHERE idMarcas = ANY(duplicate_ids);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS marca_nombre_normalizado_key
ON Marca (LOWER(TRIM(nombre)));

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(150) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (id)
VALUES ('001_marcas_unicas')
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT indexdef AS indice_marcas
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'marca_nombre_normalizado_key';

SELECT COUNT(*) AS marcas_duplicadas
FROM (
  SELECT LOWER(TRIM(nombre))
  FROM Marca
  WHERE nombre IS NOT NULL
  GROUP BY LOWER(TRIM(nombre))
  HAVING COUNT(*) > 1
) duplicadas;

SELECT id, applied_at
FROM schema_migrations
WHERE id = '001_marcas_unicas';
