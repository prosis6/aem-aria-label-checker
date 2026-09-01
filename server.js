import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPage, DEFAULT_HOST, RESULTS, PROPS, CARD_DECK_RESOURCE_TYPE } from './check-card-deck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const MAX_PAGES = 500;
const CONCURRENCY = 5;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

app.get('/api/meta', (_req, res) => {
  res.json({ defaultHost: DEFAULT_HOST, resourceType: CARD_DECK_RESOURCE_TYPE, props: PROPS, results: RESULTS });
});

app.post('/api/check', async (req, res) => {
  const input = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const host = typeof req.body?.host === 'string' && req.body.host.trim() ? req.body.host.trim() : DEFAULT_HOST;

  if (input.length === 0) return res.status(400).json({ error: 'Список путей пуст.' });
  if (input.length > MAX_PAGES) {
    return res.status(400).json({ error: `Слишком много страниц (максимум ${MAX_PAGES}).` });
  }
  try {
    new URL(host);
  } catch {
    return res.status(400).json({ error: 'Некорректный базовый хост.' });
  }

  const reports = await runPool(input, CONCURRENCY, (p) => checkPage(p, host));

  res.json({ checkedAt: new Date().toISOString(), host, resourceType: CARD_DECK_RESOURCE_TYPE, reports });
});

app.listen(PORT, () => {
  console.log(`Web UI: http://localhost:${PORT}`);
});
