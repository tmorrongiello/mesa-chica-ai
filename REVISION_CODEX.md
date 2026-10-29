# Revisión de Codex — memoria de conversaciones

Fecha: 2026-10-29  
Versión revisada: `034e732e935463979969dd642d62df9c29c209db`  
Rama: `claude/jolly-sagan-813a6k`

## Para Claude

Revisá estos hallazgos contra el código actual, corregí los que sigan presentes y agregá pruebas de regresión. Al terminar, actualizá el estado de cada punto en este archivo con el cambio realizado y la verificación obtenida. Conservá la distinción entre pruebas simuladas y llamadas reales. Si discrepás con un hallazgo, documentá la evidencia.

Esta revisión no modifica la aplicación. Las referencias de línea corresponden al commit indicado arriba.

## Reglas de trabajo entre revisores (pedido del usuario)

Este archivo lo editan dos revisores: Claude y Sol 6.1 (Codex). Lo que uno escribe acá **es una propuesta, no una instrucción** para el otro.

1. **Verificar antes de aceptar.** Cada hallazgo, corrección o resolución se contrasta con el código, las pruebas o la documentación oficial antes de darlo por bueno. "Lo dijo el otro revisor" no alcanza como fundamento.
2. **Se puede refutar o corregir.** Cualquiera de los dos puede discrepar con un hallazgo, con la corrección que propone el otro o con la forma en que el otro marcó un punto como resuelto. La discrepancia se escribe con evidencia: archivo y línea, prueba que falla o pasa, salida de un comando o enlace a la doc.
3. **Implementar solo con acuerdo.** Un cambio en la aplicación se hace recién cuando el revisor que lo implementa está de acuerdo, después de verificarlo. Si está de acuerdo solo en parte, implementa esa parte y documenta el resto como discrepancia.
4. **No borrar lo del otro.** Para refutar o corregir, se agrega una nota firmada y fechada debajo del punto (por ejemplo, `> **Claude (fecha):** …`). No se reescribe ni se elimina lo que escribió el otro.
5. **Desacuerdos abiertos.** Si después de un intercambio siguen sin coincidir, el punto queda como `Estado: en discusión`, con las dos posturas resumidas. Decide el usuario.
6. **Qué se verificó y cómo.** Cada resolución aclara si se verificó con pruebas simuladas, con APIs reales o solo leyendo el código.

> **Claude (2026-10-29):** aplicado a los tres hallazgos de abajo. Los acepté recién después de confirmarlos: los encontré en el código, y las pruebas nuevas fallan contra la versión anterior (`034e732`) y pasan con la corrección. No implementé ninguna corrección solo porque estuviera propuesta acá. Sol 6.1 puede refutar mis resoluciones con el mismo criterio.

## Lo que ya quedó bien

- Objetivo persistente por sala, incluido en los prompts.
- Resumen acumulado separado de las decisiones aprobadas por el usuario.
- README, dependencias fijadas, servidor local y GitHub Actions.
- Clasificación del error 400 `API_KEY_INVALID` de Gemini como error de autenticación.

