# CAMBIOS — Mesa Chica AI

## v3 — sesión 2026-10-29

Archivo nuevo: `index.html` (reemplaza a `mesa-chica-ai.html`, que queda como referencia de la v2).

### Bloque 1 — HTML + CSS
- CSS propio en lugar de Tailwind CDN. Sin scripts ni fuentes de terceros: fuentes del sistema.
- Misma estética oscura; colores por **rol** (asiento), no por proveedor.
- Viewport sin `maximum-scale` ni `user-scalable=no`; `interactive-widget=resizes-content` para el teclado virtual; `safe-area-inset-bottom`.
- Diálogos nativos (`<dialog>`) para Salas, Contexto (con "Decisiones vigentes"), Conexiones API, Ajustes y Exportar/Importar.
- "Bóveda" pasa a llamarse "Conexiones API", sin promesas de seguridad.
- `aria-label` en botones de íconos, `label`/`for` en todos los campos, región `aria-live` solo para estados.
- `prefers-reduced-motion` respetado.

### Bloque 2 — JS núcleo
- Adaptadores: Claude (Messages API + `anthropic-dangerous-direct-browser-access`), OpenAI (Responses API: `instructions` + `input` + `max_output_tokens`, parseo de `output[].content[]` tipo `output_text`, `status: incomplete` = truncado), Gemini (`generateContent` v1beta, clave en `x-goog-api-key`), Groq (chat compatible OpenAI).
- Transcripción: Groq/OpenAI (`/audio/transcriptions`) y Gemini (`generateContent` con audio inline). Nombre de archivo según el contenedor real (mp4 → `.m4a`), prompt de glosario recortado para el límite de 224 tokens de Groq, límites de tamaño por proveedor.
- Defaults: `claude-sonnet-5-5`, `gpt-6.1-sol`, `gemini-3.8-flash`, `openai/gpt-oss-120b`; transcripción `whisper-large-v3-turbo`, `gpt-4o-transcribe`, `gemini-3.5-flash-lite`. Todo editable.
- Errores tipados: cancelación, timeout, red/CORS, auth (401/403), inválida (400/404), rate (429), proveedor (5xx), vacía, bloqueada, truncada. Claves redactadas en todo texto de error.
- Timeout por pedido unido a la señal de "Frenar" (`AbortController`). Reintentos solo 429/5xx; `Retry-After` > 10 s → corta y avisa.
- Respaldo: orden Claude → OpenAI → Gemini → Groq, sin repetir proveedor por turno; "si falta clave" y "si falla la llamada" por separado.
- Persistencia protegida: lecturas, `JSON.parse` y escrituras con try/catch; validación de salas (ids únicos, mensajes, campos); copia del original dañado antes de escribir encima, o bloqueo de escritura si no se puede.
- Migración: `mesachica_keys_v1` → solo memoria y se borra la copia; `mesachica_models_v1`/`settings_v1` → `mesachica_config_v3` (modelos viejos por defecto → nuevos). Salas siguen en `mesachica_projects_v1`.

### Bloque 3 — JS interfaz
- Salas aisladas: cada ronda captura sala, contexto, decisiones, historial, claves y configuración al arrancar; `appendMessage(projectId, msg)` pinta solo si esa sala está abierta. Borrador independiente por sala.
- No se puede borrar ni limpiar una sala con ronda, grabación o transcripción en curso (se explica por qué).
- "Frenar" aborta el pedido en curso, no arranca más turnos e ignora respuestas tardías (id por operación); se puede empezar otra ronda al instante.
- Rotación de quién arranca + SÍNTESIS neutral final; sin síntesis, el último rol cierra con propuesta/desacuerdos/próximo paso. "Decisiones vigentes" por sala en cada prompt.
- Tarjeta emulada: ROL + "EMULADO" + proveedor/modelo real.
- Audio: estados inactivo/pidiendo permiso/grabando/transcribiendo, doble clic bloqueado, sesión propia por grabación, micrófono siempre liberado, límites de duración y tamaño, audio conservado si falla (reintentar/descargar/descartar), cancelar transcripción, envío automático apagado por defecto.
- Diálogos con foco inicial, trampa de foco, Escape y devolución de foco. Toasts en vez de `alert`. Botón "Nuevos mensajes" si estás leyendo arriba.
- Exportar Markdown (copiar con descarga de respaldo) y JSON sin claves; importar JSON validado con vista previa y Agregar/Reemplazar.

