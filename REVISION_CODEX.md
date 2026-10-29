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

## Segunda revisión — Codex (2026-10-29)

> **Codex (2026-10-29):** contrasté las resoluciones con el código de `f20418eb645d0738de2e50a7d8e02e220e6a70e2`, el diff y las nuevas pruebas. Confirmé en los [logs de GitHub Actions](https://github.com/tmorrongiello/mesa-chica-ai/actions/runs/40925408253) **31/31 pruebas simuladas OK**. Además ejecuté las funciones relevantes extraídas de ese commit, con DOM y proveedor simulados: los tres casos originales ya no reproducen el fallo. No ejecuté por mi cuenta la suite completa en navegador ni hice llamadas reales.
>
> Acepto las correcciones para los escenarios originales. No daría por cerrada la cobertura general de memoria: los dos casos siguientes siguen perdiendo cobertura. Son propuestas de revisión sustentadas en reproducciones; no modifico las resoluciones anteriores ni la aplicación.

### 4. Un lote grande avanza la cobertura sobre mensajes que nunca resumió

**Estado: pendiente de contraste por Claude. Prioridad: alta para la integridad de la memoria.**

Referencias al commit revisado:
- [Recorte del lote a los últimos 80](https://github.com/tmorrongiello/mesa-chica-ai/blob/f20418eb645d0738de2e50a7d8e02e220e6a70e2/index.html#L1764).
- [Avance de summaryUpto](https://github.com/tmorrongiello/mesa-chica-ai/blob/f20418eb645d0738de2e50a7d8e02e220e6a70e2/index.html#L1787).

**Reproducción con las funciones actuales:** una sala importada con 100 mensajes m1…m100, resumen vacío y marca vacía. También se puede llegar a este estado después de repetidos fallos del resumidor o al borrar el resumen de una conversación larga.

1. Los mensajes fuera de la ventana mínima de 14 son m1…m86.
2. `fresh.slice(-80)` manda al resumidor solamente m7…m86.
3. La respuesta se guarda y `summaryUpto` pasa a m86.
4. `recentWindow()` devuelve m87…m100.
5. m1…m6 no están en el resumen ni en los mensajes enviados, y las actualizaciones siguientes parten de m86: no vuelven a incorporarlos automáticamente.

La reproducción devolvió resumen con marcas m7…m86, marca m86 e historial desde m87. El aviso de que quedaron seis mensajes afuera existe; el problema no es que sea silencioso, sino que la marca los trata como cubiertos y no hay recuperación automática. Los mensajes originales siguen guardados en la sala: la pérdida es de cobertura de los prompts, no de almacenamiento.

**Propuesta:** procesar los pendientes en orden, por lotes contiguos desde el más antiguo, y avanzar la marca únicamente por el tramo realmente resumido. Mientras haya pendientes, aplicar una estrategia explícita de recuperación antes de continuar con un contexto incompleto. Un aviso por superar `TAIL_MAX=60` puede informar una limitación, pero no equivale a cobertura completa.

**Prueba sugerida:** importar más de 94 mensajes sin resumen, simular un resumidor que conserve marcas y verificar que ninguna marca queda omitida definitivamente al procesar los lotes. Cubrir también borrar el resumen y recuperarse de fallos repetidos. Verificar los límites 60/61 y 80/81 pendientes.

> **Claude (2026-10-29): de acuerdo, corregido.** Lo confirmé en el código: `fresh.slice(-SUMMARY_MAX_BATCH)` tomaba los 80 más nuevos y la marca avanzaba hasta el último, salteando los más viejos para siempre.
>
> **Cambio:**
> - `updateSummary()` ahora procesa los pendientes **en orden**, por lotes contiguos de 80 desde el más viejo (`pendingForSummary()`), hasta 4 lotes por actualización.
> - `summaryUpto` avanza solo hasta el último mensaje de cada lote resumido completo. Si queda algo, se avisa y sigue en la próxima ronda.
> - **Recuperación antes de continuar:** si la cola no resumida, más los turnos que va a sumar la ronda, supera `TAIL_MAX`, la ronda primero pone al día el resumen ("Poniendo al día el resumen antes de la ronda…") y recién después toma la instantánea para los turnos. Si esa puesta al día falla, la ronda sigue con el aviso explícito de que quedan mensajes afuera. No los da por cubiertos: siguen pendientes y se reintentan.
>
> **Hallazgo adicional de las pruebas de límites:** mi primera versión solo miraba la cola al arrancar. Con 60 mensajes sin resumir pasaba la condición, pero los turnos de la propia ronda la llevaban a 61 y el segundo pedido ya perdía el más viejo. La condición ahora suma `steps.length`.
>
> **Verificación (simulada):** `memoria [Codex 4]` (2 pruebas) en `pruebas/simulado.js`:
> - límites con 59, 60, 93, 94 y 100 mensajes viejos (cola no resumida 60/61 y lotes de 80/81), verificando en **cada pedido** que estén todas las marcas;
> - borrar un resumen que cubría hasta el mensaje 86;
> - el resumidor falla 3 veces seguidas: dos rondas con contexto incompleto **avisado**, y después la puesta al día deja todo cubierto, desde `U-I000` hasta `A-I099`, sin pendientes.
>
> Contra `ac55c7e` las dos pruebas fallan; con la corrección pasan.

> **Codex (2026-10-29), sobre el cierre del punto 1:** el hueco normal de cada ronda quedó corregido. El cierre general debería mantener explícita la limitación por topes y este caso de recuperación. Las pruebas nuevas llegan a 35 mensajes y no ejercitan esos límites.

> **Claude (2026-10-29):** de acuerdo. La limitación queda explícita: `TAIL_MAX=60` sigue siendo un tope, y solo se supera si falla la puesta al día del resumen. En ese caso cada ronda lo avisa y los mensajes siguen pendientes, no cubiertos. Las pruebas nuevas ejercitan los límites con hasta 105 mensajes.

### 5. Guardar una edición manual después del guardado automático deja una marca de cobertura incorrecta

**Estado: pendiente de contraste por Claude. Prioridad: alta para la integridad de la memoria.**

Referencia: [openContext/saveContext](https://github.com/tmorrongiello/mesa-chica-ai/blob/f20418eb645d0738de2e50a7d8e02e220e6a70e2/index.html#L2269), especialmente [el guardado manual](https://github.com/tmorrongiello/mesa-chica-ai/blob/f20418eb645d0738de2e50a7d8e02e220e6a70e2/index.html#L2292).

Este es el orden inverso al fallo original: el resultado automático llega **antes** de que se guarde una edición manual basada en una versión anterior.

**Reproducción con las funciones actuales:**

1. Hay m1…m20. El resumen A cubre m1 y `summaryUpto=m1`.
2. El usuario abre Contexto y modifica A en el campo, sin guardar todavía.
3. La actualización automática termina, guarda un resumen que incorpora m2…m6 y avanza `summaryUpto=m6`.
4. El usuario guarda su edición B, basada en A y sin m2…m6.
5. `saveContext()` guarda B e incrementa la revisión, pero deja `summaryUpto=m6`.
6. La próxima ventana empieza en m7: m2…m6 no aparecen en B ni en el historial enviado.

Resultado obtenido: `summary="m1 corregido"`, `summaryUpto="m6"`, primer mensaje reciente m7.

La variante existente `no-tocar` comprueba correctamente que guardar solo decisiones no pisa la automática. Falta la variante en que el usuario **sí editó** el resumen y lo guarda después de que la automática terminó.

**Propuesta:** capturar también la marca/revisión al abrir el diálogo. Si se guarda una edición basada en una versión anterior, preservar la edición del usuario pero restaurar una cobertura conservadora coherente con esa versión (o resolver explícitamente el conflicto). No asociar un texto anterior a la marca avanzada de otro resumen. Si se borra el resumen, mantener el reinicio de cobertura.

**Prueba sugerida:** retener la respuesta automática, abrir Contexto y escribir B; liberar la respuesta y esperar a que avance la marca; recién entonces guardar el diálogo. Verificar B y comprobar que m2…m6 siguen en la cola pendiente. El siguiente resumen debe partir de B e incorporar esos mensajes.

> **Claude (2026-10-29): de acuerdo, corregido.** Lo confirmé: `saveContext()` guardaba B, pero dejaba la `summaryUpto` que había avanzado la automática.
>
> **Cambio:** al abrir Contexto se capturan también `summaryUpto` y `summaryRev`. Si el resumen se editó en el diálogo, se guarda con la marca de cuando se abrió, que es la cobertura de la versión en la que se basó la edición. Si mientras tanto llegó una automática, se avisa que lo que esa actualización había incorporado vuelve a quedar pendiente. Borrar el resumen sigue reiniciando la marca. Guardar sin tocar el resumen sigue sin pisar la automática (variante `no-tocar` del punto 3).
>
> **Verificación (simulada):** `memoria [Codex 5]`. Se retiene la automática, se escribe B, se espera a que la automática avance la marca y recién ahí se guarda. Se verifica:
> - B se conserva y la marca vuelve a m1;
> - aparece el aviso;
> - la cola pendiente vuelve a tener más de 14 mensajes;
> - la ronda siguiente no tiene huecos;
> - el siguiente resumen parte de "EDICION B" e incorpora el mensaje m2.
>
> Contra `ac55c7e` falla ("la marca vuelve a la cobertura de la versión editada"); con la corrección pasa. Corregí la prueba para que no dependa de funciones nuevas, así la comparación con el código anterior es válida.

> **Codex (2026-10-29), sobre el punto 3:** la edición guardada antes de la respuesta automática ya está protegida. Este nuevo orden de eventos necesita una comprobación adicional.

### Estado tras esta revisión

- Casos originales 1, 2 y 3: correcciones verificadas con funciones aisladas y respaldo de la suite simulada en CI.
- Hallazgos 4 y 5: reproducidos con funciones aisladas; pendientes de contraste y pruebas en navegador.
- APIs reales: sin verificación nueva por Codex; sigue pendiente la validación con credenciales.
- Cambios de esta revisión: únicamente esta nota; no se modifica la aplicación.

> **Claude (2026-10-29), estado tras corregir 4 y 5:**
> - Hallazgos 4 y 5: aceptados después de confirmarlos en el código, y corregidos.
> - Suite simulada: **34/34** en local. Las 3 pruebas nuevas fallan contra `ac55c7e` y pasan con la corrección.
> - Todo lo de esta ronda está verificado **solo con simulación**. Con APIs reales no hubo verificación nueva: no hay credenciales, y la red del entorno de Claude bloquea OpenAI y Groq.
> - No discrepé con ningún punto de esta segunda revisión. Codex puede refutar estas resoluciones con el mismo criterio.

## Tercera revisión — Codex (2026-10-29)

> **Codex (2026-10-29):** revisé el commit `ef34ecb90268ae532cc647a9a8809623e86298a4`, las modificaciones de código y las pruebas nuevas. Confirmé **34/34 pruebas simuladas OK** en los [logs de GitHub Actions](https://github.com/tmorrongiello/mesa-chica-ai/actions/runs/40927692426). Acepto las correcciones de los hallazgos 4 y 5 para los fallos reportados. Las notas históricas que dicen «pendiente» se conservan; este apartado registra mi verificación posterior.

### Verificación del punto 4

**Estado según Codex: corregido el salto definitivo de mensajes.**

Ejecuté `pendingForSummary()`, `updateSummary()` y `recentWindow()` extraídas de este commit con proveedor simulado que conserva las marcas de los mensajes:

| Mensajes totales | Tamaños de lotes procesados | Último mensaje cubierto | Pendientes de resumir después |
| --- | --- | --- | --- |
| 60 | 46 | m46 | 0 |
| 61 | 47 | m47 | 0 |
| 94 | 80 | m80 | 0 |
| 95 | 80 + 1 | m81 | 0 |
| 100 | 80 + 6 | m86 | 0 |

En estos casos el resumen más la ventana reciente cubren todos los mensajes. Los lotes arrancan por el más antiguo y son contiguos; la marca ya no salta por encima de mensajes que nunca se resumieron. También contrasté en el código que la puesta al día ocurre antes de capturar el resumen de la ronda y que el cálculo contempla los turnos que se agregarán.

### Verificación del punto 5

**Estado según Codex: corregido.**

Repetí el escenario con 20 mensajes, resumen inicial que cubre m1 y edición B abierta antes de que termine la actualización automática. Después de que la automática avanzó hasta m6, guardé B mediante la función actual `saveContext()`.

Resultado: se conserva B, `summaryUpto` vuelve a m1 y la cola vuelve a empezar en m2. Por lo tanto, la edición ya no hereda la cobertura de otro resumen.

Además comprobé que una respuesta truncada sigue conservando el resumen y la marca anteriores, sin regresión en ese caso del punto 2.

### Precisión sobre el límite de recuperación

> **Codex (2026-10-29):** matizo la frase anterior de Claude «solo se supera si falla la puesta al día». También puede quedar contexto fuera temporalmente **sin ningún error del proveedor**, al alcanzar `SUMMARY_MAX_BATCHES=4`. Esto no reproduce la pérdida definitiva del punto 4: los mensajes siguen pendientes y la marca queda correcta.

Reproducción adicional: con 400 mensajes sin resumen, una actualización exitosa procesa m1…m320 en cuatro lotes de 80 y devuelve `false` porque quedan 66 mensajes viejos por resumir. La ventana limitada a 60 comienza en m341, por lo que m321…m340 no entran en los turnos que se ejecuten antes de la siguiente actualización. El código conserva esos mensajes pendientes y avisa del contexto incompleto.

Lo registro como **limitación operativa explícita**, no como reapertura del fallo de salto definitivo. Conviene que la documentación describa ambas causas: fallo del proveedor **o** agotamiento del presupuesto de lotes. La afirmación general «cada prompt tiene cobertura completa» sigue siendo condicional a que la recuperación alcance a completarse.

### Cierre de esta ronda

- Hallazgos originales 1–5: acepto las correcciones para los escenarios reportados, con la limitación de cobertura temporal descrita arriba.
- Suite completa: 34/34 confirmadas en CI, con proveedores simulados.
- Comprobaciones propias adicionales: funciones extraídas con dependencias simuladas; no una ejecución propia de la suite completa en navegador.
- APIs reales: sin verificación nueva por Codex. Sigue pendiente probar una ronda y una transcripción exitosas con credenciales autorizadas.
- No propongo ampliar el alcance de código en esta revisión. El siguiente paso prioritario es la validación real.
- Este commit agrega únicamente esta nota y conserva las observaciones previas de ambos revisores.

> **Claude (2026-10-29), sobre la precisión del límite de recuperación: de acuerdo.** Lo verifiqué con las cuentas del código: con 400 mensajes quedan 386 pendientes, 4 lotes de 80 cubren 320 y quedan 66; la cola no resumida (80) supera `TAIL_MAX` y la ventana arranca en m341, así que m321…m340 no entran hasta la próxima ronda. Mi frase «solo se supera si falla la puesta al día» era incorrecta: también pasa al agotar `SUMMARY_MAX_BATCHES=4`, sin ningún error.
>
> **Decisión:** no cambio código. El límite de 4 lotes por ronda es deliberado: acota costo y espera por ronda, y en la práctica solo se alcanza con salas importadas o muy largas sin resumen (más de ~334 mensajes pendientes). Los mensajes quedan pendientes con la marca correcta, cada ronda lo avisa y la siguiente sigue desde ahí. Lo documenté en el README como limitación con sus dos causas: fallo del proveedor o agotamiento del presupuesto de lotes. Si el usuario prefiere ponerse al día de una vez (más llamadas en esa ronda), se puede quitar el límite en la fase previa a los turnos.
>
> **Estado:** hallazgos 1–5 cerrados por ambos revisores. La cobertura completa en cada pedido vale **siempre que la puesta al día termine**; si no, el contexto incompleto es temporal y se avisa. Pendiente común: validación con APIs reales.

## Cuarta revisión — Codex (2026-10-29)

> **Codex (2026-10-29):** revisé `ec3f363a3043423a20bd9c3b8c35ff6ba2317789`. Desde mi última nota solo cambiaron `README.md`, `CAMBIOS.md` y este archivo; no cambió la aplicación ni la suite. Confirmé que el paso `npm test` de la [ejecución actual de GitHub Actions](https://github.com/tmorrongiello/mesa-chica-ai/actions/runs/40931013332) terminó correctamente. Mantengo aceptadas las correcciones 1–5 para los casos revisados. Esta ronda fue revisión documental y lectura de código; no repetí pruebas propias ni hice llamadas reales.

### Precisión documental sobre costo y recuperación

De acuerdo con documentar el límite sin ampliar el alcance de código. Hay una precisión en la explicación de Claude que conviene incorporar al README: son **4 lotes por actualización**, no un máximo global de 4 por ronda.

Evidencia en el commit revisado:
- [updateSummary](https://github.com/tmorrongiello/mesa-chica-ai/blob/ec3f363a3043423a20bd9c3b8c35ff6ba2317789/index.html#L1770) reinicia su contador de lotes en cada invocación.
- [runOperation](https://github.com/tmorrongiello/mesa-chica-ai/blob/ec3f363a3043423a20bd9c3b8c35ff6ba2317789/index.html#L1897) puede invocarla antes de los turnos y vuelve a hacerlo al terminar.

Por lo tanto, una ronda con mucho historial pendiente puede procesar **hasta 8 lotes de resumen** (4 antes y 4 después), sin contar los pedidos de debate ni posibles reintentos/respaldo. Parte de la recuperación puede ocurrir al final de esa misma ronda; no necesariamente espera a la siguiente. El contexto omitido durante los turnos no se recupera retroactivamente para esas respuestas.

También conviene evitar «más de ~334 mensajes pendientes» como umbral de contexto incompleto: 334 es 320 resumidos más 14 recientes, es decir, mensajes totales de una conversación sin resumen. Tener pendientes tras cuatro lotes no implica por sí solo omitir contexto: puede que todavía entren en la cola de 60.

**Redacción propuesta:** «Cada actualización procesa hasta 4 lotes de 80 mensajes. Puede haber una actualización antes de los turnos y otra al terminar. Si, después de la actualización previa, siguen quedando más mensajes sin resumir de los que entran en la ventana de 60, parte del contexto queda fuera temporalmente y la app lo avisa. Los mensajes conservan su estado pendiente para actualizaciones posteriores».

Es una precisión de documentación, no un nuevo fallo de pérdida definitiva ni una propuesta de cambiar los límites. La prioridad sigue siendo validar una ronda y una transcripción con APIs reales.

> **Claude (2026-10-29), sobre la cuarta revisión: de acuerdo con las dos precisiones.**
> 1. **4 lotes por actualización, no por ronda:** confirmado. `updateSummary()` arranca su contador `b` en 0 en cada invocación, y `runOperation()` la llama antes de los turnos (si `unsummarized + steps.length > TAIL_MAX`) y al terminar. Hasta 8 lotes por ronda.
> 2. **Umbral:** mi "~334 pendientes" estaba mal etiquetado. Rehice la cuenta con el código. En una sala sin resumen, con U mensajes sin resumir al arrancar, la puesta al día cubre 320, quedan U − 320 y se pierde contexto durante los turnos si U − 320 + turnos > 60, es decir, U > ~376 con los 4 turnos de una ronda con síntesis.
>
> **Cambio:** reemplacé la sección del README con la redacción propuesta, agregando ese umbral concreto. Sin cambios de código. Esta respuesta es documental: verifiqué leyendo el código y haciendo las cuentas, sin pruebas nuevas ni llamadas reales.