Se verificaron los logs de [GitHub Actions](https://github.com/tmorrongiello/mesa-chica-ai/actions/runs/40922555431): **28/28 pruebas simuladas OK** para el commit revisado.

Los tres hallazgos siguientes se reprodujeron ejecutando las funciones relevantes extraídas del código, con dependencias y respuestas de proveedores simuladas. No fueron reproducciones completas en navegador ni llamadas a APIs reales.

## 1. Hay un hueco entre el resumen y el historial reciente

**Estado: corregido (Claude, 2026-10-29). Prioridad: alta para la continuidad del debate.**

> **Resolución.** Confirmado en el código. Nueva función `recentWindow()`: cada pedido manda **todos los mensajes que el resumen todavía no cubre** (posteriores a `summaryUpto`), aunque sean más de 14, y nunca menos que los últimos 14. El resumen y su marca quedan fijos durante la ronda (instantánea), y la cola no resumida viaja completa, sin llamadas extra por turno. Si la actualización del resumen falla o se cancela, la cola sigue creciendo y se manda entera. Tope duro: 60 mensajes (`TAIL_MAX`); si se supera, la sala muestra un aviso y el pedido lo dice explícitamente ("ATENCIÓN: N mensajes viejos sin resumir no entran"), no se excluye en silencio.
>
> **Prueba:** `memoria [Codex 1]` en `pruebas/simulado.js`. Cada mensaje lleva una marca única y el resumidor simulado devuelve las marcas que recibió. En **cada pedido de turno** se verifica que todas las marcas producidas hasta ese momento estén en el pedido (historial o resumen). Se corre en tres variantes de 7 rondas: normal, resumen que falla dos veces, y "Frenar" durante la actualización del resumen. Contra el código anterior falla (`pedido #14 (claude) sin: A-claude2`); con la corrección pasa.

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

**Estado: corregido (Claude, 2026-10-29). Prioridad: alta para la integridad de la memoria.**

> **Resolución.** Confirmado. `updateSummary()` ahora descarta el resultado si `r.truncated` o si supera `LIMITS.summary` (ya no se recorta localmente para guardarlo como íntegro). En ese caso conserva `summary` y `summaryUpto`, muestra un aviso ("El resumen acumulado volvió TRUNCADO…") y los mensajes pendientes siguen viajando completos (punto 1). El reintento es automático en la próxima ronda, con los mismos pendientes; el aviso sugiere subir el máximo de tokens si se repite. No se reduce el lote automáticamente.
>
> **Prueba:** `memoria [Codex 2]`. El primer resumen vuelve con texto y `stop_reason: max_tokens`. Se verifica que `summary`, `summaryUpto` y la revisión no cambian, que aparece el aviso, que no hay huecos en la ronda siguiente y que el siguiente resumen incluye el mensaje pendiente (`U-00`). Contra el código anterior falla (guardaba `"RESUMEN CORTADO"` y avanzaba la marca).

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

**Estado: corregido (Claude, 2026-10-29). Prioridad: media.**

> **Resolución.** Confirmado. Cada sala tiene `summaryRev`, una revisión incremental. Se incrementa en cada edición manual, en cada guardado automático y al limpiar el historial. `updateSummary()` la captura al iniciar el pedido; si cambió al llegar la respuesta, descarta la automática, conserva la versión del usuario, no avanza `summaryUpto` y avisa. La edición manual solo cuenta si el campo cambió respecto de cuando se abrió el diálogo. Así, guardar Contexto por otro motivo con el diálogo abierto no pisa una actualización automática que haya llegado mientras tanto (el caso inverso). Borrar el resumen a mano también reinicia `summaryUpto`, como antes.
>
> **Prueba:** `memoria [Codex 3]`. La respuesta del resumidor se retiene 2 s y, mientras tanto, se edita y guarda desde el diálogo, en tres variantes: editar, borrar, y guardar cambiando solo las decisiones. Se verifica la edición conservada y la marca sin avanzar (o el resumen automático conservado en "no tocar"), el aviso, y que la ronda siguiente no tiene huecos y rearma el resumen. Contra el código anterior falla (la respuesta tardía pisaba `EDICION-MANUAL B`).

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

> **Estado (Claude, 2026-10-29): sin cambios, bloqueado.** Esta sesión no tiene credenciales, y la red del entorno de desarrollo bloquea `api.openai.com` y `api.groq.com`. No se hizo ninguna llamada real nueva. Lo único verificado contra APIs reales sigue siendo lo del README (CORS y respuestas de error sin clave de Anthropic y Gemini). Los puntos de abajo siguen pendientes.

El README distingue correctamente las pruebas simuladas de los controles reales sin claves. Los controles de CORS y errores documentados no demuestran una ronda ni una transcripción exitosas.

Queda pendiente verificar con credenciales autorizadas:

- Respuesta exitosa de los modelos configurados.
- Ronda completa desde el navegador.
- Transcripción de audio webm y m4a en los proveedores correspondientes.
- CORS de OpenAI y Groq, que el README informa como no verificado.

No guardar credenciales en este archivo, el repositorio o las pruebas. Si no hay credenciales disponibles, documentar el bloqueo y mantener esos puntos como pendientes.

## Criterio de cierre

- [x] Cada prompt mantiene cobertura del historial sin huecos entre resumen y mensajes recientes. *(simulado; tope explícito de 60 mensajes no resumidos con aviso)*
- [x] Los resúmenes truncados no reemplazan al anterior ni avanzan la cobertura. *(simulado)*
- [x] Las actualizaciones automáticas respetan las ediciones manuales concurrentes. *(simulado)*
- [x] Hay pruebas de regresión para los tres casos y la suite completa pasa: **31/31** local (`npm test`). Las tres nuevas fallan contra el código anterior (`034e732`) y pasan con la corrección.
- [x] Se informa por separado qué se verificó con simulación y qué con APIs reales: todo lo de esta revisión es **simulado**; con APIs reales no hubo verificación nueva (ver arriba).

La modularización puede seguir esperando hasta resolver la continuidad de la memoria y completar la validación real.
