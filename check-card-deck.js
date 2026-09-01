#!/usr/bin/env node
/**
 * Проверка компонентов Card Deck (AEM) по .infinity.json страницы.
 *
 * Использование:
 *   node check-card-deck.js /content/test-site/asia/jp/ja_jp/services/captive-insurance
 *   node check-card-deck.js <path> [...ещё] [--json] [--out report.json] [--host https://www.test-site.com]
 */

import { writeFile } from 'node:fs/promises';
import { argv as processArgv } from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_HOST = 'https://www.test-site.com';
export const CARD_DECK_RESOURCE_TYPE = 'marsh-aemrefresh/components/carddeck';
export const PROPS = {
  fromTitle: 'arialabelCardDeckTitle',
  ariaLabel: 'ariaLabel',
  title: 'cardDeckTitle',
};

/** Коды результата и их формулировки из чек-листа. */
export const RESULTS = {
  FIX_CHECKED_NO_TEXT: {
    action: true,
    text:
      '"Get aria-label from title" WAS checked and "Aria Label" field had NO text. ' +
      '"Get aria-label from title" changed to UNCHECKED and page Republished',
  },
  FIX_CHECKED_WITH_TEXT: {
    action: true,
    text:
      '"Get aria-label from title" WAS checked and "Aria Label" field HAD text. ' +
      '"Aria Label" text removed, "Get aria-label from title" changed to UNCHECKED and page Republished',
  },
  FIX_CHECKED_SAME_AS_TITLE: {
    action: true,
    text:
      '"Get aria-label from title" WAS checked and "Aria Label" field HAD text SAME as Title field. ' +
      '"Aria Label" text removed, "Get aria-label from title" changed to UNCHECKED and page Republished',
  },
  FIX_UNCHECKED_SAME_AS_TITLE: {
    action: true,
    text:
      '"Get aria-label from title" was NOT checked and "Aria Label" field HAD text but SAME as Title field. ' +
      '"Aria Label" text removed, "Get aria-label from title" left UNCHECKED and page Republished',
  },
  NA_UNCHECKED_DIFFERENT: {
    action: false,
    text:
      'N/A. "Get aria-label from title" was NOT checked and "Aria Label" field HAD text but DIFFERENT than Title field',
  },
  NA_CHECKED_WITH_TITLE: {
    action: false,
    text:
      'N/A. "Get aria-label from title" was checked and "Title" field HAD text, ' +
      '"Aria Label" field is empty or DIFFERENT than Title field',
  },
  NA_NOT_AUTHORED: {
    action: false,
    text: 'N/A. Card Deck component was not authored',
  },
  NA_AS_EXPECTED: {
    action: false,
    text:
      'N/A. Card Deck component authored as expected. "Aria Label" field was empty and "Get aria-label from title" unchecked',
  },
  NA_NOT_LIVE: {
    action: false,
    text: 'N/A. Page not live or with a redirect',
  },
};

function normalize(value) {
  if (value == null) return '';
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toBool(value) {
  return value === true || normalize(value).toLowerCase() === 'true';
}

/** Приводит вход (путь AEM или полный URL) к каноничному пути контента. */
export function normalizePath(input) {
  let value = String(input ?? '')
    .trim()
    .replace(/^["'<]+|["'>]+$/g, '');
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  value = value.replace(/\.infinity\.json$/i, '').replace(/\.html?$/i, '').replace(/\/+$/, '');
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.includes('..')) return null;
  return value;
}

export function buildJsonUrl(path, host = DEFAULT_HOST) {
  return new URL(`${path}.infinity.json`, host).toString();
}

/** Рекурсивно собирает узлы Card Deck вместе с их jcr-путями. */
export function collectCardDecks(node, basePath = '', found = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return found;
  if (node['sling:resourceType'] === CARD_DECK_RESOURCE_TYPE) {
    found.push({ path: basePath, node });
  }
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectCardDecks(value, `${basePath}/${key}`, found);
    }
  }
  return found;
}

function classify(node) {
  const fromTitle = toBool(node[PROPS.fromTitle]);
  const ariaLabel = normalize(node[PROPS.ariaLabel]);
  const title = normalize(node[PROPS.title]);

  let result;
  if (fromTitle) {
    if (title) {
      result = ariaLabel === title ? 'FIX_CHECKED_SAME_AS_TITLE' : 'NA_CHECKED_WITH_TITLE';
    } else {
      result = ariaLabel ? 'FIX_CHECKED_WITH_TEXT' : 'FIX_CHECKED_NO_TEXT';
    }
  } else if (!ariaLabel) {
    result = 'NA_AS_EXPECTED';
  } else {
    result = ariaLabel === title ? 'FIX_UNCHECKED_SAME_AS_TITLE' : 'NA_UNCHECKED_DIFFERENT';
  }

  return {
    getAriaLabelFromTitle: fromTitle,
    fromTitleRaw: node[PROPS.fromTitle] ?? null,
    ariaLabel,
    cardDeckTitle: title,
    hasAriaLabelProp: node[PROPS.ariaLabel] !== undefined,
    hasTitleProp: node[PROPS.title] !== undefined,
    sameAsTitle: Boolean(ariaLabel) && ariaLabel === title,
    caseInsensitiveSame:
      Boolean(ariaLabel) && ariaLabel.toLowerCase() === title.toLowerCase() && ariaLabel !== title,
    result,
    resultText: RESULTS[result].text,
    actionRequired: RESULTS[result].action,
  };
}

