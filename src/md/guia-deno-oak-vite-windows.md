---
title: Guia autohost
date: 2026-9-4
---

# Guía: API dinámica con Oak + Frontend con Vite + Ejecutable standalone para Windows (deno compile)

## 1. Idea general

- **Oak**: framework tipo Express para Deno, usado para el backend/API.
- **Vite**: compila el frontend (React, Vue, vanilla, etc.) a archivos estáticos.
- **deno compile**: empaqueta tu backend (y opcionalmente los assets del frontend) en un `.exe` autocontenido. La máquina destino **no necesita tener Deno instalado**, porque el runtime va embebido en el binario.
- **Router dinámico**: en vez de escribir `router.get("/x", ...)` a mano por cada endpoint, generamos las rutas en tiempo de ejecución a partir de una definición (array de objetos, carpeta de archivos, o base de datos).

---

## 2. Requisitos previos (solo en tu máquina de desarrollo)

- Deno instalado (para desarrollar y compilar): https://deno.land
- Node.js + npm (solo para correr Vite y buildear el frontend)
- No se necesita nada de esto en la máquina donde correrá el `.exe` final.

---

## 3. Estructura del proyecto

```
mi-app/
├── backend/
│   ├── main.ts          <- entrypoint que compilamos con deno compile
│   ├── router.ts         <- router dinámico con Oak
│   └── routes/
│       ├── users.ts
│       ├── products.ts
│       └── ...
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── dist-frontend/        <- salida de "vite build" (se sirve desde Oak)
```

---

## 4. Router dinámico con Oak (todos los métodos HTTP)

La clave para "crear endpoints de todos los tipos dinámicamente" es definir las rutas como **datos**, no como código repetido, y registrar cada una con el método HTTP que le corresponda.

### `backend/routes/users.ts`

```ts
// Cada archivo de rutas exporta una lista de definiciones de endpoint
export const usersRoutes = [
  {
    method: "GET",
    path: "/api/users",
    handler: async (ctx: any) => {
      ctx.response.body = [{ id: 1, name: "Ana" }];
    },
  },
  {
    method: "GET",
    path: "/api/users/:id",
    handler: async (ctx: any) => {
      ctx.response.body = { id: ctx.params.id, name: "Ana" };
    },
  },
  {
    method: "POST",
    path: "/api/users",
    handler: async (ctx: any) => {
      const body = await ctx.request.body({ type: "json" }).value;
      ctx.response.status = 201;
      ctx.response.body = { created: true, data: body };
    },
  },
  {
    method: "PUT",
    path: "/api/users/:id",
    handler: async (ctx: any) => {
      const body = await ctx.request.body({ type: "json" }).value;
      ctx.response.body = { updated: ctx.params.id, data: body };
    },
  },
  {
    method: "PATCH",
    path: "/api/users/:id",
    handler: async (ctx: any) => {
      const body = await ctx.request.body({ type: "json" }).value;
      ctx.response.body = { patched: ctx.params.id, data: body };
    },
  },
  {
    method: "DELETE",
    path: "/api/users/:id",
    handler: async (ctx: any) => {
      ctx.response.body = { deleted: ctx.params.id };
    },
  },
];
```

Repites este patrón por recurso (`products.ts`, `orders.ts`, etc.). Así cada archivo declara "todos los tipos" (GET, POST, PUT, PATCH, DELETE) de forma explícita pero sin duplicar boilerplate del router.

### `backend/router.ts`

```ts
import { Router } from "https://deno.land/x/oak@v17.1.0/mod.ts";
import { usersRoutes } from "./routes/users.ts";
import { productsRoutes } from "./routes/products.ts";
// import más módulos de rutas aquí

const allRoutes = [
  ...usersRoutes,
  ...productsRoutes,
];

const router = new Router();

// Mapa método -> función del router de Oak
const methodMap: Record<string, (path: string, ...mw: any[]) => void> = {
  GET: router.get.bind(router),
  POST: router.post.bind(router),
  PUT: router.put.bind(router),
  PATCH: router.patch.bind(router),
  DELETE: router.delete.bind(router),
};

// Registro dinámico: recorre la lista y da de alta cada endpoint
for (const route of allRoutes) {
  const register = methodMap[route.method];
  if (!register) {
    console.warn(`Método no soportado: ${route.method}`);
    continue;
  }
  register(route.path, route.handler);
}

export default router;
```

Con esto, agregar un endpoint nuevo es solo agregar un objeto al array — no tocas el router en sí. Si más adelante quieres rutas 100% dinámicas (por ejemplo generadas desde una base de datos o un archivo JSON de configuración), simplemente construyes `allRoutes` leyendo esa fuente en vez de escribirla a mano.

---

## 5. Servidor Oak que sirve API + frontend compilado

### `backend/main.ts`

