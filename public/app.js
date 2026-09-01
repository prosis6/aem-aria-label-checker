const $ = (id) => document.getElementById(id);

const RESULT_LABELS = {
  FIX_CHECKED_NO_TEXT: 'Checked + aria-label пустой',
  FIX_CHECKED_WITH_TEXT: 'Checked + aria-label заполнен',
  FIX_CHECKED_SAME_AS_TITLE: 'Checked + aria-label = Title',
  FIX_UNCHECKED_SAME_AS_TITLE: 'Unchecked + aria-label = Title',
  NA_UNCHECKED_DIFFERENT: 'N/A: aria-label ≠ Title',
  NA_CHECKED_WITH_TITLE: 'N/A: checked, Title заполнен',
  NA_AS_EXPECTED: 'N/A: настроено верно',
  NA_NOT_AUTHORED: 'N/A: компонент не заведён',
  NA_NOT_LIVE: 'N/A: страница не live / редирект',
  ACTION_REQUIRED: 'Требуется правка',
  NA_OK: 'N/A: всё в порядке',
  INVALID: 'Некорректный путь',
};

const RESULT_TONE = {
  FIX_CHECKED_NO_TEXT: 'bad',
  FIX_CHECKED_WITH_TEXT: 'bad',
  FIX_CHECKED_SAME_AS_TITLE: 'bad',
  FIX_UNCHECKED_SAME_AS_TITLE: 'bad',
  NA_UNCHECKED_DIFFERENT: 'neutral',
  NA_CHECKED_WITH_TITLE: 'neutral',
  NA_AS_EXPECTED: 'ok',
  NA_NOT_AUTHORED: 'neutral',
  NA_NOT_LIVE: 'warn',
  ACTION_REQUIRED: 'bad',
  NA_OK: 'ok',
  INVALID: 'warn',
};

let lastResponse = null;