### Ajustes después de probar
- Toasts arriba (debajo de la barra de operación) para no tapar el panel de audio ni el botón "Frenar".
- Botones del panel de audio más cortos (entran en una fila a 390 px; mantienen `aria-label` completo).

### Verificación (proveedores SIMULADOS, sin llamadas reales)
`node pruebas/simulado.js` — Playwright + Chromium, `page.route` para las 4 APIs y `--use-fake-device-for-media-stream` para el micrófono. 26/26 OK:
- Carga limpia a 390 px (sin scroll horizontal, sin recursos externos, viewport sin bloqueo de zoom).
- Ronda completa: orden, cada turno lee los anteriores, síntesis, rotación; clave de Gemini en header; header de Anthropic; cuerpo de Responses API; decisiones y "(a verificar)" en el prompt.
- Síntesis apagada → el último cierra con propuesta/desacuerdos/próximo paso.
- Cambio de sala durante debate y durante transcripción; borradores independientes.
- No deja borrar/limpiar sala con operación activa.
- Frenar + empezar otra; respuesta tardía ignorada; no arranca más turnos.
- Doble clic / Enter repetido: un solo envío.
- 401, 404, 500 (con reintento), 429 con Retry-After 1 s (espera) y 60 s (corta y avisa), vacía, bloqueada, truncada (Claude y OpenAI), red/CORS, timeout de 10 s.
- Respaldo por clave faltante (EMULADO + proveedor/modelo real), apagado, y por fallo sin repetir proveedor.
- Storage lleno (aviso persistente, sin repetir llamadas), bloqueado, JSON inválido, datos parcialmente dañados (copia + recuperación), dañados sin poder copiar (no pisa).
- Migración de claves v1 (solo memoria, copia borrada, aviso) y de modelos/ajustes viejos.
- Recordar claves on/off, Borrar claves.
- Import con HTML malicioso (nada se ejecuta), Agregar con id repetido, Reemplazar con confirmación; export JSON/MD sin claves.
- Teclado: Enter/Shift+Enter/IME, diálogos (foco inicial, trampa, Escape, devolución), todos los botones y campos con nombre; celular: Enter = salto, botón "Nuevos mensajes" sin forzar scroll.
- Audio: grabar/transcribir (nombre de archivo y modelo correctos), micrófono liberado, permiso denegado, fallo → conservar/reintentar/descargar, cancelar, corte por duración, autoenvío y su bloqueo con ronda activa.

### Limitaciones pendientes
- **No se probó ninguna llamada real.** IDs de modelo según la verificación del usuario (29/10/2026). Si algo falla en la prueba real, revisar contra la doc oficial.
- `gemini-3.5-transcribe` queda como opción editable sin verificar su API.
- No verificado en vivo: que OpenAI Responses y Groq acepten CORS desde el navegador, y que Gemini acepte audio `webm`/`mp4` inline.
- `Retry-After` solo se puede leer si el proveedor lo expone por CORS; de Gemini se lee `RetryInfo` del cuerpo.
- El corte por tamaño de audio usa la misma lógica que el de duración pero no tiene prueba automática.
- Solo se probó en Chromium; falta Safari iOS (graba `audio/mp4` → se manda como `.m4a`).
- Una sola ronda a la vez en toda la app (podés grabar/transcribir en paralelo).
- En GitHub Pages, todas las páginas de `tmorrongiello.github.io` comparten origen y `localStorage`.

