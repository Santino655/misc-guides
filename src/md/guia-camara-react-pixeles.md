---
title: Guia web camera
date: 2026-9-4
---

# Guía: Captura de cámara con MediaDevices, manipulación de píxeles en React y compresión a JSON

Esta guía cubre el flujo completo: acceder a la cámara del celular desde el navegador, capturar frames, leer y manipular cada píxel, serializarlos a JSON con compresión, y (opcionalmente) delegar la compresión de video pesado a `ffmpeg`.

---

## 1. Acceso a la cámara con `MediaDevices`

La API `navigator.mediaDevices.getUserMedia` es el punto de entrada. En celulares es clave pedir la cámara trasera (`facingMode: "environment"`) y manejar permisos con cuidado (HTTPS obligatorio).

```javascript
async function getCameraStream() {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" }, // cámara trasera en celu
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (err) {
    console.error("Error accediendo a la cámara:", err);
    throw err;
  }
}
```

Notas importantes:
- **HTTPS obligatorio** (o `localhost` en desarrollo). En celu sin HTTPS el navegador bloquea el acceso.
- Listar dispositivos disponibles con `navigator.mediaDevices.enumerateDevices()` si querés dejar elegir cámara frontal/trasera.
- Liberar siempre el stream con `track.stop()` al desmontar el componente, o el LED de cámara queda prendido.

---

## 2. Componente React: video + canvas oculto

El patrón estándar es: `<video>` reproduce el stream en vivo, y un `<canvas>` oculto se usa para "capturar" frames y leer píxeles con `getImageData`.

```jsx
import { useRef, useEffect, useState, useCallback } from "react";

function CameraCapture({ onFrame }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const stream = await getCameraStream();
      if (!active) return;
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    })();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Acá está el array de píxeles: Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    onFrame?.(imageData);
    return imageData;
  }, [ready, onFrame]);

  return (
    <div>
      <video ref={videoRef} playsInline muted style={{ width: "100%" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <button onClick={captureFrame} disabled={!ready}>
        Capturar frame
      </button>
    </div>
  );
}

export default CameraCapture;
```

Puntos clave:
- `playsInline` es **obligatorio** en iOS Safari, si no el video se va a fullscreen nativo.
- `willReadFrequently: true` en el contexto del canvas optimiza lecturas repetidas de píxeles (evita warnings de rendimiento en Chrome).
- `getImageData` devuelve `{ data, width, height }` donde `data` es un `Uint8ClampedArray` plano: 4 valores por píxel (R, G, B, A).

---

## 3. Manipular cada píxel

Ejemplo: recorrer el array y aplicar una transformación (por ejemplo escala de grises) antes de guardarlo.

```javascript
function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = out[i + 1] = out[i + 2] = gray;
    out[i + 3] = data[i + 3]; // alpha sin tocar
  }

  return { data: out, width, height };
}
```

Recorrer 1280x720 = ~921k píxeles (3.6M valores) frame a frame en el hilo principal puede trabar la UI. Para producción, considerá:
- **Web Workers**: mover el procesamiento pesado fuera del hilo principal (`postMessage` con `Transferable` para no copiar el buffer).
- **OffscreenCanvas**: permite dibujar y leer píxeles dentro de un worker directamente.

```javascript
// worker.js
self.onmessage = (e) => {
  const { data, width, height } = e.data;
  // procesar...
  self.postMessage({ data, width, height }, [data.buffer]);
};
```

---

## 4. Serializar a JSON con compresión

Guardar un `Uint8ClampedArray` crudo en JSON es carísimo (cada valor 0-255 como texto pesa varios bytes). Conviene comprimir **antes** de convertir a JSON, y guardar el resultado como base64 dentro del JSON.

### 4.1 Compresión con `CompressionStream` (nativo del navegador)

Disponible en navegadores modernos (Chrome, Edge, Safari 16.4+), sin librerías externas.

```javascript
async function compressPixels(imageData) {
  const { data, width, height } = imageData;

  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();

  const compressedBuffer = await new Response(cs.readable).arrayBuffer();
  const compressedBytes = new Uint8Array(compressedBuffer);

  // a base64 para meterlo en JSON
  let binary = "";
  for (let i = 0; i < compressedBytes.length; i++) {
    binary += String.fromCharCode(compressedBytes[i]);
  }
  const base64 = btoa(binary);

  return {
    width,
    height,
    format: "gzip+rgba",
    encoding: "base64",
    payload: base64,
  };
}
```