export async function fetchPageJson(path, host = DEFAULT_HOST) {
  const url = buildJsonUrl(path, host);
  const res = await fetch(url, {
    redirect: 'manual',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
    },
  });
  if (res.status >= 300 && res.status < 400) {
    return { url, notLive: true, reason: `HTTP ${res.status} → ${res.headers.get('location') ?? '?'}` };
  }
  if (!res.ok) {
    return { url, notLive: true, reason: `HTTP ${res.status} ${res.statusText}` };
  }
  const text = await res.text();
  try {
    return { url, json: JSON.parse(text) };
  } catch {
    return { url, notLive: true, reason: 'Ответ не является JSON' };
  }
}

/** Формирует отчёт по одной странице на основе её JSON. */
export function analyzePageJson(json, { path, url } = {}) {
  const content = json?.['jcr:content'] ?? json;
  const redirectTarget = normalize(content?.['cq:redirectTarget']);
  const pageTitle = normalize(content?.['jcr:title'] ?? content?.pageTitle) || null;

  if (redirectTarget) {
    return {
      path,
      url,
      pageTitle,
      pageResult: 'NA_NOT_LIVE',
      pageResultText: RESULTS.NA_NOT_LIVE.text,
      redirectTarget,
      totalCardDecks: 0,
      actionRequired: 0,
      components: [],
    };
  }

  const components = collectCardDecks(content, '/jcr:content').map((deck, i) => ({
    index: i + 1,
    componentPath: deck.path,
    componentName: deck.path.split('/').pop(),
    ...classify(deck.node),
  }));

  const actionRequired = components.filter((c) => c.actionRequired).length;
  const pageResult =
    components.length === 0 ? 'NA_NOT_AUTHORED' : actionRequired > 0 ? 'ACTION_REQUIRED' : 'NA_OK';

  return {
    path,
    url,
    pageTitle,
    pageResult,
    pageResultText:
      pageResult === 'NA_NOT_AUTHORED'
        ? RESULTS.NA_NOT_AUTHORED.text
        : pageResult === 'ACTION_REQUIRED'
          ? `Требуется правка: ${actionRequired} из ${components.length}`
          : 'N/A. Все Card Deck компоненты в порядке',
    redirectTarget: null,
    totalCardDecks: components.length,
    actionRequired,
    components,
  };
}

export async function checkPage(input, host = DEFAULT_HOST) {
  const path = normalizePath(input);
  if (!path) {
    return {
      path: String(input),
      url: null,
      pageTitle: null,
      pageResult: 'INVALID',
      pageResultText: 'Некорректный путь',
      error: 'Некорректный путь',
      totalCardDecks: 0,
      actionRequired: 0,
      components: [],
    };
  }
  try {
    const { url, json, notLive, reason } = await fetchPageJson(path, host);
    if (notLive) {
      return {
        path,
        url,
        pageTitle: null,
        pageResult: 'NA_NOT_LIVE',
        pageResultText: RESULTS.NA_NOT_LIVE.text,
        error: reason,
        totalCardDecks: 0,
        actionRequired: 0,
        components: [],
      };
    }
    return analyzePageJson(json, { path, url });
  } catch (err) {
    return {
      path,
      url: buildJsonUrl(path, host),
      pageTitle: null,
      pageResult: 'NA_NOT_LIVE',
      pageResultText: RESULTS.NA_NOT_LIVE.text,
      error: err.message,
      totalCardDecks: 0,
      actionRequired: 0,
      components: [],
    };
  }
}

function printReport(report) {
  console.log('='.repeat(78));
  console.log(`Страница: ${report.path}`);
  if (report.url) console.log(`JSON:     ${report.url}`);
  if (report.error) console.log(`Ошибка:   ${report.error}`);
  if (report.redirectTarget) console.log(`Редирект: ${report.redirectTarget}`);
  console.log(`Итог:     ${report.pageResultText}`);
  console.log('='.repeat(78));

  for (const c of report.components) {
    console.log(`${c.actionRequired ? '[FIX]' : '[N/A]'} #${c.index} ${c.componentPath}`);
    console.log(`      ${PROPS.fromTitle}: ${c.getAriaLabelFromTitle}`);
    console.log(`      ${PROPS.ariaLabel}:  ${JSON.stringify(c.ariaLabel)}`);
    console.log(`      ${PROPS.title}: ${JSON.stringify(c.cardDeckTitle)}`);
    console.log(`      => ${c.resultText}`);
    console.log('');
  }
}

async function main() {
  const args = processArgv.slice(2);
  const asJson = args.includes('--json');
  const outIndex = args.indexOf('--out');
  const hostIndex = args.indexOf('--host');
  const host = hostIndex !== -1 ? args[hostIndex + 1] : DEFAULT_HOST;
  const outFile = outIndex !== -1 ? args[outIndex + 1] : null;
  const consumed = new Set([outIndex + 1, hostIndex + 1].filter((i) => i > 0));
  const inputs = args.filter((a, i) => !a.startsWith('--') && !consumed.has(i));

  if (inputs.length === 0) {
    console.error(
      'Укажите путь(и) к странице AEM, например /content/test-site/asia/jp/ja_jp/services/captive-insurance'
    );
    process.exitCode = 2;
    return;
  }

  const reports = [];
  for (const input of inputs) {
    const report = await checkPage(input, host);
    reports.push(report);
    if (!asJson) printReport(report);
  }

  if (asJson) console.log(JSON.stringify(reports, null, 2));
  if (outFile) await writeFile(outFile, JSON.stringify(reports, null, 2), 'utf8');

  process.exitCode = reports.some((r) => r.actionRequired > 0) ? 1 : 0;
}

const isDirectRun = processArgv[1] && fileURLToPath(import.meta.url) === processArgv[1];
if (isDirectRun) main();