```ts
import { Application, send } from "https://deno.land/x/oak@v17.1.0/mod.ts";
import router from "./router.ts";

const app = new Application();

// Logging simple
app.use(async (ctx, next) => {
  await next();
  console.log(`${ctx.request.method} ${ctx.request.url.pathname}`);
});

// Rutas de la API
app.use(router.routes());
app.use(router.allowedMethods());

// Servir el frontend ya compilado por Vite (carpeta dist-frontend embebida)
app.use(async (ctx) => {
  await send(ctx, ctx.request.url.pathname, {
    root: `${Deno.cwd()}/dist-frontend`,
    index: "index.html",
  });
});

const port = 8000;
console.log(`Servidor corriendo en http://localhost:${port}`);
await app.listen({ port });
```

---

## 6. Frontend con Vite

En `frontend/`, un proyecto Vite normal (React, Vue, vanilla, etc.). Solo asegúrate de que las peticiones a la API apunten a rutas relativas como `/api/users`, ya que backend y frontend se sirven desde el mismo origen una vez compilado.

```bash
cd frontend
npm create vite@latest .
npm install
npm run build
```

Esto genera `frontend/dist/`. Cópialo (o configura `build.outDir`) para que termine en `dist-frontend/` en la raíz del proyecto, junto a `backend/main.ts`, ya que `main.ts` lo referencia con `Deno.cwd()`.

En `frontend/vite.config.ts` puedes fijar el output directamente ahí:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "../dist-frontend",
    emptyOutDir: true,
  },
});
```

---

## 7. Compilar todo en un `.exe` para Windows

`deno compile` empaqueta el runtime de Deno + tu código en un binario nativo. Puedes compilar **desde cualquier sistema operativo** apuntando al target de Windows con `--target`.

```bash
deno compile \
  --allow-net \
  --allow-read \
  --allow-env \
  --target x86_64-pc-windows-msvc \
  --include dist-frontend \
  --output miapp.exe \
  backend/main.ts
```

Puntos clave:

- `--target x86_64-pc-windows-msvc`: genera un binario Windows (64-bit) aunque compiles desde Linux/Mac.
- `--include dist-frontend`: embebe la carpeta del frontend compilado dentro del propio ejecutable, para que no dependa de archivos externos sueltos (opcional pero recomendado si quieres un único `.exe` portable).
- `--allow-net`: necesario para que Oak pueda escuchar en el puerto.
- `--allow-read`: necesario para servir los archivos estáticos (aunque estén embebidos, Deno los trata como sistema de archivos virtual).
- `--allow-env`: solo si tu código lee variables de entorno.

Si no usas `--include`, deberás distribuir la carpeta `dist-frontend` junto al `.exe`.

---

## 8. Uso en Windows sin Deno instalado

En la máquina Windows destino, solo hace falta:

1. Copiar `miapp.exe` (y `dist-frontend/` si no usaste `--include`).
2. Ejecutar `miapp.exe` (doble clic o desde consola).
3. Windows puede pedir permiso de firewall porque el binario abre un puerto — se acepta y listo.
4. Abrir `http://localhost:8000` en el navegador.

No requiere instalar Deno, Node ni nada adicional: el ejecutable ya trae el runtime embebido.

---

## 9. Notas prácticas

- **Antivirus/SmartScreen**: los `.exe` compilados con `deno compile` no están firmados por defecto, así que Windows puede mostrar una advertencia SmartScreen la primera vez. Si vas a distribuirlo ampliamente, considera firmar el binario con un certificado de código.
- **Rutas dinámicas por convención de archivos**: si quieres ir un paso más allá (estilo Next.js), puedes leer automáticamente todos los archivos en `backend/routes/*.ts`, importarlos dinámicamente con `import()` y registrar sus rutas — pero con `deno compile` el bundling es estático, así que los imports dinámicos deben resolverse en tiempo de compilación (evita `import()` con rutas construidas en runtime; usa un índice explícito como el `router.ts` de arriba).
- **CORS**: si el frontend y backend van a estar en el mismo `.exe`/origen no necesitas configurar CORS. Si el frontend se sirve aparte, agrega el middleware de CORS de Oak.
- **Variables de entorno / configuración**: usa `Deno.env.get(...)` y pasa `--allow-env`, o embebe un archivo `.env` con `--include`.

---

## 10. Resumen del flujo completo

1. Definir endpoints como datos en `backend/routes/*.ts`.
2. `router.ts` los registra dinámicamente según su método HTTP.
3. `main.ts` levanta Oak, monta el router y sirve el frontend estático.
4. `npm run build` en `frontend/` genera `dist-frontend/`.
5. `deno compile --target x86_64-pc-windows-msvc --include dist-frontend -o miapp.exe backend/main.ts`.
6. Se copia `miapp.exe` a cualquier PC con Windows y se ejecuta — sin instalar Deno.
