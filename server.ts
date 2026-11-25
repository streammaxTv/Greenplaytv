import http from 'node:http';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import {handleApiRequest} from './src/worker/iptvHandler.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const HMR_DISABLED = process.env.DISABLE_HMR === 'true';

const NOOP_VITE_CLIENT_JS = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const u = new URL(url, 'http://vite.dev');
  const q = u.search ? '&' + u.search.slice(1) : '';
  return pathname + '?' + queryToInject + q + (u.hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`;

async function readRawBody(req: express.Request): Promise<Uint8Array | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return new Uint8Array(Buffer.concat(chunks));
}

const app = express();
app.set('trust proxy', 1);

// Delegate all /api/* routes directly to the Cloudflare Workers handler
app.use('/api', async (req, res) => {
  try {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const targetUrl = new URL(req.originalUrl, `${protocol}://${host}`).toString();

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === 'string') headers.set(key, val);
      else if (Array.isArray(val)) headers.set(key, val.join(', '));
    }

    const rawBody = await readRawBody(req);
    const webRequest = new Request(targetUrl, {
      method: req.method,
      headers,
      body: rawBody ? (rawBody as unknown as BodyInit) : undefined,
    });

    const webResponse = await handleApiRequest(webRequest, {
      SESSION_SECRET: process.env.SESSION_SECRET,
      DEFAULT_LIVE_PLAYLIST_URL: process.env.DEFAULT_LIVE_PLAYLIST_URL,
    });

    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!webResponse.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(
      webResponse.body as unknown as import('node:stream/web').ReadableStream,
    );
    req.on('close', () => nodeStream.destroy());
    nodeStream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.end();
    });
    nodeStream.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({error: 'Erro interno ao processar requisição.'});
    }
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    if (HMR_DISABLED) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(NOOP_VITE_CLIENT_JS);
      });
    }

    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: HMR_DISABLED ? false : {server: httpServer},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`GreenPlay TV local preview listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