Y para guardarlo:

```javascript
async function saveFrameAsJSON(imageData, filename = "frame.json") {
  const compressed = await compressPixels(imageData);
  const json = JSON.stringify(compressed);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Para descomprimir del lado que lea el JSON (por ejemplo Node, o el mismo navegador):

```javascript
async function decompressPixels(jsonObj) {
  const binary = atob(jsonObj.payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const buffer = await new Response(ds.readable).arrayBuffer();
  return {
    data: new Uint8ClampedArray(buffer),
    width: jsonObj.width,
    height: jsonObj.height,
  };
}
```

### 4.2 Alternativa: `pako` (deflate/gzip vía librería)

Si necesitás soportar navegadores viejos sin `CompressionStream`, `pako` es la opción estándar (`npm install pako`):

```javascript
import pako from "pako";

function compressWithPako(uint8ClampedArray) {
  const raw = new Uint8Array(uint8ClampedArray.buffer);
  const compressed = pako.deflate(raw, { level: 6 });
  return btoa(String.fromCharCode(...compressed));
}
```

> Ojo: `String.fromCharCode(...compressed)` con arrays muy grandes puede tirar error de stack. Para buffers grandes, convertí en chunks o usá `Buffer` si corrés esto en un entorno Node/SSR.

---

## 5. Cuándo conviene usar `ffmpeg` en vez de JSON crudo

Guardar frame a frame como JSON tiene sentido si necesitás **acceso pixel por pixel** más adelante (análisis, visión por computadora, reconstrucción custom). Pero para video real (varios frames por segundo, guardar/transmitir), es muchísimo más eficiente delegarle la compresión a un codec de video real vía `ffmpeg`, en vez de reinventar compresión de imágenes en JS.

Dos enfoques:

### 5.1 `ffmpeg.wasm` (compresión en el navegador, sin backend)

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

```javascript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

async function framesToVideo(frameBlobs) {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  for (let i = 0; i < frameBlobs.length; i++) {
    const name = `frame${String(i).padStart(4, "0")}.png`;
    await ffmpeg.writeFile(name, await fetchFile(frameBlobs[i]));
  }

  await ffmpeg.exec([
    "-framerate", "30",
    "-i", "frame%04d.png",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "output.mp4",
  ]);

  const data = await ffmpeg.readFile("output.mp4");
  return new Blob([data.buffer], { type: "video/mp4" });
}
```

Esto corre **en el navegador vía WebAssembly**, sin servidor. Es pesado (~30MB el binario wasm) pero evita mandar video crudo a un backend.

### 5.2 `ffmpeg` en un backend/servidor

Si preferís no cargar wasm en el celu (dispositivos de gama baja sufren), lo mejor es:
1. Capturar el stream directo con `MediaRecorder` (API nativa, sin tocar píxel por píxel):

```javascript
const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
const chunks = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: "video/webm" });
  await fetch("/api/upload", { method: "POST", body: blob });
};
recorder.start();
```

2. En el backend (Node, por ejemplo con `fluent-ffmpeg`), convertir/comprimir con ffmpeg real:

```javascript
const ffmpeg = require("fluent-ffmpeg");

ffmpeg("uploaded.webm")
  .videoCodec("libx264")
  .outputOptions(["-crf 28", "-preset fast"])
  .save("compressed.mp4");
```

Esto es lo recomendado si el objetivo final es "guardar el video comprimido", no "tener cada píxel como dato". `MediaRecorder` + `ffmpeg` del lado servidor va a dar resultados muchísimo mejores que comprimir frame por frame en JSON con gzip.

---

## 6. Resumen: qué camino elegir

| Necesidad | Solución recomendada |
|---|---|
| Acceso crudo a píxeles para procesar/analizar frame a frame | `getUserMedia` + `canvas.getImageData` + `CompressionStream`/`pako` → JSON |
| Guardar/transmitir video liviano y de buena calidad | `MediaRecorder` (webm nativo) |
| Recodificar/comprimir video a otro formato o bitrate específico | `ffmpeg.wasm` en el cliente o `ffmpeg` en un backend |
| Procesamiento de píxeles pesado sin trabar la UI | Web Worker + `OffscreenCanvas` |

En la práctica, lo más común es **combinar**: `MediaRecorder` para capturar liviano, y solo usar `getImageData` en frames puntuales donde de verdad necesitás el dato píxel por píxel (por ejemplo para un filtro custom o un análisis de color), sin intentar guardar cada frame de un video entero como JSON.

---

## 7. Grabación de audio, sampling y reproducción (inmediata o solapada)

### 7.1 Pedir el micrófono

Igual que con la cámara, pero con `audio: true`. Podés combinarlo con el video si querés cámara + mic en el mismo stream.

```javascript
async function getMicStream() {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 44100,
    },
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}
```

### 7.2 Grabar con `MediaRecorder` (forma simple)

Para "grabar y guardar/enviar" un clip completo, `MediaRecorder` es lo más directo, igual que con video.

```jsx
import { useRef, useState, useCallback } from "react";

