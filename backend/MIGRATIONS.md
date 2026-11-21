# Migraciones y validación de esquema

## Orden de ejecución

Ejecutar siempre en este orden:

1. `npm run migrate:all`
2. `npm run validate:schema`
3. `npm run smoke:test`
4. Desplegar o reiniciar la aplicación

`migrate:all` aplica `supabase_schema.sql` como base idempotente y después ejecuta las migraciones pendientes registradas en `schema_migrations`.

## Migraciones actuales

| Orden | ID | Descripción |
| --- | --- | --- |
| 001 | `001_marcas_unicas` | Consolida marcas duplicadas, reasigna modelos, vehículos y compatibilidades, y crea el índice único por `LOWER(TRIM(nombre))`. |

No se requieren migraciones nuevas para nombre/apellidos ni refacciones. La validación comprueba que sus tablas y columnas actuales existan.

## Idempotencia

- `supabase_schema.sql` usa `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` y bloques condicionales.
- `001_marcas_unicas` conserva el menor `idMarcas` y puede ejecutarse varias veces.
- La tabla `schema_migrations` evita volver a aplicar migraciones ya registradas.
- El runner usa un advisory lock para evitar ejecuciones simultáneas.

## Comandos

Desde `backend/`:

```sh
npm run migrate:all
npm run migrate:all
npm run validate:schema
npm run smoke:test
```

Ejecutar dos veces `migrate:all` es la comprobación de idempotencia usada por el pipeline.

## Validación

`validate:schema` comprueba:

- Tablas mínimas del sistema.
- Columnas de usuarios, marcas, servicios/refacciones y mantenimiento.
- Índice único `marca_nombre_normalizado_key` con `LOWER(TRIM(nombre))`.
- Registro de `001_marcas_unicas` en `schema_migrations`.

Si falta algo, el script termina con código distinto de cero y el pipeline se detiene.

## Staging

`deploy_staging` ejecuta, antes de levantar la nueva versión:

```sh
docker compose run --rm --no-deps backend npm run migrate:all
docker compose run --rm --no-deps backend npm run validate:schema
docker compose run --rm --no-deps backend npm run smoke:test
```

Después de `docker compose up`, valida `/healthz`, `/api/health`, `/api/catalogo/marcas` y `/api/mantenimientos`.

## Seguridad

- No imprimir `DATABASE_URL`, contraseñas ni variables de entorno completas.
- Usar variables CI/CD enmascaradas.
- Mantener `docker login --password-stdin`.
- No usar `printenv`, `env` ni `echo` con credenciales.
