---
title: Guia jsr 
date: 2026-9-3
---

# Guía: Publicar paquetes con Deno en JSR

JSR (jsr.io) es el registro de paquetes recomendado para proyectos Deno-first. Acepta TypeScript directo (sin build), genera documentación desde tus comentarios JSDoc, y sirve paquetes tanto a Deno como a Node.js y otros runtimes.

---

## 1. Registrarte en JSR

1. Entrá a **[jsr.io](https://jsr.io)** y hacé clic en **Sign in** (arriba a la derecha).
2. JSR no usa usuario/contraseña propio: te autenticás con **GitHub** (es el único proveedor de login). No hace falta crear una cuenta nueva si ya tenés GitHub.
3. Una vez logueado, tenés que crear un **scope** (equivalente a una organización de npm). Andá a **[jsr.io/new](https://jsr.io/new)**.
   - Los scopes van precedidos de `@` (ej: `@tuusuario`).
   - Entre 2 y 32 caracteres, solo minúsculas, números y guiones.
   - Debe estar libre (y no ser "casi igual" a uno existente, ej. solo diferenciado por un guion).
4. Dentro del scope, creás el **paquete** (también desde jsr.io/new): 2 a 20 caracteres, minúsculas/números/guiones.

No necesitás hacer esto a mano cada vez: si publicás un paquete con un nombre de scope/paquete que todavía no existe, `deno publish` te guía a crearlo en el navegador durante el primer publish.

---

## 2. Preparar el proyecto

### 2.1 Estructura mínima

```
mi-paquete/
├── deno.json       # (o jsr.json)
├── mod.ts          # entrypoint principal
└── src/
    └── saludo.ts
```

### 2.2 Config del paquete (`deno.json` o `jsr.json`)

Si ya usás `deno.json`, podés meter ahí mismo los campos de JSR (no hace falta archivo aparte):

```jsonc
// deno.json
{
  "name": "@tuusuario/mi-paquete",
  "version": "0.1.0",
  "exports": "./mod.ts"
}
```

Reglas clave que exige JSR para poder publicar:

- Solo módulos **ESM** (`import`/`export`), nada de CommonJS.
- Nombres de archivo compatibles Windows/Unix (sin `*`, `:`, `?`, ni duplicados que solo difieran en mayúsculas).
- Evitar **"slow types"**: tipos TypeScript que no se pueden inferir sin type-checking completo en las funciones/clases/variables exportadas. Esto ralentiza el type-checking para quien consuma tu paquete y rompe la generación de docs y la compatibilidad con Node. Podés saltarte esto temporalmente con `--allow-slow-types`, pero no es recomendable.
- Los imports relativos entre tus propios módulos deben resolver en tiempo de publish (usá extensión explícita, ej. `./saludo.ts`).

### 2.3 Definir las rutas de exportación (`exports`)

Acá es donde definís qué "sub-rutas" puede importar quien use tu paquete. Podés tener un único entrypoint:

```jsonc
{
  "name": "@tuusuario/mi-paquete",
  "version": "0.1.0",
  "exports": "./mod.ts"
}
```

O varios, con el objeto de exports (la clave `"."` es el entrypoint por defecto):

```jsonc
{
  "name": "@tuusuario/mi-paquete",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts",
    "./saludo": "./src/saludo.ts",
    "./despedida": "./src/despedida.ts"
  }
}
```

Con esto, quien consuma tu paquete puede hacer:

```ts
import { saludar } from "@tuusuario/mi-paquete";          // -> mod.ts
import { saludar } from "@tuusuario/mi-paquete/saludo";   // -> src/saludo.ts
```

**Buenas prácticas de rutas:**
- Mantené `mod.ts` (o `index.ts`) como barrel/entrypoint que re-exporta lo público (`export * from "./src/saludo.ts"`).
- Solo expongas como sub-ruta lo que sea parte de tu API pública estable; el resto dejalo sin exportar (o usá `include`/`exclude` para no subir archivos internos).
- Documentá el módulo principal con un comentario `@module` en `mod.ts`; JSR lo usa para la página de docs.

### 2.4 Filtrar qué archivos se publican

Por defecto respeta tu `.gitignore`. Podés afinar con `publish.include` / `publish.exclude` en el `deno.json`:

```jsonc
{
  "name": "@tuusuario/mi-paquete",
  "version": "0.1.0",
  "exports": "./mod.ts",
  "publish": {
    "include": ["mod.ts", "src/**/*.ts", "README.md", "LICENSE"],
    "exclude": ["src/tests"]
  }
}
```

---

## 3. Publicar por primera vez (desde tu máquina)

No necesitás generar un token para publicar en local: la autenticación se hace vía navegador.

```bash
# probá primero en modo dry-run (no sube nada, solo valida)
deno publish --dry-run

# publicar de verdad
deno publish
```

Qué pasa al correr `deno publish`:

1. Se abre tu navegador pidiéndote loguearte en JSR (si no lo estás ya).
2. Te pide autorizar al CLI a publicar ese paquete específico → click en **"Allow"**.
3. El CLI sube el paquete, corre las validaciones del lado del servidor, y al final te tira la URL de tu paquete publicado (`https://jsr.io/@tuusuario/mi-paquete`).

Si algo no cumple las reglas de JSR, el comando falla con el detalle del error antes de subir nada.

---

## 4. Obtener un token (para CI que no sea GitHub Actions)

Esto es lo que buscás si vas a publicar automáticamente desde GitLab CI, CircleCI, Bitbucket, etc. (no hace falta si usás GitHub Actions, ver punto 5).

1. Andá a **[jsr.io/account/tokens](https://jsr.io/account/tokens)**.
2. Creá un **access token** nuevo, con permiso **"Publish"** para el/los scope(s) que necesites.
3. Guardalo como secreto en tu proveedor de CI (ej. variable `JSR_TOKEN`).
4. Usalo así:

```bash
deno publish --token $JSR_TOKEN
# o con npx
npx jsr publish --token $JSR_TOKEN
```

Ejemplo GitLab CI:

```yaml
publish:
  image: denoland/deno:latest
  stage: deploy
  script:
    - deno publish --token $JSR_TOKEN
  only:
    - main
```

⚠️ Publicar con token no genera *provenance attestation* (la marca de "publicado de forma verificable desde este commit/repo"); eso solo está disponible publicando por OIDC desde GitHub Actions.

---

## 5. Publicar automáticamente desde GitHub Actions (recomendado si tu repo está en GitHub)

Acá **no necesitás ningún token ni secreto**: usa OIDC.

1. En la página de tu paquete en jsr.io → **Settings** → vinculá el repo de GitHub (`Link`).
2. Agregá el workflow:

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # necesario para autenticar con JSR vía OIDC
    steps:
      - uses: actions/checkout@v6
      - run: npx jsr publish
```

Cada push a `main` intenta publicar; si la versión de `deno.json`/`jsr.json` ya está publicada, simplemente no hace nada (no falla).

---

## 6. Versionado: mejor manera de manejarlo

JSR exige **semver** estricto (`MAJOR.MINOR.PATCH`) en el campo `version`.

- **MAJOR**: rompés compatibilidad hacia atrás.
- **MINOR**: agregás funcionalidad compatible.
- **PATCH**: fixes que no cambian la API.

### Recomendación: no edites la versión a mano, usá `deno bump-version`

```bash
deno bump-version patch   # 1.4.6 -> 1.4.7
deno bump-version minor   # 1.4.6 -> 1.5.0
deno bump-version major   # 1.4.6 -> 2.0.0
```

También soporta pre-releases (ej. `1.5.0-rc.1`).

### Flujo recomendado (release automatizado)

Un patrón sólido usado incluso por la propia Standard Library de Deno:

1. Trabajás con **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.).
2. Un workflow de CI corre `deno bump-version` (sin especificar el incremento), que **deriva automáticamente** si el bump es patch/minor/major según los commits desde el último release, y arma el changelog.
3. Ese workflow abre un PR con el bump de versión.
4. Al mergear ese PR y crear el Release en GitHub, se dispara el segundo workflow (el de arriba) que corre `deno publish` y sube la nueva versión a JSR.

Si tenés un **monorepo/workspace** con varios paquetes, `deno publish` publica automáticamente cada miembro del workspace que tenga `name` + `version`, respetando el orden de dependencias entre ellos; y `deno bump-version` puede correr a nivel raíz del workspace para versionar todos los paquetes a la vez (`@deno/bump-workspaces` es la herramienta específica para esto).

### Inmutabilidad

Una vez publicada una versión en JSR, **no se puede sobrescribir ni borrar el código** de esa versión (solo se puede "yankear"/deprecar). Por eso conviene siempre correr `--dry-run` antes de un publish real, sobre todo en versiones MAJOR.

---

## 7. Usar tus propios paquetes (o los de terceros) desde JSR

### Desde Deno

```bash
# agrega la dependencia a tu deno.json automáticamente
deno add jsr:@tuusuario/mi-paquete
```

```ts
import { saludar } from "@tuusuario/mi-paquete";
// o fijando versión/rango explícito
import { saludar } from "jsr:@tuusuario/mi-paquete@^1.0.0";
```

O declarándolo en el import map de `deno.json`:

```jsonc
{
  "imports": {
    "@tuusuario/mi-paquete": "jsr:@tuusuario/mi-paquete@^1.0.0"
  }
}
```

### Desde Node.js / npm / pnpm / yarn

JSR publica una capa de compatibilidad npm automáticamente, así que también podés instalarlo con las herramientas de siempre:

```bash
npx jsr add @tuusuario/mi-paquete
# o
pnpm dlx jsr add @tuusuario/mi-paquete
# o
yarn dlx jsr add @tuusuario/mi-paquete
```

Esto agrega el paquete a tu `package.json` apuntando al registro JSR, y después lo importás normal:

```ts
import { saludar } from "@tuusuario/mi-paquete";
```

### Desde otras herramientas (Vite, Next.js, Cloudflare Workers, etc.)

JSR tiene guías específicas por entorno en `jsr.io/docs/with/...`, pero en general el patrón es el mismo `npx jsr add`.

---

## 8. Checklist resumen

- [ ] Cuenta en JSR vía GitHub login.
- [ ] Scope creado en `jsr.io/new` (ej. `@tuusuario`).
- [ ] `deno.json` con `name`, `version`, `exports` bien definidos.
- [ ] Sin "slow types" (o justificado el `--allow-slow-types`).
- [ ] `deno publish --dry-run` sin errores.
- [ ] Publish inicial en local (autenticación por navegador) o repo linkeado a GitHub Actions para publish automático por OIDC.
- [ ] Si usás CI que no es GitHub Actions: token creado en `jsr.io/account/tokens` con permiso Publish, guardado como secreto.
- [ ] Versionado con `deno bump-version` siguiendo semver / Conventional Commits.