function AudioRecorder({ onRecorded }) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [recording, setRecording] = useState(false);

  const start = useCallback(async () => {
    const stream = await getMicStream();
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      onRecorded?.(blob);
      streamRef.current.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, [onRecorded]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  return (
    <button onClick={recording ? stop : start}>
      {recording ? "Detener" : "Grabar audio"}
    </button>
  );
}
```

### 7.3 Sampling crudo con Web Audio API (acceso muestra a muestra)

Si necesitás las muestras de audio en crudo (equivalente a `getImageData` pero para sonido), usás `AudioContext` + `AudioWorkletNode` (recomendado, corre en su propio hilo) o el viejo `ScriptProcessorNode` (deprecado pero más simple para prototipos).

**Opción moderna: `AudioWorklet`**

```javascript
// audio-processor.js (se carga como módulo aparte)
class SampleGrabber extends AudioWorkletProcessor {
  process(inputs) {
    const channelData = inputs[0][0]; // Float32Array, valores entre -1 y 1
    if (channelData) {
      // mandamos las muestras al hilo principal
      this.port.postMessage(channelData);
    }
    return true; // seguir procesando
  }
}
registerProcessor("sample-grabber", SampleGrabber);
```

```javascript
async function startSampling(stream, onSamples) {
  const audioCtx = new AudioContext();
  await audioCtx.audioWorklet.addModule("audio-processor.js");

  const source = audioCtx.createMediaStreamSource(stream);
  const grabber = new AudioWorkletNode(audioCtx, "sample-grabber");

  grabber.port.onmessage = (e) => {
    const samples = e.data; // Float32Array, ej. 128 muestras por callback
    onSamples(samples);
  };

  source.connect(grabber);
  return audioCtx;
}
```

Cada `Float32Array` que llega representa un bloque pequeño de muestras (normalmente 128), con valores normalizados entre -1 y 1. Para guardarlas como JSON con compresión, el mismo patrón de la sección 4 sirve: acumulás los bloques, los convertís a `Uint8Array`/`Int16Array` (cuantizando si querés reducir tamaño) y comprimís con `CompressionStream` o `pako`.

```javascript
function float32ToInt16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}
```

Convertir de Float32 (32 bits) a Int16 (16 bits, formato PCM estándar) ya reduce el tamaño a la mitad antes incluso de comprimir.

### 7.4 Reproducir inmediatamente (baja latencia)

Para reproducir apenas capturás algo (por ejemplo un walkie-talkie o monitor en vivo), usás el mismo `AudioContext` y armás un buffer a partir de las muestras.

```javascript
function playSamplesImmediately(audioCtx, float32Samples, sampleRate = 44100) {
  const buffer = audioCtx.createBuffer(1, float32Samples.length, sampleRate);
  buffer.copyToChannel(float32Samples, 0);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(); // arranca ya, sin esperar
  return source;
}
```

Para una reproducción realmente en vivo (streaming continuo, no un chunk aislado), lo más prolijo es encolar buffers consecutivos usando `audioCtx.currentTime` como referencia, para que no queden huecos ni se pisen:

```javascript
let nextStartTime = 0;

