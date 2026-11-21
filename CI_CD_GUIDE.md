# Pipeline de GitLab

## Destinos

- GitLab: https://gitlab.com/sanjorge-group/AutoservSanjorge
- Vercel: https://vercel.com/ig2005cds-projects/autoservsanjorge

## Etapas y jobs

El pipeline se ejecuta en merge requests hacia `main`, pushes a `main` y ejecuciones manuales sobre `main`.

### Build

- `compilar`: instala dependencias del frontend, ejecuta `npm run build` y conserva `taller-frontend/dist/`.

### Test

- `pruebas`: ejecuta Vitest, publica JUnit en `taller-frontend/test-results/junit.xml` y cobertura en `taller-frontend/coverage/`.
- `pruebas_backend`: ejecuta las pruebas de Node y publica JUnit en `backend/test-results/junit.xml`.
- `migraciones`: usa un PostgreSQL temporal, ejecuta dos veces las migraciones, valida el esquema y ejecuta los smoke tests.

Los jobs de pruebas y migraciones no usan `allow_failure`. Un fallo detiene el pipeline.

### Package

- `validar_imagenes`: valida las imágenes Docker en merge requests.
- `publicar_imagenes`: publica las imágenes en el registry en `main`.

Ambos jobs dependen de `pruebas`, `pruebas_backend` y `migraciones`.

### Deploy

- `deploy_staging`: manual, en `main`.
- Antes de levantar la nueva versión ejecuta migraciones, validación de esquema y smoke tests contra staging.
- Después de `docker compose up`, valida `/healthz`, `/api/health`, `/api/catalogo/marcas` y `/api/mantenimientos`.

## Migraciones

Orden obligatorio:

1. `npm run migrate:all`
2. `npm run validate:schema`
3. `npm run smoke:test`

El detalle está en [backend/MIGRATIONS.md](backend/MIGRATIONS.md).

## Reportes

- JUnit frontend: `taller-frontend/test-results/junit.xml`
- Cobertura frontend: `taller-frontend/coverage/`
- JUnit backend: `backend/test-results/junit.xml`

La cobertura no tiene umbrales, por lo que no bloquea el pipeline por porcentaje.

## Secretos en logs

- Las variables sensibles deben estar protegidas y enmascaradas en GitLab.
- `docker login` usa `--password-stdin`.
- No ejecutar `printenv`, `env` ni `echo` con credenciales.
- Los scripts de migración y validación no imprimen `DATABASE_URL`.

## Ejecución local

```sh
npm --prefix taller-frontend ci --include=dev
npm --prefix backend ci
npm --prefix taller-frontend run test:ci
npm --prefix backend run test:ci
npm --prefix taller-frontend run build
```

Para migraciones locales, configurar `DATABASE_URL` y `DB_SSL` en el entorno o en `backend/.env`, sin subir ese archivo al repositorio.

## Diagnóstico

- `Pending`: revisar runner, etiquetas y cuota.
- Fallo JUnit: abrir el job y revisar el reporte de pruebas.
- Fallo de migraciones: revisar el ID de migración y ejecutar `validate:schema`.
- Fallo en staging: comprobar acceso a Docker y `/var/run/docker.sock`.
- Error de instalación: mantener `package.json` y `package-lock.json` sincronizados.

No ejecutar `backend/test_auth.js` en el pipeline: modifica credenciales reales.
