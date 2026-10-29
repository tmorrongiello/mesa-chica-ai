# Mesa Chica AI

Herramienta personal: mandás una idea por texto o audio y tres roles de IA (Diseño y UX, Arquitectura, Datos y lógica; por defecto Gemini, Claude y ChatGPT) debaten por turnos leyéndose entre sí, con una síntesis neutral al final. Hay salas por proyecto, cada una con objetivo, contexto, decisiones vigentes, glosario y resumen acumulado.

- **La app es un solo archivo: `index.html`.** Sin frameworks, sin backend, sin build. Se puede abrir desde GitHub Pages o desde cualquier servidor estático.
- Las claves de API van directo del navegador a cada proveedor. Por defecto quedan solo en memoria.
- `package.json`, `pruebas/` y `.github/` sirven **solo para las pruebas**. La app no los necesita.

## Usarla

### En GitHub Pages
1. En GitHub: **Settings → Pages**.
2. En **Source**, elegí **Deploy from a branch**, la rama y la carpeta `/ (root)`. Tocá **Save**.
3. Abrí `https://<usuario>.github.io/mesa-chica-ai/`.
4. Tocá la llave, cargá al menos una clave de API y tocá **Aplicar**.

Una suscripción de chat (Claude Pro, ChatGPT Plus, etc.) no incluye API: hacen falta claves de API con crédito.

### En tu computadora
```bash
npm start
```
Abre un servidor en `http://localhost:8080`. Hace falta `localhost` o HTTPS para que funcione el micrófono. `PORT=3000 npm start` cambia el puerto. El servidor no tiene dependencias.

## Pruebas

```bash
npm ci
```
```bash
npx playwright install chromium
```
```bash
npm test
```

`pruebas/simulado.js` levanta la app y **simula** las cuatro APIs con `page.route` de Playwright. El micrófono se simula con Chromium (`--use-fake-device-for-media-stream`). **No usa claves reales ni hace llamadas reales.** En GitHub Actions corre igual (`.github/workflows/pruebas.yml`) en cada push y PR.

Nunca pongas claves reales en las pruebas ni en el repo.

## Estado de verificación

### Simulado: 34/34 pruebas OK (`npm test`)
Cubre lógica e interfaz con respuestas imitadas:
- debate, rotación y síntesis;
- aislamiento de salas, frenar y respuestas tardías;
- errores (401, 400/404, 429 con Retry-After, 5xx, vacía, bloqueada, truncada, red, timeout);
- respaldo entre proveedores;
- almacenamiento dañado, lleno o bloqueado;
- migración de claves;
- importar/exportar e intentos de HTML malicioso;
- teclado, accesibilidad y celular;
- audio;
- conversación larga (objetivo + resumen acumulado);
- memoria: en cada pedido no hay huecos entre resumen e historial (incluso si el resumen falla o se cancela), los resúmenes truncados se descartan, las ediciones manuales no se pisan, y las salas largas o importadas se resumen en lotes desde el más viejo sin saltear mensajes.

**Estas pruebas no confirman** que los modelos, CORS ni los formatos de audio funcionen contra los proveedores reales.

### Real: verificado sin claves (29/10/2026)
| Proveedor | Qué se verificó | Resultado |
|---|---|---|
| Anthropic | Preflight CORS para `/v1/messages` con los headers que usa la app | ✅ Permitido (`allow-origin: *`, acepta `anthropic-dangerous-direct-browser-access`) |
| Anthropic | POST con clave inválida | ✅ 401 `authentication_error`, con CORS; expone todos los headers (`Retry-After` legible) |
| Gemini | Preflight CORS para `generateContent` con `x-goog-api-key` | ✅ Permitido |
| Gemini | POST con clave inválida | ⚠️ Responde **400** `API_KEY_INVALID`, no 401. Corregido: ahora se muestra como clave rechazada. |
| OpenAI | — | ⛔ Sin verificar: la red del entorno de desarrollo bloqueó `api.openai.com` |
| Groq | — | ⛔ Sin verificar: la red del entorno de desarrollo bloqueó `api.groq.com` |

### Real: pendiente (necesita claves; hacerlo a mano)
| Prueba | Claude | OpenAI | Gemini | Groq |
|---|---|---|---|---|
| El modelo por defecto existe y responde (ronda completa) | ☐ | ☐ | ☐ | ☐ (respaldo) |
| CORS desde el navegador con clave válida | ☐ | ☐ | ☐ | ☐ |
| Transcripción con audio de Chrome (`webm`) | — | ☐ | ☐ | ☐ |
| Transcripción con audio de Safari iOS (`m4a`) | — | ☐ | ☐ | ☐ |
| `gemini-3.5-transcribe` (opción, API sin verificar) | — | — | ☐ | — |

Para completarla:
1. Abrí la app publicada.
2. Cargá las claves solo en memoria, sin activar "Recordar".
3. Mandá una idea corta.
4. Grabá un audio de 10 segundos.
5. Anotá los resultados acá.

Si algo falla, el aviso rojo de la app trae el código y el mensaje del proveedor, sin claves.
