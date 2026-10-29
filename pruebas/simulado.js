// Pruebas con proveedores SIMULADOS (no hace llamadas reales a ninguna API).
// Uso: node pruebas/simulado.js   (requiere Playwright + Chromium instalados)
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const URL_APP = `http://localhost:${PORT}/`;
const KEYS = { claude: 'sk-ant-api03-PRUEBAclaude1234567890', openai: 'sk-proj-PRUEBAopenai1234567890abcd', gemini: 'AIzaPRUEBAgemini1234567890abcdef', groq: 'gsk_PRUEBAgroq1234567890' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------- Simulador de proveedores ---------- */
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'retry-after' };
const ok = {
  claude: t => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' }),
  openai: t => ({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: t }] }] }),
  gemini: t => ({ candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: t }] }, finishReason: 'STOP' }] }),
  groq: t => ({ choices: [{ message: { content: t }, finish_reason: 'stop' }] }),
  tx: t => ({ text: t })
};
const ROUTES = [
  ['https://api.anthropic.com/**', 'claude'],
  ['https://api.openai.com/v1/responses', 'openai'],
  ['https://api.openai.com/v1/audio/**', 'openaiTx'],
  ['https://generativelanguage.googleapis.com/**', 'gemini'],
  ['https://api.groq.com/openai/v1/chat/**', 'groq'],
  ['https://api.groq.com/openai/v1/audio/**', 'groqTx']
];

async function mock(page, handlers = {}) {
  const log = [];
  for (const [pattern, prov] of ROUTES) {
    await page.route(pattern, async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
      const n = log.filter(l => l.prov === prov).length;
      const entry = { prov, url: req.url(), headers: req.headers(), body: req.postData() || '', n };
      log.push(entry);
      const h = handlers[prov];
      let spec = h ? await h(entry) : null;
      if (!spec) spec = {};
      if (spec.body === undefined && !spec.status && !spec.abort) spec.body = (ok[prov] || ok.tx)(`Respuesta simulada ${prov} #${n + 1}`);
      if (spec.delay) await new Promise(r => setTimeout(r, spec.delay));
      try {
        if (spec.abort) await route.abort(spec.abort);
        else await route.fulfill({ status: spec.status || 200, headers: { ...CORS, 'content-type': 'application/json', ...(spec.headers || {}) }, body: typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body) });
      } catch (e) { entry.abortedByClient = true; }
    });
  }
  return log;
}

/* ---------- Mini runner ---------- */
let browser, browserAudio;
const results = [];
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function newPage({ init, touch, audio, keys = true, cfg } = {}) {
  const b = audio ? browserAudio : browser;
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: Boolean(touch), isMobile: Boolean(touch),
    permissions: audio ? ['microphone'] : [], acceptDownloads: true
  });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('dialog', d => d.accept()); // confirm() de acciones destructivas
  return { ctx, page, async go(handlers) {
    const log = await mock(page, handlers);
    await page.goto(URL_APP);
    if (keys) await page.evaluate(k => { Keys.setAll(k); updateControls(); }, keys === true ? KEYS : keys);
    if (cfg) await page.evaluate(c => Object.assign(App.config, c), cfg);
    return log;
  } };
}

