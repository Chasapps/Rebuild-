// SpendLite v6.6.27 – Month filter + export respects selected month
// Debit-only version

const COL = { DATE: 2, DEBIT: 5, LONGDESC: 9 }; // 0-based mapping for 10-col export

let CURRENT_TXNS = [];
let CURRENT_RULES = [];
let CURRENT_FILTER = null;
let MONTH_FILTER = "";
let CURRENT_PAGE = 1;
const PAGE_SIZE = 10;

function formatMonthLabel(ym) {
  if (!ym) return 'All months';
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function friendlyMonthOrAll(label) {
  if (!label) return 'All months';
  if (/^\d{4}-\d{2}$/.test(label)) return formatMonthLabel(label);
  return String(label);
}
function forFilename(label) { return String(label).replace(/\s+/g, '_'); }

const LS_KEYS = {
  RULES: 'spendlite_rules_v6626',
  FILTER: 'spendlite_filter_v6626',
  MONTH: 'spendlite_month_v6627',
  TXNS_COLLAPSED: 'spendlite_txns_collapsed_v7',
  TXNS_JSON: 'spendlite_txns_json_v7'
};

function toTitleCase(str) {
  if (!str) return '';
  return String(str).toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m, p1) => p1.toUpperCase());
}

function parseAmount(s) {
  if (s == null) return 0;
  s = String(s).replace(/[^\d\-,.]/g, '').replace(/,/g, '');
  return Number(s) || 0;
}

function loadCsvText(csvText) {
  const rows = Papa.parse(csvText.trim(), { skipEmptyLines: true }).data;
  const startIdx = rows.length && isNaN(parseAmount(rows[0][COL.DEBIT])) ? 1 : 0;
  const txns = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 10) continue;
    const effectiveDate = r[COL.DATE] || '';
    const raw = parseAmount(r[COL.DEBIT]);
    const longDesc = (r[COL.LONGDESC] || '').trim();
    if (!Number.isFinite(raw) || raw === 0) continue;
    if (raw < 0) continue; // drop credits
    const amount = raw;    // debit stays positive
    txns.push({ date: effectiveDate, amount, description: longDesc });
  }
  CURRENT_TXNS = txns; saveTxnsToLocalStorage();
  try { updateMonthBanner(); } catch {}
  rebuildMonthDropdown();
  applyRulesAndRender();
  return txns;
}

// simplified categorise
function matchesKeyword(descLower, keywordLower) {
  if (!keywordLower) return false;
  const parts = String(keywordLower).split(/\s+/).filter(Boolean);
  let pos = 0;
  for (const p of parts) {
    const i = descLower.indexOf(p, pos);
    if (i === -1) return false;
    pos = i + p.length;
  }
  return true;
}

function categorise(txns, rules) {
  for (const t of txns) {
    const descLower = String(t.desc || t.description || "").toLowerCase();
    const amount = Math.abs(Number(t.amount || 0));
    let matched = null;
    for (const r of rules) { if (matchesKeyword(descLower, r.keyword)) { matched = r.category; break; } }
    if (matched && String(matched).toUpperCase() === "PETROL" && amount <= 2) { matched = "COFFEE"; }
    t.category = matched || "UNCATEGORISED";
  }
}

function computeCategoryTotals(txns) {
  const byCat = new Map();
  for (const t of txns) {
    const cat = (t.category || 'UNCATEGORISED').toUpperCase();
    byCat.set(cat, (byCat.get(cat) || 0) + t.amount);
  }
  const rows = [...byCat.entries()].sort((a,b) => b[1]-a[1]);
  const grand = rows.reduce((acc, [,v]) => acc + v, 0);
  return { rows, grand };
}

function renderMonthTotals() {
  const txns = getFilteredTxns(monthFilteredTxns());
  let debits = 0, count = 0;
  for (const t of txns) { debits += Number(t.amount) || 0; count++; }
  const el = document.getElementById('monthTotals');
  if (el) {
    const cat = CURRENT_FILTER ? ` + category "${CURRENT_FILTER}"` : "";
    el.innerHTML = `Showing <span class="badge">${count}</span> transactions for <strong>${friendlyMonthOrAll(MONTH_FILTER)}${cat}</strong> · Debits: <strong>$${debits.toFixed(2)}</strong>`;
  }
}

// (other functions unchanged except header in renderTransactionsTable labelled Debit)
