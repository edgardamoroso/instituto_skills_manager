// Harness de teste: DEVE ser o primeiro import de qualquer arquivo de teste,
// antes de qualquer `../../src/...`, porque define o ambiente que `src/lib/config.js`
// e `src/db/index.js` leem no momento do import.
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Um arquivo SQLite exclusivo por processo de teste (node:test isola arquivos em processos).
const dbFile = path.join(os.tmpdir(), `sm-test-${crypto.randomUUID()}.db`);
process.env.DB_FILE = dbFile;

// Config mínima para o app subir fora de produção.
process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
// Garante que os testes usem a outbox em memória, nunca um SMTP real de um .env local.
process.env.SMTP_HOST = '';

let servers = [];

export async function removeDbFile() {
  try {
    const { closeDatabase } = await import('../../src/db/index.js');
    closeDatabase();
  } catch {
    /* db pode nem ter sido importado neste arquivo de teste */
  }
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(dbFile + suffix, { force: true });
    } catch {
      /* arquivo temporário; o SO limpa se ficar preso */
    }
  }
}

// Sobe o app numa porta efêmera; devolve base URL e um `close()`.
export async function startApp() {
  const { app } = await import('../../src/app.js');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      servers = servers.filter((entry) => entry !== server);
    },
  };
}

// Cliente HTTP fino com "cookie jar" para exercitar sessões.
export function createClient(baseUrl) {
  const jar = new Map();

  function cookieHeader() {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  function storeCookies(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '' || /expires=thu, 01 jan 1970/i.test(line)) jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function send(method, url, { body, form, headers = {} } = {}) {
    const options = { method, headers: { origin: baseUrl, ...headers } };
    const cookies = cookieHeader();
    if (cookies) options.headers.cookie = cookies;
    if (form) {
      options.body = form;
    } else if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${url}`, options);
    storeCookies(response);
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: response.status, headers: response.headers, body: json, text };
  }

  return {
    get: (url, opts) => send('GET', url, opts),
    post: (url, opts) => send('POST', url, opts),
    patch: (url, opts) => send('PATCH', url, opts),
    put: (url, opts) => send('PUT', url, opts),
    delete: (url, opts) => send('DELETE', url, opts),
    jar,
  };
}
