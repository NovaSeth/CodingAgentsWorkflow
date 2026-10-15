// Request routing. A request is { method, url }; a response is { status, headers, body }.
import { getItem, listItems } from './items.mjs';

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function itemById(req, match) {
  if (!POSITIVE_INTEGER.test(match[1])) return json(400, { error: 'invalid id' });
  const item = getItem(Number(match[1]));
  return item ? json(200, item) : json(404, { error: 'not found' });
}

const routes = [
  { method: 'GET', pattern: /^\/health$/, handler: () => json(200, { ok: true }) },
  { method: 'GET', pattern: /^\/items$/, handler: () => json(200, listItems()) },
  { method: 'GET', pattern: /^\/items\/([^/]+)$/, handler: itemById },
];

export function handle(req) {
  const path = req.url.split('?')[0];
  const matching = routes.filter((route) => route.pattern.test(path));
  if (matching.length === 0) return json(404, { error: 'not found' });
  const route = matching.find((candidate) => candidate.method === req.method);
  if (!route) {
    const allow = [...new Set(matching.map((candidate) => candidate.method))].join(', ');
    return json(405, { error: 'method not allowed' }, { allow });
  }
  return route.handler(req, path.match(route.pattern));
}