## v3.1 — sesión 2026-10-29 (revisión externa)

Prioridades pedidas: validar APIs reales, sostener el contexto en debates largos, hacer reproducibles las pruebas y evaluar si conviene modularizar.

### Contexto en debates largos
- **Objetivo de la sala**: campo nuevo, editable. Si está vacío, se completa con el primer mensaje. Va en cada prompt.
- **Resumen acumulado**: cuando hay mensajes que ya no entran en los últimos 14, al final de la ronda se hace una llamada extra que los incorpora al resumen anterior. Lo escribe la IA y tiene tres secciones: pedido del usuario, propuestas de los modelos y lo que queda abierto. Se puede ver y editar en Contexto.
- En los prompts quedan secciones separadas: objetivo, contexto, decisiones vigentes (aprobadas por el usuario) y resumen acumulado (propuestas, no decisiones). Ni la síntesis ni el resumen tocan las decisiones.
- "Limpiar historial" borra también el resumen. El Markdown exportado incluye objetivo y resumen.

### Corrección encontrada contra la API real
- Gemini responde **400 `API_KEY_INVALID`** (no 401) cuando la clave es inválida. Antes la app lo mostraba como "ID de modelo inválido"; ahora dice "Clave rechazada".

### Reproducibilidad
- `README.md`: cómo usar la app, cómo correr las pruebas y estado de verificación (simulado vs. real).
- `package.json` + `package-lock.json` (Playwright 1.63.0, solo para pruebas), `.gitignore`.
- `pruebas/servidor.js`: servidor estático sin dependencias (`npm start`).
- `.github/workflows/pruebas.yml`: corre `npm test` en cada push y PR, sin claves.

### Verificación
- **Simulada:** 28/28 OK. Se agregaron dos pruebas: el 400 de clave inválida de Gemini, y una conversación de 6 rondas / 30 mensajes que comprueba objetivo fijo, resumen encadenado que cubre exactamente lo que salió de la ventana, decisiones intactas y solo 14 mensajes en el historial reciente.
- **Real (sin claves):** CORS y respuesta de error de Anthropic y Gemini. OpenAI y Groq no se pudieron verificar: la red del entorno de desarrollo bloquea `api.openai.com` y `api.groq.com`. Detalle en README.
- **Real (con claves): no se hizo.** Queda la tabla en el README para completarla a mano.

### Modularizar: evaluación (no aplicado)
- Opción sin build: separar en `js/proveedores.js`, `js/persistencia.js`, `js/debate.js`, `js/interfaz.js` y `css/estilos.css`, cargados como módulos ES nativos. GitHub Pages los sirve igual.
- A favor: el núcleo (proveedores, validación, respaldo) se podría probar con `node --test`, sin navegador.
- En contra: se pierde "un solo archivo para copiar". Abrirlo con doble clic (`file://`) deja de funcionar con módulos, aunque el micrófono ya requería `http(s)`.
- Recomendación: hacerlo recién después de completar la verificación real.

## v3.2 — sesión 2026-10-29 (correcciones de REVISION_CODEX.md)

Los tres hallazgos de la revisión se confirmaron en el código y se corrigieron. Detalle y estado en `REVISION_CODEX.md`.
1. **Hueco entre resumen e historial:** cada pedido manda todo lo que el resumen no cubre (mínimo 14 mensajes; tope de 60 con aviso explícito). El resumen queda fijo durante la ronda.
2. **Resumen truncado:** se descarta, se conserva el anterior y la marca de cobertura no avanza.
3. **Edición manual concurrente:** revisión incremental del resumen (`summaryRev`); una respuesta tardía no pisa lo que editaste o borraste. Guardar Contexto sin tocar el resumen tampoco pisa una actualización automática.

Verificación: **31/31 simuladas.** Las tres pruebas nuevas fallan contra el código anterior y pasan con el nuevo. Sin verificación nueva con APIs reales: no hay claves y la red de la sesión bloquea OpenAI/Groq.
