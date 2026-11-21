# 🛠️ Guía de Configuración e Integración con Supabase

Ya dejamos todo el código de tu aplicación listo para conectarse a **Supabase**. Dado que ya creaste las tablas en Supabase, el siguiente paso es conectar el backend a tu base de datos mediante la cadena de conexión.

---

## 🔑 1. Dónde obtener tus credenciales en Supabase

1. Inicia sesión en tu panel de [Supabase](https://supabase.com/dashboard).
2. Selecciona tu proyecto **SanJorge**.
3. Ve a **Project Settings** (el icono de engranaje ⚙️ abajo a la izquierda).

### A. Cadena de conexión PostgreSQL (`DATABASE_URL`)
* Ve a **Database** -> **Connection String**.
* Selecciona la pestaña **URI** o **Transaction Pooler** (Puerto 6543 / 5432).
* Copia la URI que luce así:
  ```text
  postgres://postgres.[PROJECT_REF]:[TU_CONTRASEÑA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
  ```
  *(Asegúrate de reemplazar `[TU_CONTRASEÑA]` por la contraseña que le asignaste a tu base de datos cuando creaste el proyecto).*

### B. Llaves API (Opcional si usas el cliente Supabase JS)
* Ve a **API** en el menú de la izquierda.
* Encontrarás:
  * **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
  * **anon / public key**: `eyJhbGci...`
  * **service_role key**: `eyJhbGci...`

---

## 💻 2. Configuración para Desarrollo Local (`.env`)

Crea un archivo llamado `.env` dentro de la carpeta `backend/` (`backend/.env`) con el siguiente contenido:

```env
PORT=4000
NODE_ENV=development

# 1. Cadena de Conexión de Supabase
DATABASE_URL="postgres://postgres.xxxxxx:TU_CONTRASEÑA_AQUI@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"

# 2. Requerido para conectar a Supabase sin error de SSL
DB_SSL=true

# 3. Credenciales opcionales de SDK Supabase
SUPABASE_URL="https://xxxxxx.supabase.co"
SUPABASE_ANON_KEY="eyJhbGci..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..."
```

---

## 🧪 3. Probar la Conexión desde la Consola

Hemos incluido un script automático para probar la conexión a Supabase y verificar que las tablas y roles estén correctamente configurados.

Abre una terminal en la carpeta `backend` y ejecuta:

```bash
npm run migrate:all
npm run validate:schema
npm run smoke:test
```

`migrate:all` aplica el esquema base idempotente y las migraciones pendientes. `validate:schema` detiene el proceso si falta una tabla, columna o índice. `smoke:test` comprueba la conexión y consultas básicas.

El orden completo y el detalle de las migraciones están en [backend/MIGRATIONS.md](backend/MIGRATIONS.md). `migrate:supabase` se conserva como alias del nuevo runner.

Si la base ya existe y solo necesitas aplicar los cambios desde el SQL Editor de Supabase, copia y pega completo el archivo [backend/supabase_migration_existing_db.sql](backend/supabase_migration_existing_db.sql). No ejecutes seeds ni recrees tablas.

---

## 🚀 4. Despliegue en Vercel

Ver el archivo [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) para los pasos exactos de despliegue y variables de entorno en Vercel.
