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