function scheduleChunk(audioCtx, float32Samples, sampleRate = 44100) {
  const buffer = audioCtx.createBuffer(1, float32Samples.length, sampleRate);
  buffer.copyToChannel(float32Samples, 0);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);

  const startAt = Math.max(audioCtx.currentTime, nextStartTime);
  source.start(startAt);
  nextStartTime = startAt + buffer.duration;
}
```

### 7.5 Reproducir solapado (varios sonidos a la vez)

La clave para solapar audio (por ejemplo un efecto de sonido sobre una grabación que ya está sonando) es **no reusar un solo `<audio>` element**, sino crear un nodo/fuente nueva por cada reproducción y conectarlos todos al mismo `destination`. El `AudioContext` mezcla automáticamente todo lo que esté conectado.

```javascript
class SoundMixer {
  constructor() {
    this.audioCtx = new AudioContext();
  }

  // reproduce un Blob (ej. resultado de MediaRecorder) superpuesto a lo que ya suena
  async playOverlapped(blob, { volume = 1, when = 0 } = {}) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    const gain = this.audioCtx.createGain();
    gain.gain.value = volume;

    source.connect(gain).connect(this.audioCtx.destination);
    source.start(this.audioCtx.currentTime + when);

    return source; // podés guardarlo para pausarlo/cortarlo después
  }

  stopAll() {
    this.audioCtx.close();
    this.audioCtx = new AudioContext();
  }
}
```

Uso típico en React:

```jsx
const mixerRef = useRef(null);

useEffect(() => {
  mixerRef.current = new SoundMixer();
  return () => mixerRef.current?.stopAll();
}, []);

async function handlePlayEffect(blob) {
  // suena encima de cualquier otra cosa que ya esté reproduciéndose
  await mixerRef.current.playOverlapped(blob, { volume: 0.8 });
}
```

Si en cambio querés mezclar una grabación **en vivo** (mic) con un audio pregrabado sonando al mismo tiempo (ej. hacer "duet" o monitorear tu voz mientras suena una pista), conectás ambas fuentes al mismo `AudioContext`:

```javascript
async function liveMixWithTrack(audioCtx, micStream, trackBuffer) {
  // fuente 1: mic en vivo
  const micSource = audioCtx.createMediaStreamSource(micStream);

  // fuente 2: pista pregrabada
  const trackSource = audioCtx.createBufferSource();
  trackSource.buffer = trackBuffer;

  const merger = audioCtx.createGain(); // actúa como punto de mezcla
  micSource.connect(merger);
  trackSource.connect(merger);
  merger.connect(audioCtx.destination);

  trackSource.start();
}
```

### 7.6 Resumen audio

| Necesidad | Herramienta |
|---|---|
| Grabar un clip completo y guardarlo/subirlo | `MediaRecorder` |
| Acceso muestra a muestra (sampling crudo) | `AudioWorkletNode` (o `ScriptProcessorNode` para prototipos rápidos) |
| Reproducir apenas se captura algo | `AudioBufferSourceNode.start()` sin delay, o encolado con `currentTime` |
| Reproducir varios sonidos superpuestos | Múltiples `AudioBufferSourceNode` conectados al mismo `AudioContext.destination` |
| Reducir tamaño de las muestras antes de comprimir/guardar | Cuantizar Float32 → Int16 (PCM) antes de aplicar gzip/`pako` |

## 8. Serializar audio a JSON (base64 directo o vía ffmpeg)

Hay dos caminos según qué tan "crudo" necesites el audio dentro del JSON.

### 8.1 Base64 directo (sin re-codificar, más simple)

Tomás el `Blob` que te da `MediaRecorder` (o el buffer PCM de la sección 7.3) y lo metés en el JSON tal cual, codificado en base64. No hay pérdida extra de calidad más allá de la que ya tenga el formato original (`webm/opus` por ejemplo).

```javascript
async function audioBlobToJSON(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    mimeType: blob.type,       // ej. "audio/webm;codecs=opus"
    encoding: "base64",
    sizeBytes: bytes.length,
    payload: base64,
  };
}
```

Para reconstruir el audio reproducible desde ese JSON:

```javascript
function jsonToAudioBlob(jsonObj) {
  const binary = atob(jsonObj.payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: jsonObj.mimeType });
}