async function send(page, text) {
  await page.fill('#txtInput', text);
  await page.click('#btnSend');
}
const waitIdle = (page, timeout = 15000) => page.waitForFunction(() => !App.debate, null, { timeout });
const cards = page => page.$$eval('#chat .bubble-agent', els => els.map(e => e.textContent));
const notices = page => page.$$eval('#chat .notice', els => els.map(e => e.textContent));

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`✔ ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`✘ ${name}\n   ${e.message.split('\n')[0]}`); }
}

/* ---------- Pruebas ---------- */
async function run() {
  await test('carga limpia: salas precargadas, sin errores, +1 ronda deshabilitado', async () => {
    const { ctx, page, go } = await newPage({ keys: false });
    await go();
    assert((await page.textContent('#roomTitle')).includes('Gol Olímpico'), 'sala inicial');
    assert(await page.isDisabled('#btnMore'), '+1 ronda debería estar deshabilitado');
    assert(await page.isDisabled('#btnSynth'), 'Sintetizar debería estar deshabilitado');
    const vp = await page.getAttribute('meta[name=viewport]', 'content');
    assert(!/maximum-scale|user-scalable/.test(vp), 'viewport sin bloqueo de zoom');
    const ext = await page.$$eval('script[src], link[rel=stylesheet]', e => e.length);
    assert(ext === 0, 'sin scripts/estilos externos');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, 'sin scroll horizontal a 390px');
    assert(page.errors.length === 0, 'errores JS: ' + page.errors.join(' | '));
    await ctx.close();
  });

  await test('ronda completa: orden, lectura de turnos previos, síntesis, headers y cuerpos', async () => {
    const { ctx, page, go } = await newPage();
    const log = await go();
    await page.evaluate(() => { current().decisions = 'DECISION-XYZ: usar Next.js'; });
    await send(page, 'Idea de prueba');
    await waitIdle(page);
    const c = await cards(page);
    assert(c.length === 4, `esperaba 4 tarjetas, hay ${c.length}`);
    const chatLog = log.filter(l => ['claude', 'openai', 'gemini'].includes(l.prov));
    assert(chatLog.map(l => l.prov).join() === 'gemini,claude,openai,claude', 'orden: ' + chatLog.map(l => l.prov).join());
    const gem = chatLog[0];
    assert(gem.headers['x-goog-api-key'] === KEYS.gemini && !gem.url.includes('key='), 'clave Gemini en header, no en URL');
    assert(gem.url.includes('/v1beta/models/gemini-3.8-flash:generateContent'), 'modelo/URL Gemini: ' + gem.url);
    const cl = chatLog[1];
    assert(cl.headers['anthropic-dangerous-direct-browser-access'] === 'true', 'header Anthropic');
    const clBody = JSON.parse(cl.body);
    assert(clBody.model === 'claude-sonnet-5-5', 'modelo Claude');
    assert(clBody.system.includes('DECISION-XYZ'), 'decisiones en el prompt');
    assert(clBody.system.includes('(a verificar)'), 'aviso de no verificar fuentes');
    assert(clBody.messages[0].content.includes('Respuesta simulada gemini #1'), 'Claude lee el turno previo de Gemini');
    const oa = JSON.parse(chatLog[2].body);
    assert(oa.model === 'gpt-6.1-sol' && oa.instructions && oa.input && oa.max_output_tokens, 'cuerpo Responses API');
    assert(oa.input.includes('Respuesta simulada claude #1'), 'OpenAI lee turnos previos');
    assert(c[3].includes('Síntesis'), 'última tarjeta = síntesis');
    assert(!c[0].includes('pensando'), 'Gemini: se descartan las partes "thought"');
    // rotación: la próxima ronda arranca Claude
    assert((await page.textContent('#badges')).startsWith('Próxima:1. Claude'), 'rotación: ' + await page.textContent('#badges'));
    await page.click('#btnMore');
    await waitIdle(page);
    const second = log.filter(l => ['claude', 'openai', 'gemini'].includes(l.prov)).slice(4).map(l => l.prov);
    assert(second[0] === 'claude', 'segunda ronda arranca Claude: ' + second.join());
    await ctx.close();
  });

  await test('síntesis apagada: el último panelista cierra con propuesta/desacuerdos/próximo paso', async () => {
    const { ctx, page, go } = await newPage({ cfg: { synthesis: false } });
    const log = await go();
    await send(page, 'Sin síntesis');
    await waitIdle(page);
    const calls = log.filter(l => ['claude', 'openai', 'gemini'].includes(l.prov));
    assert(calls.length === 3, 'tres turnos');
    const last = JSON.parse(calls[2].body);
    assert(last.instructions.includes('**Próximo paso:**'), 'instrucción de cierre en el último');
    assert(!JSON.parse(calls[0].body).systemInstruction.parts[0].text.includes('**Próximo paso:**'), 'el primero no cierra');
    await ctx.close();
  });

  await test('cambio de sala durante el debate: las respuestas quedan en la sala de origen', async () => {
    const { ctx, page, go } = await newPage();
    await go({ gemini: () => ({ delay: 800 }) });
    await send(page, 'Idea en sala A');
    await page.waitForTimeout(150);
    await page.evaluate(() => switchRoom('nuevo-brainstorm'));
    await page.waitForTimeout(200);
    await page.fill('#txtInput', 'borrador de B');
    await waitIdle(page);
    assert((await cards(page)).length === 0, 'la sala B no debe mostrar tarjetas');
    const counts = await page.evaluate(() => App.projects.map(p => [p.id, p.messages.filter(m => m.role === 'agent').length]));
    assert(counts.find(c => c[0] === 'gol-olimpico')[1] === 4 && counts.find(c => c[0] === 'nuevo-brainstorm')[1] === 0, 'conteos: ' + JSON.stringify(counts));
    await page.evaluate(() => switchRoom('gol-olimpico'));
    assert((await page.inputValue('#txtInput')) === '', 'borrador de A vacío');
    await page.evaluate(() => switchRoom('nuevo-brainstorm'));
    assert((await page.inputValue('#txtInput')) === 'borrador de B', 'borrador independiente de B');
    await ctx.close();
  });

  await test('no deja borrar ni limpiar una sala con operación activa', async () => {
    const { ctx, page, go } = await newPage();
    await go({ gemini: () => ({ delay: 1200 }) });
    await send(page, 'X');
    await page.evaluate(() => switchRoom('nuevo-brainstorm'));
    await page.evaluate(() => deleteRoom('gol-olimpico'));
    assert(await page.evaluate(() => Boolean(getProject('gol-olimpico'))), 'la sala no se debe borrar');
    assert((await page.textContent('#toasts')).includes('no tendrían dónde guardarse'), 'explica por qué');
    await page.evaluate(() => { $('dlgContext').dataset.projectId = 'gol-olimpico'; clearHistory(); });
    assert(await page.evaluate(() => getProject('gol-olimpico').messages.length > 1), 'no limpia');
    await waitIdle(page);
    await ctx.close();
  });

  await test('Frenar: corta, no arranca más turnos, ignora respuestas tardías y permite otra ronda', async () => {
    const { ctx, page, go } = await newPage();
    const log = await go({ gemini: e => ({ delay: e.n === 0 ? 1500 : 10 }) });
    await send(page, 'Ronda 1');
    await page.waitForTimeout(300);
    await page.click('#btnStop');
    assert(await page.isHidden('#opBar'), 'barra de operación oculta');
    const n = await notices(page);
    assert(n.some(t => t.includes('Ronda frenada') && t.includes('no garantiza')), 'aviso de frenado con aclaración de cobro');
    await page.fill('#txtInput', 'Ronda 2');
    await page.click('#btnSend');
    await waitIdle(page);
    await page.waitForTimeout(1600); // dejar que "llegue" la respuesta tardía de la ronda 1
    const c = await cards(page);
    assert(c.length === 4, `solo las 4 tarjetas de la ronda 2, hay ${c.length}`);
    assert(!c.some(t => t.includes('gemini #1')), 'la respuesta tardía no se pinta');
    assert(log.filter(l => l.prov === 'claude').length === 2, 'tras frenar no se arrancaron más turnos de la ronda 1');
    await ctx.close();
  });

  await test('doble clic en Enviar: un solo mensaje y una sola ronda', async () => {
    const { ctx, page, go } = await newPage();
    const log = await go({ gemini: () => ({ delay: 300 }) });
    await page.fill('#txtInput', 'doble');
    await page.dblclick('#btnSend');
    await page.keyboard.press('Enter');
    await waitIdle(page);
    const users = await page.$$eval('#chat .bubble-user', e => e.length);
    assert(users === 1, `mensajes de usuario: ${users}`);
    assert(log.filter(l => l.prov === 'gemini').length === 1, 'una sola llamada a Gemini');
    await ctx.close();
  });

  await test('errores: 401, 400, 500 con reintento, vacía, bloqueada, truncada, red', async () => {
    const { ctx, page, go } = await newPage({ cfg: { synthesis: false, retries: 1 } });
    const log = await go({
      gemini: () => ({ status: 401, body: { error: { message: `API key not valid ${KEYS.gemini}` } } }),
      claude: () => ({ status: 500, body: { error: { message: 'Overloaded' } } }),
      openai: () => ({ body: { status: 'completed', output: [] } })
    });
    await send(page, 'errores');
    await waitIdle(page, 20000);
    const n = (await notices(page)).join('\n');
    assert(n.includes('Clave rechazada (401)'), '401 → auth');
    assert(!n.includes(KEYS.gemini) && n.includes('[clave oculta]'), 'clave redactada en el error');
    assert(n.includes('Error del proveedor (500)'), '500 → proveedor');
    assert(log.filter(l => l.prov === 'claude').length === 2, '500 se reintenta 1 vez');
    assert(n.includes('respondió vacío'), 'respuesta vacía');
    assert(log.filter(l => l.prov === 'gemini').length === 1, '401 no se reintenta');
    await ctx.close();

    const b = await newPage({ cfg: { synthesis: false } });
    await b.go({
      gemini: () => ({ body: { promptFeedback: { blockReason: 'SAFETY' } } }),
      claude: () => ({ body: { content: [{ type: 'text', text: 'Texto cortado' }], stop_reason: 'max_tokens' } }),
      openai: () => ({ status: 404, body: { error: { message: 'The model does not exist' } } })
    });
    await send(b.page, 'más errores');
    await waitIdle(b.page);
    const n2 = (await notices(b.page)).join('\n');
    assert(n2.includes('bloqueó'), 'bloqueada');
    assert(n2.includes('Pedido inválido (404)'), '404 → inválida');
    assert((await cards(b.page)).some(t => t.includes('TRUNCADA')), 'tarjeta TRUNCADA');
    await b.ctx.close();

    const c2 = await newPage({ cfg: { synthesis: false } });
    await c2.go({ gemini: () => ({ abort: 'failed' }), openai: () => ({ body: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'medio' }] }] } }) });
    await send(c2.page, 'red');
    await waitIdle(c2.page);
    const n3 = (await notices(c2.page)).join('\n');
    assert(n3.includes('No se pudo conectar'), 'red/CORS');
    assert((await cards(c2.page)).some(t => t.includes('TRUNCADA') && t.includes('medio')), 'OpenAI incomplete → truncada');
    await c2.ctx.close();
  });

  await test('429: Retry-After ≤10 s espera y reintenta; >10 s corta y avisa', async () => {
    const { ctx, page, go } = await newPage({ cfg: { synthesis: false, retries: 1 } });
    const log = await go({
      gemini: e => (e.n === 0 ? { status: 429, headers: { 'retry-after': '1' }, body: { error: { message: 'rate' } } } : null),
      claude: () => ({ status: 429, headers: { 'retry-after': '60' }, body: { error: { message: 'rate' } } })
    });
    await send(page, 'rate');
    await waitIdle(page, 20000);
    assert(log.filter(l => l.prov === 'gemini').length === 2, 'Gemini reintentó tras 1 s');
    assert(log.filter(l => l.prov === 'claude').length === 1, 'Claude no esperó 60 s');
    const n = (await notices(page)).join('\n');
    assert(n.includes('pide esperar 60 s') && n.includes('No espero en silencio'), 'aviso de espera larga');
    await ctx.close();
  });

  await test('timeout configurable (10 s)', async () => {
    const { ctx, page, go } = await newPage({ cfg: { synthesis: false, timeoutDebateS: 10 } });
    await go({ gemini: () => ({ delay: 14000 }) });
    await send(page, 'timeout');
    await waitIdle(page, 30000);
    assert((await notices(page)).join('\n').includes('timeout de 10 s'), 'mensaje de timeout');
    await ctx.close();
  });

  await test('respaldo: falta clave → EMULADO por el siguiente (Claude→OpenAI→Gemini→Groq)', async () => {
    const { ctx, page, go } = await newPage({ keys: { openai: KEYS.openai, groq: KEYS.groq }, cfg: { synthesis: false } });
    const log = await go();
    await send(page, 'respaldo');
    await waitIdle(page);
    const c = await cards(page);
    assert(c.length === 3, 'tres tarjetas');
    assert(c[0].includes('Diseño y UX') && c[0].includes('EMULADO') && c[0].includes('OpenAI · gpt-6.1-sol'), 'Gemini emulado por OpenAI: ' + c[0]);
    assert(c[1].includes('Arquitectura') && c[1].includes('EMULADO'), 'Claude emulado');
    assert(!c[2].includes('EMULADO'), 'ChatGPT nativo');
    assert(!log.some(l => l.prov === 'groq'), 'no hizo falta Groq');
    await ctx.close();
  });

  await test('respaldo: "si falta la clave" apagado → error; "si falla" off/on', async () => {
    const a = await newPage({ keys: { openai: KEYS.openai }, cfg: { synthesis: false, fallbackMissing: false } });
    await a.go();
    await send(a.page, 'x');
    await waitIdle(a.page);
    assert((await notices(a.page)).filter(t => t.includes('Falta la clave')).length === 2, 'dos roles sin clave');
    await a.ctx.close();

    const b = await newPage({ cfg: { synthesis: false, retries: 0, fallbackOnError: false } });
    const logB = await b.go({ claude: () => ({ status: 503, body: {} }) });
    await send(b.page, 'x');
    await waitIdle(b.page);
    assert(logB.filter(l => l.prov === 'openai').length === 1, 'sin respaldo por error: OpenAI solo en su turno');
    await b.ctx.close();

    const c = await newPage({ cfg: { synthesis: false, retries: 0, fallbackOnError: true } });
    const logC = await c.go({ claude: () => ({ status: 503, body: {} }) });
    await send(c.page, 'x');
    await waitIdle(c.page);
    const cc = await cards(c.page);
    assert(cc.some(t => t.includes('Arquitectura') && t.includes('EMULADO') && t.includes('OpenAI')), 'Arquitectura emulado por OpenAI');
    assert(logC.filter(l => l.prov === 'claude').length === 1, 'no repite Claude en el turno');
    assert((await notices(c.page)).some(t => t.includes('Respondió el respaldo')), 'avisa el fallo previo');
    await c.ctx.close();
  });

  await test('almacenamiento lleno: aviso persistente, sigue en memoria, sin repetir llamadas', async () => {
    const init = () => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (window.__full && k === 'mesachica_projects_v1') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
        return orig.call(this, k, v);
      };
    };
    const { ctx, page, go } = await newPage({ init });
    const log = await go();
    await page.evaluate(() => { window.__full = true; });
    await send(page, 'lleno');
    await waitIdle(page);
    assert(await page.isVisible('#storageWarning'), 'aviso visible');
    assert((await page.textContent('#storageWarningText')).includes('lleno'), 'menciona almacenamiento lleno');
    assert((await cards(page)).length === 4, 'la ronda sigue en memoria');
    assert(log.filter(l => l.prov === 'claude').length === 2, 'sin llamadas repetidas');
    await page.evaluate(() => { window.__full = false; });
    await page.fill('#txtInput', 'ya hay lugar');
    await page.click('#btnSend');
    await waitIdle(page);
    assert(await page.isHidden('#storageWarning'), 'el aviso se va al poder guardar');
    await ctx.close();
  });

  await test('almacenamiento bloqueado: carga con salas por defecto y aviso', async () => {
    const init = () => { Object.defineProperty(window, 'localStorage', { get() { const e = new Error('blocked'); e.name = 'SecurityError'; throw e; } }); };
    const { ctx, page, go } = await newPage({ init, keys: false });
    await go();
    assert((await page.textContent('#roomTitle')).includes('Gol'), 'salas por defecto');
    assert(await page.isVisible('#storageWarning'), 'aviso visible');
    assert(page.errors.length === 0, 'sin errores: ' + page.errors.join());
    await ctx.close();
  });

  await test('JSON inválido / datos dañados: recupera lo válido y guarda copia del original', async () => {
    const { ctx, page, go } = await newPage({ keys: false });
    await go();
    await page.evaluate(() => localStorage.setItem('mesachica_projects_v1', JSON.stringify([
      { id: 'a', name: 'Sala buena', messages: [{ role: 'user', text: 'hola' }, { role: 'agent', agentId: 'claude', text: 'resp', simulated: true }, { role: 'hacker', text: 1 }] },
      { id: 'a', name: 'Duplicada', messages: [] },
      42
    ])));
    await page.reload();
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({
      names: App.projects.map(p => p.name), ids: App.projects.map(p => p.id),
      backups: Object.keys(localStorage).filter(k => k.startsWith('mesachica_projects_v1_respaldo_')),
      emu: App.projects[0].messages.find(m => m.role === 'agent').emulated
    }));
    assert(st.names.join() === 'Sala buena,Duplicada', 'recuperó: ' + st.names);
    assert(new Set(st.ids).size === 2, 'ids únicos');
    assert(st.backups.length === 1, 'copia del original');
    assert(st.emu === true, 'v2 "simulated" → "emulated"');
    assert((await page.textContent('#toasts')).includes('dañados'), 'aviso');

    await page.evaluate(() => localStorage.setItem('mesachica_projects_v1', '{roto'));
    await page.reload();
    await page.waitForTimeout(300);
    const st2 = await page.evaluate(() => ({ n: App.projects.length, saved: localStorage.getItem('mesachica_projects_v1').startsWith('[') }));
    assert(st2.n === 2 && st2.saved, 'JSON roto → defaults, guardado tras copiar');
    await ctx.close();
  });

  await test('datos dañados sin poder copiar: no pisa y avisa', async () => {
    const init = () => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('mesachica_projects_v1_respaldo_')) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
        return orig.call(this, k, v);
      };
      if (!sessionStorage.getItem('sembrado')) { localStorage.setItem('mesachica_projects_v1', '[{"id":"a","name":"X","messages":"roto"}, 7]'); sessionStorage.setItem('sembrado', '1'); }
    };
    const { ctx, page, go } = await newPage({ init });
    await go();
    await send(page, 'algo');
    await waitIdle(page);
    const raw = await page.evaluate(() => localStorage.getItem('mesachica_projects_v1'));
    assert(raw === '[{"id":"a","name":"X","messages":"roto"}, 7]', 'el original no se pisó');
    assert(await page.isVisible('#btnWarnRaw'), 'ofrece descargar el original');
    await ctx.close();
  });

  await test('migración de claves viejas: solo a memoria, se borra la copia, se avisa', async () => {
    const { ctx, page, go } = await newPage({ keys: false });
    await go();
    await page.evaluate(k => {
      localStorage.setItem('mesachica_keys_v1', JSON.stringify({ gemini: k.gemini, claude: k.claude, openai: '', groq: '', fallback: false }));
      localStorage.setItem('mesachica_models_v1', JSON.stringify({ gemini: 'gemini-2.5-flash', claude: 'claude-sonnet-5-5', openai: 'gpt-4o', groq: 'llama-3.3-70b-versatile' }));
      localStorage.setItem('mesachica_settings_v1', JSON.stringify({ rotate: false, synthesis: true }));
    }, KEYS);
    await page.reload();
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({
      mem: { ...Keys.mem }, v1: localStorage.getItem('mesachica_keys_v1'), v3: localStorage.getItem('mesachica_keys_v3'),
      models: App.config.models, rotate: App.config.rotate, fb: App.config.fallbackMissing,
      oldModels: localStorage.getItem('mesachica_models_v1')
    }));
    assert(st.mem.gemini === KEYS.gemini && st.mem.claude === KEYS.claude, 'claves en memoria');
    assert(st.v1 === null && st.v3 === null, 'sin copia en storage');
    assert(st.models.gemini === 'gemini-3.8-flash' && st.models.openai === 'gpt-6.1-sol' && st.models.groq === 'openai/gpt-oss-120b', 'modelos viejos → nuevos');
    assert(st.rotate === false && st.fb === false, 'ajustes migrados');
    assert(st.oldModels === null, 'models_v1 eliminado');
    const t = await page.textContent('#toasts');
    assert(t.includes('versión anterior') && t.includes('borré la copia'), 'aviso de migración');
    await page.reload();
    assert(await page.evaluate(() => !Keys.any()), 'tras recargar, las claves migradas no persisten');
    await ctx.close();
  });

  await test('Conexiones API: recordar on/off y Borrar claves', async () => {
    const { ctx, page, go } = await newPage({ keys: false });
    await go();
    await page.click('#btnKeys');
    assert(!(await page.isChecked('#chkRememberKeys')), 'recordar apagado por defecto');
    await page.fill('#keyClaude', KEYS.claude);
    await page.check('#chkRememberKeys');
    await page.click('#btnApplyKeys');
    assert((await page.evaluate(() => localStorage.getItem('mesachica_keys_v3'))).includes(KEYS.claude), 'guardada al recordar');
    await page.reload();
    assert(await page.evaluate(k => Keys.mem.claude === k, KEYS.claude), 'se recuerda al recargar');
    await page.click('#btnKeys');
    await page.uncheck('#chkRememberKeys');
    assert(await page.evaluate(() => localStorage.getItem('mesachica_keys_v3') === null), 'al desactivar se borra ya');
    await page.click('#btnClearKeys');
    assert(await page.evaluate(() => !Keys.any()), 'memoria limpia');
    assert((await page.inputValue('#keyClaude')) === '', 'campo limpio');
    await ctx.close();
  });

  await test('import con HTML malicioso: vista previa y chat escapados; export JSON sin claves', async () => {
    const { ctx, page, go } = await newPage();
    await go();
    const evil = { projects: [{ id: 'gol-olimpico', name: '<img src=x onerror="window.__pwned=1">Sala', context: '<script>window.__pwned=2</script>', messages: [
      { role: 'user', text: '<img src=y onerror="window.__pwned=3"> **negrita**' },
      { role: 'agent', agentId: 'claude', text: '<svg onload="window.__pwned=4">' }
    ] }] };
    const file = path.join(__dirname, '.tmp-evil.json');
    fs.writeFileSync(file, JSON.stringify(evil));
    await page.click('#btnExport');
    await page.setInputFiles('#fileImport', file);
    await page.waitForSelector('#importPreview:not([hidden])');
    assert((await page.textContent('#importList')).includes('<img src=x'), 'nombre mostrado como texto');
    await page.click('#btnImportConfirm');
    await page.evaluate(() => switchRoom(App.projects[App.projects.length - 1].id));
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ pwned: window.__pwned, imgs: document.querySelectorAll('#chat img, #chat svg').length, title: $('roomTitle').textContent, ids: App.projects.map(p => p.id) }));
    assert(!st.pwned && st.imgs === 0, 'nada se ejecuta: ' + JSON.stringify(st));
    assert(st.title.startsWith('<img'), 'título como texto');
    assert(new Set(st.ids).size === st.ids.length && st.ids.length === 3, 'id en conflicto renombrado al agregar');
    assert((await page.innerHTML('#chat')).includes('<strong>negrita</strong>'), 'markdown mínimo funciona');
    fs.unlinkSync(file);

    await page.evaluate(k => { current().messages.push({ id: 'k1', role: 'user', text: 'pegué ' + k }); }, KEYS.openai);
    await page.click('#btnExport');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportJson')]);
    const json = fs.readFileSync(await dl.path(), 'utf8');
    assert(!Object.values(KEYS).some(k => json.includes(k)), 'el JSON no contiene claves');
    assert(JSON.parse(json).projects.length === 3, 'JSON válido con salas');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownloadMd')]);
    const md = fs.readFileSync(await dl2.path(), 'utf8');
    assert(!Object.values(KEYS).some(k => md.includes(k)), 'el Markdown no contiene claves');
    await ctx.close();
  });

  await test('import Reemplazar pide confirmación y valida', async () => {
    const { ctx, page, go } = await newPage({ keys: false });
    await go();
    const file = path.join(__dirname, '.tmp-rep.json');
    fs.writeFileSync(file, JSON.stringify([{ id: 'z', name: 'Única', messages: [] }]));
    let asked = 0;
    page.removeAllListeners('dialog');
    page.on('dialog', d => { asked++; d.accept(); });
    await page.click('#btnExport');
    await page.setInputFiles('#fileImport', file);
    await page.check('input[name=importMode][value=replace]');
    await page.click('#btnImportConfirm');
    assert(asked === 1, 'confirmó');
    assert(await page.evaluate(() => App.projects.length === 1 && current().name === 'Única'), 'reemplazó');
    fs.unlinkSync(file);
    fs.writeFileSync(file, '{"nada": true}');
    await page.click('#btnExport');
    await page.setInputFiles('#fileImport', file);
    assert(await page.isHidden('#importPreview'), 'archivo sin salas no muestra vista previa');
    fs.unlinkSync(file);
    await ctx.close();
  });

  await test('teclado: Enter envía, Shift+Enter salto, IME no envía; diálogos con Escape, foco y trampa', async () => {
    const { ctx, page, go } = await newPage({ cfg: { synthesis: false } });
    await go();
    await page.focus('#txtInput');
    await page.keyboard.type('linea1');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('linea2');
    assert((await page.inputValue('#txtInput')) === 'linea1\nlinea2', 'Shift+Enter = salto');
    await page.evaluate(() => $('txtInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    assert(await page.evaluate(() => !App.debate && current().messages.length === 1), 'IME: no envía');
    await page.keyboard.press('Enter');
    await waitIdle(page);
    assert((await page.$$eval('#chat .bubble-user', e => e.length)) === 1, 'Enter envía');

    await page.focus('#btnSettings');
    await page.keyboard.press('Enter');
    assert(await page.evaluate(() => $('dlgSettings').open), 'diálogo abierto');
    assert(await page.evaluate(() => $('dlgSettings').contains(document.activeElement)), 'foco inicial dentro');
    for (let i = 0; i < 60; i++) await page.keyboard.press('Tab');
    assert(await page.evaluate(() => $('dlgSettings').contains(document.activeElement)), 'trampa de foco');
    await page.keyboard.press('Escape');
    assert(await page.evaluate(() => !$('dlgSettings').open && document.activeElement.id === 'btnSettings'), 'Escape cierra y devuelve el foco');
    const unlabeled = await page.$$eval('button', bs => bs.filter(b => !(b.getAttribute('aria-label') || b.textContent.trim())).map(b => b.id));
    assert(unlabeled.length === 0, 'botones sin nombre: ' + unlabeled);
    const noLabel = await page.$$eval('input:not([type=radio]):not([type=hidden]), textarea, select', xs => xs.filter(x => !x.labels || !x.labels.length).map(x => x.id));
    assert(noLabel.length === 0, 'campos sin label: ' + noLabel);
    await ctx.close();
  });

  await test('celular: Enter hace salto de línea; leyendo arriba aparece "Nuevos mensajes"', async () => {
    const { ctx, page, go } = await newPage({ touch: true, cfg: { synthesis: false } });
    await go({ claude: () => ({ delay: 600 }) });
    await page.tap('#txtInput');
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    assert((await page.inputValue('#txtInput')) === 'a\nb', 'Enter = salto en celular');
    await page.evaluate(() => { const p = current(); for (let i = 0; i < 30; i++) p.messages.push({ id: 'f' + i, role: 'user', text: 'relleno '.repeat(20) }); renderRoom(); });
    await page.tap('#btnSend');
    await page.waitForTimeout(150);
    await page.evaluate(() => { $('chat').scrollTop = 0; });
    await waitIdle(page);
    assert(await page.isVisible('#btnNewMsgs'), 'botón Nuevos mensajes');
    assert(await page.evaluate(() => $('chat').scrollTop < 50), 'no fuerza el scroll');
    await ctx.close();
  });

  /* ----- Audio (Chromium con micrófono falso) ----- */
  const audioInit = () => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__streams = [];
    navigator.mediaDevices.getUserMedia = async c => {
      if (window.__deny) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
      const s = await orig(c); window.__streams.push(s); return s;
    };
  };
  const recState = page => page.getAttribute('#btnRecord', 'data-state');
  const micsLive = page => page.evaluate(() => window.__streams.some(s => s.getTracks().some(t => t.readyState === 'live')));

  await test('audio: graba, transcribe con Groq al borrador de la sala de origen aunque cambie de sala; libera el mic', async () => {
    const { ctx, page, go } = await newPage({ audio: true, init: audioInit });
    const log = await go({ groqTx: () => ({ delay: 800, body: { text: 'texto transcripto' } }) });
    await page.click('#btnRecord');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'recording');
    await page.click('#btnRecord', { force: true }).catch(() => {}); // segundo clic rápido = detener (no inicia otra)
    await page.waitForTimeout(100);
    // grabación demasiado corta → se descarta con aviso; probamos una de verdad
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'idle');
    await page.click('#btnRecord');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'recording');
    await page.waitForTimeout(2200);
    await page.click('#btnRecord');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'transcribing');
    assert(await page.isDisabled('#btnRecord'), 'botón bloqueado mientras transcribe');
    await page.evaluate(() => switchRoom('nuevo-brainstorm'));
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'idle');
    assert(!(await micsLive(page)), 'micrófono liberado');
    const st = await page.evaluate(() => ({ a: getProject('gol-olimpico').draft, b: $('txtInput').value, debate: Boolean(App.debate) }));
    assert(st.a === 'texto transcripto' && st.b === '', 'va al borrador de origen: ' + JSON.stringify(st));
    assert(!st.debate, 'no envía solo');
    const tx = log.find(l => l.prov === 'groqTx');
    assert(/filename="audio\.(webm|m4a|ogg)"/.test(tx.body) && tx.body.includes('whisper-large-v3-turbo'), 'archivo/modelo Groq');
    assert(tx.headers.authorization === `Bearer ${KEYS.groq}`, 'auth Groq');
    await page.evaluate(() => switchRoom('gol-olimpico'));
    assert((await page.inputValue('#txtInput')) === 'texto transcripto', 'aparece al volver');
    await page.click('#btnSend');
    await waitIdle(page);
    assert((await page.textContent('#chat .bubble-user')).includes('audio'), 'mensaje marcado como audio');
    await ctx.close();
  });

  await test('audio: permiso denegado → aviso, vuelve a inactivo', async () => {
    const { ctx, page, go } = await newPage({ audio: true, init: () => { window.__deny = true; navigator.mediaDevices.getUserMedia = async () => { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; }; } });
    await go();
    await page.click('#btnRecord');
    await page.waitForTimeout(200);
    assert((await recState(page)) === 'idle', 'inactivo');
    assert((await page.textContent('#toasts')).includes('Permiso de micrófono denegado'), 'aviso');
    await ctx.close();
  });

  await test('audio: falla la transcripción → conserva audio, reintentar/descargar/descartar; cancelar; límite de duración', async () => {
    const { ctx, page, go } = await newPage({ audio: true, init: audioInit, cfg: { retries: 0, autoSend: true } });
    await go({ groqTx: e => (e.n === 0 ? { status: 500, body: { error: { message: 'boom' } } } : e.n === 1 ? { delay: 3000 } : { body: { text: 'segundo intento ok' } }) });
    await page.evaluate(() => { App.config.maxRecS = 10; });
    await page.click('#btnRecord');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'recording');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'transcribing', null, { timeout: 15000 }); // corta solo a los 10 s
    assert((await page.textContent('#toasts')).includes('máximo de 00:10'), 'avisa el corte por duración');
    await page.waitForSelector('#audioPanel:not([hidden])');
    assert((await page.textContent('#audioPanelText')).includes('Error del proveedor (500)'), 'motivo visible');
    assert(await page.evaluate(() => $('audioPreview').src.startsWith('blob:')), 'audio reproducible');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnAudioDownload')]);
    assert(/\.(webm|m4a|ogg)$/.test(dl.suggestedFilename()), 'descarga con extensión real: ' + dl.suggestedFilename());
    await page.click('#btnAudioRetry');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'transcribing');
    await page.click('#btnCancelTranscribe');
    assert((await recState(page)) === 'idle', 'cancelada');
    assert(await page.isVisible('#audioPanel'), 'audio conservado tras cancelar');
    await page.click('#btnAudioRetry');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'idle' && $('audioPanel').hidden);
    await page.waitForTimeout(100);
    assert((await page.$$eval('#chat .bubble-user', e => e.length)) === 1, 'autoenvío (activado a mano) en la misma sala');
    await waitIdle(page);
    const blobUrlRevoked = await page.evaluate(() => !$('audioPreview').getAttribute('src'));
    assert(blobUrlRevoked, 'object URL liberada');
    await ctx.close();
  });

  await test('audio: autoenvío nunca con ronda en curso', async () => {
    const { ctx, page, go } = await newPage({ audio: true, init: audioInit, cfg: { autoSend: true } });
    await go({ gemini: () => ({ delay: 4000 }), groqTx: () => ({ body: { text: 'dictado' } }) });
    await send(page, 'ronda larga');
    await page.click('#btnRecord');
    await page.waitForFunction(() => $('btnRecord').dataset.state === 'recording');
    await page.waitForTimeout(1500);
    await page.click('#btnRecord');
    await page.waitForFunction(() => $('txtInput').value === 'dictado');
    assert((await page.$$eval('#chat .bubble-user', e => e.length)) === 1, 'no se envió');
    assert((await page.textContent('#toasts')).includes('hay una ronda en curso'), 'explica por qué');
    await page.click('#btnStop');
    await ctx.close();
  });
}

(async () => {
  server.listen(PORT);
  browser = await chromium.launch();
  browserAudio = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try { await run(); } finally {
    await browser.close(); await browserAudio.close(); server.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pruebas OK`);
  process.exit(failed.length ? 1 : 0);
})();
