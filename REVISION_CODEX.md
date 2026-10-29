# Revisión de Codex — memoria de conversaciones

Fecha: 2026-10-29  
Versión revisada: `034e732e935463979969dd642d62df9c29c209db`  
Rama: `claude/jolly-sagan-813a6k`

## Para Claude

Revisá estos hallazgos contra el código actual, corregí los que sigan presentes y agregá pruebas de regresión. Al terminar, actualizá el estado de cada punto en este archivo con el cambio realizado y la verificación obtenida. Conservá la distinción entre pruebas simuladas y llamadas reales. Si discrepás con un hallazgo, documentá la evidencia.

Esta revisión no modifica la aplicación. Las referencias de línea corresponden al commit indicado arriba.

## Lo que ya quedó bien

- Objetivo persistente por sala, incluido en los prompts.
- Resumen acumulado separado de las decisiones aprobadas por el usuario.
- README, dependencias fijadas, servidor local y GitHub Actions.
- Clasificación del error 400 `API_KEY_INVALID` de Gemini como error de autenticación.

Se verificaron los logs de [GitHub Actions](https://github.com/tmorrongiello/mesa-chica-ai/actions/runs/40922555431): **28/28 pruebas simuladas OK** para el commit revisado.

Los tres hallazgos siguientes se reprodujeron ejecutando las funciones relevantes extraídas del código, con dependencias y respuestas de proveedores simuladas. No fueron reproducciones completas en navegador ni llamadas a APIs reales.

## 1. Hay un hueco entre el resumen y el historial reciente

**Estado: pendiente. Prioridad: alta para la continuidad del debate.**

Referencias:
- [transcriptText: recorte a los últimos 14 mensajes](https://github.com/tmorrongiello/mesa-chica-ai/blob/034e732e935463979969dd642d62df9c29c209db/index.html#L1709)
- [updateSummary](https://github.com/tmorrongiello/mesa-chica-ai/blob/034e732e935463979969dd642d62df9c29c209db/index.html#L1736)
- [Actualización del resumen después de los turnos](https://github.com/tmorrongiello/mesa-chica-ai/blob/034e732e935463979969dd642d62df9c29c209db/index.html#L1892)

### Reproducción

1. Al terminar una ronda hay 15 mensajes de conversación: m1 a m15.
2. El resumen cubre m1; los 14 restantes son m2 a m15.
3. El usuario agrega m16.
4. El próximo prompt conserva el resumen que cubre m1, pero `transcriptText()` envía m3 a m16.
5. **m2 no está ni en el resumen ni en el historial enviado.**

Con cada respuesta de la ronda salen más mensajes de la ventana. El resumen se actualiza recién al final; durante los turnos puede faltar información. La instantánea `room.summary` también permanece fija durante la ronda. Si el resumen falla o se cancela, el hueco puede crecer.

### Corrección propuesta

Garantizar que cada prompt incluya todos los mensajes todavía no incorporados al resumen, aunque temporalmente sean más de 14; o resumir antes de excluirlos y actualizar la instantánea utilizada por los turnos. Si falla la actualización, no excluir silenciosamente mensajes sin resumir.

No hace falta una llamada extra por cada turno: puede mantenerse el resumen fijo durante la ronda y conservar explícitamente la cola completa no resumida.

### Prueba requerida

Verificar la cobertura **en cada pedido**, no solo al finalizar seis rondas. Introducir una aclaración del usuario en el límite de la ventana y comprobar que permanece como mensaje o como información resumida. Cubrir también fallo y cancelación de la actualización. No alcanza con verificar que hay exactamente 14 mensajes y que existe algún resumen.

## 2. Un resumen truncado reemplaza al válido y avanza la marca de cobertura

**Estado: pendiente. Prioridad: alta para la integridad de la memoria.**

Referencia: [guardado del resultado de updateSummary](https://github.com/tmorrongiello/mesa-chica-ai/blob/034e732e935463979969dd642d62df9c29c209db/index.html#L1755).

### Reproducción

Simular que `callWithFallback()` devuelve:

```js
{ text: 'Resumen cortado…', truncated: true }
```

`updateSummary()` guarda ese texto como resumen y avanza `summaryUpto` hasta el último mensaje del lote. No comprueba `r.truncated`. Los mensajes quedan marcados como resumidos aunque el resumen esté incompleto, y las actualizaciones futuras parten de ese resultado.

### Corrección propuesta

Si el resultado está truncado, conservar el resumen previo y su marca de cobertura. Mostrar un aviso y permitir reintentar; si se decide reducir el lote o ajustar el límite de salida, avanzar la marca solo cuando se obtenga un resultado completo. Revisar también el recorte local por `LIMITS.summary` para no tratar un resultado cortado como íntegro.

### Prueba requerida

Devolver un resumen con texto y `truncated: true`. Comprobar que ni `summary` ni `summaryUpto` se reemplazan, que aparece el aviso y que el siguiente intento sigue incluyendo los mensajes pendientes.

## 3. Una respuesta tardía puede sobrescribir una edición manual del resumen

**Estado: pendiente. Prioridad: media.**

Referencias:
- [Lectura del resumen para el pedido y guardado de la respuesta](https://github.com/tmorrongiello/mesa-chica-ai/blob/034e732e935463979969dd642d62df9c29c209db/index.html#L1753)
- [Edición manual en saveContext](https://github.com/tmorrongiello/mesa-chica-ai/blob/034e732e935463979969dd642d62df9c29c209db/index.html#L2249)

### Reproducción

1. Arranca una actualización automática usando el resumen A.
2. Mientras espera al proveedor, el usuario guarda una corrección B desde Contexto.
3. Llega la respuesta generada a partir de A.
4. `updateSummary()` reemplaza B sin comprobar que hubo una edición.

La comprobación `isLive(op)` valida la operación, pero no detecta cambios manuales en el resumen.

### Corrección propuesta

Capturar una revisión del resumen al iniciar el pedido y compararla antes de guardar. Si el usuario lo editó, conservar su edición y no avanzar la marca de cobertura con una respuesta basada en una versión anterior. Una versión incremental permite detectar incluso ediciones que vuelvan al mismo texto.

### Prueba requerida

Retener la respuesta simulada, editar y guardar el resumen desde el diálogo, y luego liberar la respuesta. Verificar que la edición manual se conserva y que la marca de cobertura sigue siendo coherente. Incluir el caso de borrar el resumen manualmente.

## Validación con proveedores reales: sigue pendiente

El README distingue correctamente las pruebas simuladas de los controles reales sin claves. Los controles de CORS y errores documentados no demuestran una ronda ni una transcripción exitosas.

Queda pendiente verificar con credenciales autorizadas:

- Respuesta exitosa de los modelos configurados.
- Ronda completa desde el navegador.
- Transcripción de audio webm y m4a en los proveedores correspondientes.
- CORS de OpenAI y Groq, que el README informa como no verificado.

No guardar credenciales en este archivo, el repositorio o las pruebas. Si no hay credenciales disponibles, documentar el bloqueo y mantener esos puntos como pendientes.

## Criterio de cierre

- [ ] Cada prompt mantiene cobertura del historial sin huecos entre resumen y mensajes recientes.
- [ ] Los resúmenes truncados no reemplazan al anterior ni avanzan la cobertura.
- [ ] Las actualizaciones automáticas respetan las ediciones manuales concurrentes.
- [ ] Hay pruebas de regresión para los tres casos y la suite completa pasa.
- [ ] Se informa por separado qué se verificó con simulación y qué con APIs reales.

La modularización puede seguir esperando hasta resolver la continuidad de la memoria y completar la validación real.