function parsePaths(text) {
  return [
    ...new Set(
      text
        .split(/[\r\n,;]+/)
        .map((s) => s.trim().replace(/^["'<]+|["'>]+$/g, ''))
        .filter((s) => s.length > 0 && !s.startsWith('#'))
    ),
  ];
}

function updateCount() {
  $('pathCount').textContent = `Страниц: ${parsePaths($('paths').value).length}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function badge(code) {
  return el('span', `badge ${RESULT_TONE[code] ?? ''}`, RESULT_LABELS[code] ?? code);
}

function renderSummary(reports) {
  const totals = {
    pages: reports.length,
    decks: 0,
    fix: 0,
    notAuthored: 0,
    notLive: 0,
    ok: 0,
    naDifferent: 0,
  };
  for (const r of reports) {
    totals.decks += r.totalCardDecks;
    totals.fix += r.actionRequired;
    if (r.pageResult === 'NA_NOT_AUTHORED') totals.notAuthored += 1;
    if (r.pageResult === 'NA_NOT_LIVE' || r.pageResult === 'INVALID') totals.notLive += 1;
    for (const c of r.components) {
      if (c.result === 'NA_AS_EXPECTED') totals.ok += 1;
      if (c.result === 'NA_UNCHECKED_DIFFERENT') totals.naDifferent += 1;
    }
  }

  const cards = [
    ['Страниц', totals.pages, ''],
    ['Card Deck компонентов', totals.decks, ''],
    ['Требуют правки', totals.fix, totals.fix ? 'bad' : 'ok'],
    ['N/A: aria-label ≠ Title', totals.naDifferent, ''],
    ['N/A: настроено верно', totals.ok, 'ok'],
    ['N/A: нет компонента', totals.notAuthored, ''],
    ['N/A: не live / редирект', totals.notLive, totals.notLive ? 'bad' : ''],
  ];

  const box = $('summary');
  box.replaceChildren();
  for (const [label, value, tone] of cards) {
    const card = el('div', `card ${tone}`);
    card.append(el('div', 'value', value), el('div', 'label', label));
    box.append(card);
  }
}

function renderPagesTable(reports, onlyFix) {
  const tbody = $('pagesTable').querySelector('tbody');
  tbody.replaceChildren();

  reports.forEach((report, i) => {
    if (onlyFix && report.actionRequired === 0) return;

    const tr = document.createElement('tr');
    tr.append(el('td', 'num', i + 1));

    const pathCell = el('td', 'url');
    pathCell.append(el('div', null, report.path));
    if (report.url) {
      const link = el('a', 'mono', 'открыть .infinity.json');
      link.href = report.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      pathCell.append(link);
    }
    if (report.pageTitle) pathCell.append(el('div', 'mono', report.pageTitle));
    tr.append(pathCell);

    tr.append(el('td', 'num', report.totalCardDecks), el('td', 'num', report.actionRequired));

    const resultCell = el('td');
    resultCell.append(badge(report.pageResult));
    if (report.error) resultCell.append(el('div', 'mono', report.error));
    if (report.redirectTarget) resultCell.append(el('div', 'mono', `→ ${report.redirectTarget}`));
    tr.append(resultCell);
    tbody.append(tr);
  });

  if (!tbody.children.length) {
    const tr = document.createElement('tr');
    const td = el('td', 'empty-note', 'Нет строк для отображения.');
    td.colSpan = 5;
    tr.append(td);
    tbody.append(tr);
  }
}

function renderDetails(reports, onlyFix) {
  const box = $('details');
  box.replaceChildren();

  reports.forEach((report) => {
    if (onlyFix && report.actionRequired === 0) return;
    const rows = onlyFix ? report.components.filter((c) => c.actionRequired) : report.components;

    const details = el('details', 'page-block');
    details.open = report.actionRequired > 0;
    const summary = el('summary');
    summary.append(badge(report.pageResult), el('span', null, report.path));
    details.append(summary);

    if (rows.length === 0) {
      const note =
        report.pageResult === 'NA_NOT_LIVE' || report.pageResult === 'INVALID'
          ? `${report.pageResultText}${report.error ? ` (${report.error})` : ''}`
          : report.pageResultText;
      details.append(el('div', 'empty-note', note));
    } else {
      const wrap = el('div', 'table-wrap');
      const table = el('table', 'grid');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const h of [
        '#',
        'Компонент',
        'Get aria-label from title',
        'ariaLabel',
        'cardDeckTitle',
        'Результат',
      ]) {
        headRow.append(el('th', null, h));
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement('tbody');
      for (const c of rows) {
        const tr = document.createElement('tr');
        tr.append(el('td', 'num', c.index));
        tr.append(el('td', 'mono', c.componentPath));
        const flagCell = el('td');
        flagCell.append(
          el('span', `badge ${c.getAriaLabelFromTitle ? 'warn' : 'neutral'}`, c.getAriaLabelFromTitle ? 'checked' : 'unchecked')
        );
        tr.append(flagCell);
        tr.append(el('td', 'text', c.ariaLabel || '— пусто —'));
        tr.append(el('td', 'text', c.cardDeckTitle || '— пусто —'));
        const resCell = el('td', 'result');
        resCell.append(badge(c.result), el('div', 'result-text', c.resultText));
        tr.append(resCell);
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
      details.append(wrap);
    }

    box.append(details);
  });

  if (!box.children.length) box.append(el('div', 'empty-note', 'Нет страниц для отображения.'));
}

function render() {
  if (!lastResponse) return;
  const onlyFix = $('onlyFix').checked;
  renderSummary(lastResponse.reports);
  renderPagesTable(lastResponse.reports, onlyFix);
  renderDetails(lastResponse.reports, onlyFix);
  $('resultsPanel').hidden = false;
}

/* ---------- Экспорт ---------- */

const HEADERS = [
  'Page path',
  'Page title',
  'Component #',
  'Component path',
  'arialabelCardDeckTitle',
  'ariaLabel',
  'cardDeckTitle',
  'Result code',
  'Result',
];

function flatRows() {
  const rows = [];
  for (const r of lastResponse.reports) {
    if (r.components.length === 0) {
      rows.push([r.path, r.pageTitle ?? '', '', '', '', '', '', r.pageResult, r.pageResultText + (r.error ? ` (${r.error})` : '')]);
      continue;
    }
    for (const c of r.components) {
      rows.push([
        r.path,
        r.pageTitle ?? '',
        c.index,
        c.componentPath,
        c.getAriaLabelFromTitle ? 'checked' : 'unchecked',
        c.ariaLabel,
        c.cardDeckTitle,
        c.result,
        c.resultText,
      ]);
    }
  }
  return rows;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function downloadCsv() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [HEADERS, ...flatRows()].map((r) => r.map(esc).join(';')).join('\r\n');
  download(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `carddeck-report-${stamp()}.csv`);
}

function downloadXls() {
  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const body = flatRows()
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  const html =
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>` +
    `<table border="1"><thead><tr>${HEADERS.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${body}</tbody></table></body></html>`;
  download(
    new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    `carddeck-report-${stamp()}.xls`
  );
}

function downloadJson() {
  download(
    new Blob([JSON.stringify(lastResponse, null, 2)], { type: 'application/json' }),
    `carddeck-report-${stamp()}.json`
  );
}

/* ---------- Запуск ---------- */

async function run() {
  const paths = parsePaths($('paths').value);
  const errorBox = $('error');
  errorBox.hidden = true;

  if (paths.length === 0) {
    errorBox.textContent = 'Добавьте хотя бы один путь к странице.';
    errorBox.hidden = false;
    return;
  }

  $('runBtn').disabled = true;
  $('progress').hidden = false;
  $('progressText').textContent = `Проверяем ${paths.length} страниц…`;

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, host: $('host').value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    lastResponse = data;
    render();
    $('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    errorBox.textContent = `Ошибка: ${err.message}`;
    errorBox.hidden = false;
  } finally {
    $('runBtn').disabled = false;
    $('progress').hidden = true;
  }
}

$('paths').addEventListener('input', updateCount);
$('runBtn').addEventListener('click', run);
$('clearBtn').addEventListener('click', () => {
  $('paths').value = '';
  $('file').value = '';
  lastResponse = null;
  $('resultsPanel').hidden = true;
  $('error').hidden = true;
  updateCount();
});
$('onlyFix').addEventListener('change', render);
$('csvBtn').addEventListener('click', downloadCsv);
$('xlsBtn').addEventListener('click', downloadXls);
$('jsonBtn').addEventListener('click', downloadJson);

$('file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const existing = $('paths').value.trim();
  $('paths').value = [...new Set([...parsePaths(existing), ...parsePaths(text)])].join('\n');
  updateCount();
});

updateCount();
