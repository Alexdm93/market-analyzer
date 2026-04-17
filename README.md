# Salary Intelligence

Aplicación Next.js 16 con autenticación local vía NextAuth y persistencia en Prisma. La configuración quedó preparada para desplegar en Vercel usando Supabase Postgres como base de datos.

## Requisitos

- Node.js 20.9 o superior
- pnpm
- Un proyecto de Supabase con acceso a Postgres

## Variables de entorno

Crea tu `.env.local` a partir de `.env.example`.

```bash
DATABASE_URL="postgresql://postgres.[YOUR_PROJECT_REF]:[YOUR_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[YOUR_PROJECT_REF]:[YOUR_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
```

Notas:

- `DATABASE_URL` queda reservada para runtime usando el pooler de Supabase.
- `DIRECT_URL` se usa para migraciones y operaciones que Prisma no debe ejecutar a través del pooler transaccional.
- En local, usa `NEXTAUTH_URL=http://localhost:3000`.
- En Vercel, configura `NEXTAUTH_URL` con tu dominio público, por ejemplo `https://tu-app.vercel.app`.
- Genera `NEXTAUTH_SECRET` con `openssl rand -base64 32`.

## Desarrollo local

Instala dependencias, genera el cliente de Prisma y sincroniza el esquema con Supabase:

```bash
pnpm install
pnpm db:push
pnpm dev
```

Si prefieres validar solo el cliente de Prisma:

```bash
pnpm db:generate
```

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Añade estas variables de entorno en el proyecto:
	`DATABASE_URL`
	`DIRECT_URL`
	`NEXTAUTH_URL`
	`NEXTAUTH_SECRET`
3. Usa el runtime por defecto de Node.js.
4. Deja el comando de build en `pnpm vercel-build` si quieres forzar `prisma generate` antes de compilar.

El proyecto ya no depende de SQLite ni de archivos locales de base de datos, por lo que es compatible con el entorno efímero de Vercel.

## Migraciones

Tienes dos opciones:

- Flujo simple: ejecutar `pnpm db:push` contra Supabase antes del primer deploy.
- Flujo versionado: ya se incluye una migración inicial en `prisma/migrations`; aplícala con `pnpm db:migrate:deploy` en CI o antes de promover cambios.

## Scripts útiles

```bash
pnpm dev
pnpm build
pnpm lint
pnpm db:generate
pnpm db:push
pnpm db:migrate:deploy
pnpm vercel-build
```
