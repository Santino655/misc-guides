---
title: Guia ngrok websockets
date: 2026-9-4
---

# Guía: ngrok + WebSockets con Deno/Oak + interfaz React (Vite)

## 1. Arquitectura general

```
[Navegador - React/Vite]  <--WS/WSS-->  [ngrok tunnel]  <-->  [Deno + Oak (localhost)]
```

- **Deno + Oak**: expone un endpoint WebSocket local (ej. `ws://localhost:8000/ws`).
- **ngrok**: crea un túnel público (https/wss) hacia ese puerto local, sin necesidad de abrir puertos en tu router ni desplegar nada.
- **React (Vite)**: se conecta al WebSocket usando la URL pública que da ngrok (o la local, en desarrollo).

Esto es útil para: probar la app desde otro dispositivo/red, compartir una demo con un cliente, testear webhooks o clientes móviles contra tu backend local, etc.

---

## 2. Instalación y configuración de ngrok

1. Crear cuenta en ngrok.com y obtener el **authtoken**.
2. Instalar:
   - macOS: `brew install ngrok`
   - Windows/Linux: descargar binario o usar el instalador oficial.
3. Autenticar una sola vez:
   ```
   ngrok config add-authtoken TU_TOKEN
   ```
4. Levantar el túnel apuntando al puerto donde corre Oak (ej. 8000):
   ```
   ngrok http 8000
   ```
5. ngrok te da una URL pública tipo `https://abc123.ngrok-free.app`. Esa misma URL sirve para HTTP y, cambiando el esquema a `wss://`, para WebSockets (ngrok soporta upgrade de protocolo automáticamente).

**Nota clave**: no necesitás un túnel "especial" para WS; el mismo túnel HTTP de ngrok soporta el *upgrade* a WebSocket porque es un simple cambio de protocolo sobre la misma conexión TCP/TLS.

---

## 3. Servidor Deno + Oak con WebSockets (nivel conceptual)

Sin entrar en código, la estructura típica es:

- Un router de Oak con una ruta (ej. `/ws`) que verifica que la request sea un *upgrade* de WebSocket.
- Oak expone `ctx.upgrade()` para convertir esa conexión HTTP en un socket bidireccional.
- Se guarda cada conexión activa en una estructura (Set/Map) para poder hacer *broadcast* si hace falta (chat, notificaciones, sincronización de estado, etc.).
- Los demás endpoints REST (si los hay) conviven en el mismo router de Oak, en el mismo puerto — así ngrok solo necesita exponer un puerto.

Puntos a decidir de diseño (no de código):
- **Protocolo de mensajes**: JSON con un campo `type` es lo más común (`{"type":"chat","payload":...}`).
- **Autenticación**: si la necesitás, va normalmente como query param o header antes del upgrade, porque el WebSocket en sí no soporta headers custom fácilmente desde el browser.
- **Reconexión**: el cliente debe manejar reintentos, ya que los túneles gratuitos de ngrok pueden cortar/rotar la URL.

---

## 4. Exponer el servidor con ngrok

Con Deno/Oak corriendo en `localhost:8000` y ngrok apuntando ahí:

- HTTP público: `https://abc123.ngrok-free.app`
- WebSocket público: `wss://abc123.ngrok-free.app/ws`

Cosas a tener en cuenta:
- En el plan gratuito, la URL **cambia cada vez que reiniciás ngrok** (salvo que uses un dominio fijo/reservado, disponible en planes pagos o con `ngrok http --url=tu-dominio-fijo.ngrok-free.app`).
- ngrok agrega una página de advertencia en el navegador la primera vez (para tráfico HTTP); para WebSocket puro esto no aplica, pero sí para las peticiones REST previas si las hay.
- Si tu backend valida `Origin` o CORS, hay que agregar el dominio de ngrok a la whitelist.

---

## 5. Conectarse desde React

Conceptualmente, del lado de React:

- Se abre el WebSocket con `new WebSocket(url)`, típicamente dentro de un hook custom (`useWebSocket`) o un contexto, para que sea reutilizable en toda la app.
- Se manejan los eventos `onopen`, `onmessage`, `onclose`, `onerror`.
- Se centraliza el envío de mensajes en una función tipo `send(data)` que hace `JSON.stringify` antes de mandar.
- La URL del WebSocket **no debe estar hardcodeada** en el componente: debe venir de configuración (ver punto 6), para poder alternar entre local y ngrok sin tocar código.

---

## 6. Formas de incluir la URL de ngrok/WS en un proyecto Vite

Hay varias estrategias, de más simple a más flexible:

### a) Variables de entorno de Vite (`.env`)
- Crear `.env.local` con algo como `VITE_WS_URL=wss://abc123.ngrok-free.app/ws`.
- Vite expone automáticamente cualquier variable prefijada con `VITE_` en `import.meta.env`.
- Ventaja: simple, versionable por entorno (`.env.development`, `.env.production`).
- Desventaja: si la URL de ngrok cambia (plan free), hay que editar el archivo y reiniciar el dev server cada vez.

### b) Proxy de desarrollo en `vite.config.ts`
- Vite permite configurar un `server.proxy` que redirige rutas (incluyendo `ws: true`) hacia otro host durante desarrollo.
- Sirve para que el frontend siempre hable con `/ws` en su propio origen, y Vite internamente reenvía a `localhost:8000` o a la URL de ngrok.
- Útil para evitar problemas de CORS/Origin en desarrollo, aunque para producción esto no aplica (el proxy es solo del dev server).

### c) Configuración dinámica en runtime
- En vez de fijar la URL en build-time, el frontend hace un `fetch` a un endpoint propio (ej. `/config`) que devuelve la URL vigente del WebSocket.
- Es la opción más robusta si la URL de ngrok cambia seguido (por ejemplo, el propio backend Deno puede exponer su URL pública actual si la lee de una variable de entorno que vos actualizás al reiniciar ngrok).

### d) Túnel fijo + variable de entorno único
- Si pagás un dominio fijo de ngrok, la variable de entorno de la opción (a) deja de romperse entre reinicios, y es la combinación más simple y estable para trabajo diario.

**Recomendación práctica**: para desarrollo local rápido, usar (a) + (b) combinados (proxy para evitar CORS, env var para saber a dónde apuntar). Para demos que compartís con terceros, (c) o (d) evitan tener que recompilar el frontend cada vez que ngrok te da una URL nueva.

---

## 7. Buenas prácticas y seguridad

- Nunca commitear la URL de ngrok en el repo si el túnel expone datos sensibles; usar `.env.local` (ignorado por git).
- Si el WS maneja datos reales (no solo demo), agregar autenticación mínima (token en la query string al conectar) — ngrok por sí solo no autentica a nadie.
- Cerrar el túnel cuando no se use: cualquiera con la URL puede conectarse mientras esté activo.
- Loguear conexiones/desconexiones del lado de Oak para debug, ya que los túneles gratuitos pueden cortar conexiones idle después de un rato.

---

## 8. Checklist rápido

- [ ] Deno + Oak corriendo local con ruta WS (`/ws`)
- [ ] `ngrok http <puerto>` corriendo y URL pública obtenida
- [ ] Origin/CORS del backend actualizado con el dominio ngrok
- [ ] Variable `VITE_WS_URL` (u otro mecanismo) configurada en el frontend
- [ ] Hook/contexto de React usando esa variable, no una URL fija
- [ ] Manejo de reconexión en el cliente ante caídas del túnel
