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