// reproducir directo
function playFromJSON(jsonObj) {
  const blob = jsonToAudioBlob(jsonObj);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
}
```

> Nota: si el blob ya viene comprimido (webm/opus, que es un códec con compresión con pérdida), normalmente **no** conviene aplicarle además `gzip`/`pako` — el audio comprimido ya tiene entropía alta y gzip casi no reduce más el tamaño, solo agrega overhead de CPU. Gzip/`pako` sí vale la pena si estás guardando PCM crudo (Int16/Float32 sin comprimir), como en la sección 4 y 7.3.

Ejemplo combinando cuantización PCM + gzip para muestras crudas (siguiendo el patrón de la sección 4):

```javascript
async function pcmSamplesToJSON(float32Samples, sampleRate) {
  const int16 = float32ToInt16(float32Samples); // de la sección 7.3

  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(new Uint8Array(int16.buffer));
  writer.close();
  const compressedBuffer = await new Response(cs.readable).arrayBuffer();

  let binary = "";
  new Uint8Array(compressedBuffer).forEach((b) => (binary += String.fromCharCode(b)));

  return {
    format: "pcm16-gzip",
    sampleRate,
    channels: 1,
    sampleCount: int16.length,
    encoding: "base64",
    payload: btoa(binary),
  };
}
```

### 8.2 Vía ffmpeg (recodificar/comprimir antes de meter a JSON)

Tiene sentido cuando querés:
- **Reducir bitrate/tamaño** antes de guardar (ej. bajar a mono 16kHz para voz).
- **Normalizar el formato** (todo a un mismo códec/sample rate, sin importar qué grabó el navegador).
- **Extraer PCM crudo** desde un contenedor comprimido para después procesarlo muestra a muestra.

**Con `ffmpeg.wasm` en el navegador**, antes de armar el JSON:

```javascript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

async function compressAudioWithFFmpeg(blob) {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  await ffmpeg.writeFile("input.webm", await fetchFile(blob));

  // recodifica a opus mono 16kHz, bitrate bajo — ideal para voz
  await ffmpeg.exec([
    "-i", "input.webm",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "libopus",
    "-b:a", "24k",
    "output.opus",
  ]);

  const data = await ffmpeg.readFile("output.opus");
  return new Blob([data.buffer], { type: "audio/ogg; codecs=opus" });
}

// luego este blob más chico se pasa por audioBlobToJSON() de 8.1
async function compressedAudioToJSON(blob) {
  const compressed = await compressAudioWithFFmpeg(blob);
  return audioBlobToJSON(compressed);
}
```

**Con `ffmpeg` en un backend** (recomendado si el celu es de gama baja, para no cargar el wasm de ~30MB):

```javascript
// endpoint recibe el blob crudo (webm) y devuelve el JSON ya listo
app.post("/api/audio-to-json", upload.single("audio"), async (req, res) => {
  const inputPath = req.file.path;
  const outputPath = `${inputPath}.opus`;

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("libopus")
      .audioBitrate("24k")
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });

  const buffer = fs.readFileSync(outputPath);
  res.json({
    mimeType: "audio/ogg; codecs=opus",
    encoding: "base64",
    sizeBytes: buffer.length,
    payload: buffer.toString("base64"), // Node hace esto nativo, sin loop manual
  });
});
```

En Node, `buffer.toString("base64")` reemplaza todo el loop manual de `btoa`/`String.fromCharCode` que hace falta en el navegador — es más simple y no tiene el límite de tamaño de stack que puede dar `String.fromCharCode(...bytes)` con arrays grandes.

### 8.3 Resumen: base64 directo vs ffmpeg

| Situación | Recomendación |
|---|---|
| Ya grabaste con `MediaRecorder` y solo necesitás guardarlo tal cual | Base64 directo (8.1), sin gzip extra |
| Tenés muestras PCM crudas (Float32/Int16) sin comprimir | Cuantizar + gzip/`pako` antes de base64 |
| Necesitás bajar tamaño/bitrate o normalizar formato | `ffmpeg` (wasm en cliente o backend) antes de base64 |
| Celu de gama baja, no querés cargar ~30MB de wasm | `ffmpeg` en backend, no en el navegador |

## 9. Consideraciones específicas para celulares

- **Batería/CPU**: leer píxeles de frames a alta resolución consume mucho; bajá resolución (`width: 640`) si no necesitás full HD.
- **Orientación**: el stream puede rotar según cómo se sostiene el celu; escuchá `screen.orientation.onchange` si dibujás algo dependiente de orientación.
- **Safari iOS**: soporte parcial de `CompressionStream` en versiones viejas; verificá con `"CompressionStream" in window` y hacé fallback a `pako`.
- **Permisos**: siempre pedí el permiso dentro de un gesto del usuario (click/tap), Safari lo bloquea si se llama automáticamente al cargar la página.
