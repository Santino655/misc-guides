# Guía: Animar imágenes en Three.js + React (cambio y movimiento con ease)

Stack recomendado: **react-three-fiber** (R3F) + **@react-three/drei** + **react-spring** (o `easing` manual con `useFrame`). Con esto puedes mover una imagen y hacer *crossfade* a otra al mismo tiempo, con una curva de ease y duración exactas.

---

## 1. Instalación

```bash
npm install three @react-three/fiber @react-three/drei @react-spring/three
```

- `three`: motor 3D.
- `@react-three/fiber`: renderiza Three.js con componentes React.
- `@react-three/drei`: helpers (cámaras, controles, carga de texturas).
- `@react-spring/three`: animaciones declarativas con física/ease, integradas con R3F.

---

## 2. Escena base con una imagen (plano + textura)

```jsx
// Scene.jsx
import { Canvas } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'

function ImagePlane({ url, ...props }) {
  const texture = useTexture(url)
  return (
    <mesh {...props}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  )
}

export default function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }}>
      <ImagePlane url="/img1.jpg" />
    </Canvas>
  )
}
```

`useTexture` de `drei` carga la imagen como `THREE.Texture` y la cachea automáticamente.

---

## 3. Mover con ease y duración (react-spring)

`@react-spring/three` te da control total de duración y curva de easing (`easing` de la librería `d3-ease` o funciones propias).

```jsx
import { useSpring, a } from '@react-spring/three'
import { easings } from '@react-spring/three'

function MovingImage({ url, targetPosition }) {
  const texture = useTexture(url)

  const { position } = useSpring({
    position: targetPosition,       // ej: [2, 1, 0]
    config: {
      duration: 1200,               // ms
      easing: easings.easeInOutCubic
    }
  })

  return (
    <a.mesh position={position}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} transparent />
    </a.mesh>
  )
}
```

Cambiando `targetPosition` en un `useState`, cada vez que se actualiza, el `mesh` se anima suavemente hacia la nueva posición con la curva y duración indicadas.

`easings` incluye: `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInOutBack`, etc. — el equivalente a las curvas CSS/GSAP típicas.

---

## 4. Cambiar de imagen con transición (crossfade de texturas)

La forma más limpia es superponer dos planos y animar su **opacidad** con la misma técnica de ease + duración, mientras uno se desvanece y el otro aparece.

```jsx
import { useState, useEffect } from 'react'
import { useSpring, a } from '@react-spring/three'
import { useTexture } from '@react-three/drei'

function CrossfadeImage({ url, position }) {
  const [current, setCurrent] = useState(url)
  const [previous, setPrevious] = useState(null)
  const texCurrent = useTexture(current)
  const texPrevious = useTexture(previous || current)

  useEffect(() => {
    if (url !== current) {
      setPrevious(current)
      setCurrent(url)
    }
  }, [url])

  const { opacity } = useSpring({
    opacity: previous ? 1 : 0,
    from: { opacity: previous ? 0 : 1 },
    reset: true,
    config: { duration: 800, easing: t => t * (2 - t) }, // easeOutQuad manual
    onRest: () => setPrevious(null)
  })

  return (
    <group position={position}>
      {previous && (
        <mesh>
          <planeGeometry args={[2, 2]} />
          <a.meshBasicMaterial map={texPrevious} transparent opacity={opacity.to(o => 1 - o)} />
        </mesh>
      )}
      <mesh>
        <planeGeometry args={[2, 2]} />
        <a.meshBasicMaterial map={texCurrent} transparent opacity={previous ? opacity : 1} />
      </mesh>
    </group>
  )
}
```

Idea clave: la imagen **nueva** entra con `opacity` de 0→1 mientras la **anterior** hace 1→0, ambas gobernadas por el mismo `useSpring`.

---

## 5. Combinar movimiento + cambio de imagen a la vez

Basta con animar `position` y `opacity` en el mismo `useSpring` (o en dos springs sincronizados con la misma `config`):

```jsx
function AnimatedSlide({ url, position }) {
  const texture = useTexture(url)

  const springs = useSpring({
    position,
    opacity: 1,
    from: { opacity: 0 },
    config: { duration: 1000, easing: easings.easeInOutCubic }
  })

  return (
    <a.mesh position={springs.position}>
      <planeGeometry args={[2, 2]} />
      <a.meshBasicMaterial map={texture} transparent opacity={springs.opacity} />
    </a.mesh>
  )
}
```

Cada vez que cambias `url` y `position` desde el componente padre (por ejemplo con un `setState` en un carrusel), la imagen se moverá **y** aparecerá/desaparecerá con la misma duración y curva de ease.

---

## 6. Alternativa sin react-spring: `useFrame` manual

Si prefieres no añadir dependencias, puedes interpolar tú mismo dentro de `useFrame`, usando una función de easing (por ejemplo de la librería `three`/`@popmotion/easing` o escrita a mano):

```jsx
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'

const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

function ManualEaseImage({ texture, from, to, duration = 1000 }) {
  const meshRef = useRef()
  const start = useRef(performance.now())

  useFrame(() => {
    const elapsed = performance.now() - start.current
    const t = Math.min(elapsed / duration, 1)
    const eased = easeInOutCubic(t)

    meshRef.current.position.lerpVectors(
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
      eased
    )
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  )
}
```

Esto te da control absoluto pero requiere manejar tú el reinicio del temporizador (`start.current`) cada vez que cambian `from`/`to`.

---

## 7. Resumen de opciones

| Enfoque | Ventaja | Cuándo usarlo |
|---|---|---|
| `@react-spring/three` | Declarativo, fácil de combinar posición + opacidad, muchas curvas listas | Recomendado para la mayoría de casos |
| `useFrame` + easing manual | Control total, cero dependencias extra | Animaciones muy custom o performance crítica |
| `framer-motion-3d` | Similar a react-spring, API tipo Framer Motion | Si ya usas Framer Motion en el resto del proyecto |

Para tu caso (imagen que cambia **y** se mueve a la vez, con duración y ease definidos), la combinación más simple y mantenible es el patrón de la **sección 5**: un solo `useSpring` controlando `position` y `opacity` juntos.
