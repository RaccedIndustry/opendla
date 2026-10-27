// DLA RFQ PDF (Standard Form 18 + continuation sheets) -> JSON. M3 of docs/ARCHITECTURE.md.
// Reads both DLA layouts: manual RFQs ("Q" numbers) and DIBBS automated / IDC RFQs ("T", "U" numbers).
// Ported from the macOS-only rfq2json.js (PDFKit; see git history). New here: pdf.js page reading,
// procurementHistory() and the SOURCE fix ("CAGE" before the code, spaced P/Ns); the set-aside tick check is gone,
// the daily index has it. The rest is kept as it was checked against every RFQ of a DIBBS day, hence plain JS.
//   node dist/parser/parse.js <out-dir> <pdf>...   one <name>.json per PDF; a failure is one stderr line
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
/* eslint-disable no-useless-escape, no-sparse-arrays -- the ported parsing stays exactly as it was checked */

/** Bump when the output changes, so stored rows say which parser wrote them. */
export const PARSER_VERSION = 1;

const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = n => String(n).padStart(2, '0');
const ymd = s => { const [y, m, d] = s.split(' '); return `${y}-${pad(MON[m])}-${d}`; }; // "2026 OCT 22"
const date = s => {                                                                     // "9/13/1988"; "00/00/0000" = none
  if (!s || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) || !/[1-9]/.test(s)) return null;
  const [m, d, y] = s.split('/');
  return `${y}-${pad(m)}-${pad(d)}`;
};
const int = m => (m ? +m[1] : null);
const nsn = s => (s && /^\d{13}$/.test(s) ? s.replace(/^(\d{4})(\d{2})(\d{3})(\d{4})$/, '$1-$2-$3-$4') : s ?? null);
const phone = s => (s && (s.match(/\d/g) ?? []).length >= 7 && /[1-9]/.test(s) ? s : null); // drops "0001", "XXX-XXX-XXXX"
// Joins wrapped lines with a space, except a URL/email split at the margin ("VIMSUPPORT@dla." + "mil").
const unwrap = s => s.replace(/(\S*(?:@|:\/\/|%)\S*[.%\/])\n(?=[a-z0-9])/g, '$1').replace(/\s*\n\s*/g, ' ').trim();
const paras = s => s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
const must = (ok, what) => { if (!ok) throw new Error(`could not parse ${what}`); };
const SOL = /^[A-Z0-9]{6}-\d{2}-[A-Z]-[A-Z0-9]{4}$/; // SPE4A6-26-T-05C0
const DAY = /^\d{4} [A-Z]{3} \d{2}$/;              // 2026 OCT 22

// "SECTION B" or "SECTION I - CONTRACT CLAUSES (CONTINUED)"; not body text like "SECTION A OF THIS SOLICITATION."
const SECTION = /^SECTION ([A-Z])(?: - .*)?$/m;

// Running header lines repeated on every continuation sheet.
const HEADER = /^(CONTINUATION SHEET|REFERENCE NO\. OF DOCUMENT|CONTINUED ON NEXT PAGE|PAGE \d+ OF \d+ PAGES|[A-Z0-9]{6}-\d{2}-[A-Z]-[A-Z0-9]{4}$|(SUPPLY\/SERVICE|PR): .*CONT[’']D$)/;

// PDFKit's line box: one font size tall, this far below the baseline (measured per font family).
const DESCENT = { monospace: 0.246, serif: 0.25, 'sans-serif': 0.23 };

// Printed lines of a page in content order, with their position (y measured from the top of the page).
// pdf.js hands out text runs. Runs on one baseline are one printed line, as in PDFKit, unless they are
// separate boxes of the form: a wide gap with nothing (not even a space) between them, or, in tagged
// PDFs (manual RFQs), a wide gap into another marked-content cell (a clause table's Number | Title | Date).
async function pageLines(page) {
  const H = page.view[3], { items, styles } = await page.getTextContent({ includeMarkedContent: true }), out = [];
  let spaced = false, cell = 0;
  for (const it of items) {
    if (it.type) { if (it.type !== 'endMarkedContent') cell++; continue; }
    if (!it.str.trim()) { spaced = true; continue; }
    const [, , , size, x, y] = it.transform, l = out.at(-1), gap = x - l?.right;
    const bottom = H - y + (DESCENT[styles[it.fontName]?.fontFamily] ?? 0.23) * size, top = bottom - size;
    if (l && Math.abs(y - l.y) < 0.5 && gap > -1 && (spaced || gap < size / 2) && (cell === l.cell || gap < size * 0.3)) {
      l.text += (gap > size / 10 ? ' ' : '') + it.str;
      Object.assign(l, { right: x + it.width, top: Math.min(l.top, top), bottom: Math.max(l.bottom, bottom), cell });
    } else out.push({ text: it.str, x, right: x + it.width, y, top, bottom, cell });
    spaced = false;
  }
  for (const l of out) l.text = l.text.replace(/\s+/g, ' ').trim();
  return out;
}

// Page text, one printed line per line, with a blank line wherever the page leaves a vertical gap.
// DIBBS prints Section A double-spaced: there a one-line gap is still inside the paragraph.
function pageText(lines) {
  const L = lines.filter(l => !HEADER.test(l.text));
  const gap = i => L[i].top - L[i - 1].bottom, h = i => L[i].bottom - L[i].top;
  let tight = 0, loose = 0;
  for (let i = 1; i < L.length; i++) if (Math.abs(gap(i)) < 2) tight++; else if (Math.abs(gap(i) - h(i)) < 2) loose++;
  let doubled = SECTION.exec(L[0]?.text ?? '')?.[1] === 'A' && loose > tight, out = L[0]?.text ?? '';
  for (let i = 1; i < L.length; i++) {
    if (SECTION.test(L[i].text)) doubled = false; // single-spaced again once another section starts
    out += (gap(i) > (doubled ? h(i) + 4 : 4) ? '\n\n' : '\n') + L[i].text;
  }
  return out;
}

// Page 1 is a fixed form: read each block from where it sits below its label, because the two
// DLA generators emit the same page in different text orders (value-then-label vs label-then-value).
function page1(L) {
  const at = re => { const l = L.find(x => re.test(x.text)); must(l, `page 1 label ${re.source}`); return l; };
  const box = (x0, x1, top, bottom) => L.filter(l => l.x >= x0 && l.x < x1 && l.top > top + 2 && l.top < bottom)
    .sort((a, b) => a.top - b.top || a.x - b.x).map(l => l.text);
  const [b1, b2, b3, b4, rating, b5, b6, b8, b10, b11] = [/^1\. REQUEST NO/, /^2\. DATE ISSUED/, /^3\. REQUISITION/,
    /^4\. CERT/, /^RATING$/, /^5\. ISSUED BY/, /^6\. DELIVER BY/, /^8\. TO:/, /^BEFORE CLOSE OF BUSINESS/, /^11\. SCHEDULE/].map(at);
  const office = box(0, b6.x - 5, b5.top, b8.top);
  const bi = office.findIndex(t => /^(Buyer|Name):/.test(t));
  must(bi > 0, 'buyer line');
  // "Name: X Y Buyer Code:Z Tel: ... Fax: ..." (automated) or "Buyer: X Y Z Tel: ..." (manual)
  const kv = {}, parts = office[bi].split(/(Name|Buyer Code|Buyer|Tel|Fax):/);
  for (let i = 1; i < parts.length; i += 2) kv[parts[i]] = parts[i + 1].trim();
  if (kv.Buyer) [, kv.Name, kv['Buyer Code']] = kv.Buyer.match(/^(.*) (\S+)$/) ?? [, kv.Buyer, null];
  return {
    number: box(b1.x - 10, b2.x - 5, b1.top, b5.top)[0],
    issued: box(b2.x - 5, b3.x - 5, b2.top, b5.top)[0],
    pr: box(b3.x - 5, b4.x - 5, b3.top, b5.top)[0] ?? null,
    rating: box(rating.x - 10, Infinity, rating.top, b5.top)[0] ?? null, // DPAS rating, e.g. "DO-C9"
    due: box(0, b11.x, b10.top, b11.top).find(t => DAY.test(t)),
    office: office.slice(0, bi),
    buyer: {
      name: kv.Name || null, code: kv['Buyer Code'] || null, phone: phone(kv.Tel), fax: phone(kv.Fax),
      email: office.find(t => t.startsWith('Email:'))?.replace(/^Email:\s*/, '') || null,
    },
  };
}

const COUNTRY = /^[A-Z]{2,3}$/; // last address line: "US", "USA", "DE", "KR"
function address(block, extra) {
  const lines = block.split('\n'), country = lines.length > 1 && COUNTRY.test(lines.at(-1)) ? lines.at(-1) : null;
  const us = block.match(/^(.+?),? ([A-Z]{2}) (\d{5}(?:-\d{4})?)$/m);       // "PHOENIX AZ 85043"
  const intl = !us && country && lines.at(-2).match(/^(.+?),? (\d{4,6})$/); // "KAISERSLAUTERN 67657" then "DE"
  return { ...extra, lines, city: (us || intl)?.[1] ?? null, state: us?.[2] ?? null, zip: us?.[3] ?? intl?.[2] ?? null, country };
}

const CODE = /^([RI][A-Z]\d{3})[,:]\s*/;                          // DLA tech/quality codes: RA001, RD002, IP056, ...
// "SPS TECHNOLOGIES, LLC 56878 P/N 5893927-59"; some print "CAGE" before the code, and a P/N may hold spaces.
const SOURCE = /^(.+?)(?: CAGE)? ((?=[A-Z0-9]*\d)[A-Z0-9]{5}) P\/N (.+)$/;
const ADDRESSES = { parcel_post: 'PARCEL POST ADDRESS:', freight: 'FREIGHT SHIPPING ADDRESS:',
  bulk_break_point: 'BULK BREAK POINT:', freight_forwarder: 'FREIGHT FORWARDER:', mark_for: 'MARKFOR' };
const FIELD = /^(PRICING TERMS|QTY VARIANCE|INSPECTION POINT|ACCEPTANCE POINT|FOB|DELIVER FOB|DELIVERY \(IN DAYS\)|NSN\/MATERIAL|Need Ship Date|Original Required Delivery Date|PREP FOR DELIVERY):/;

// One item of Section B: header ("PR: ..." or "SUPPLIES/SERVICES: ..."), description, then CLIN blocks.
function item(text, govt) {
  text = text.replace(/\n\n+(?=REVISION NR |PART PIECE NUMBER:)/g, '\n'); // page break inside a reference block
  const [head, ...clinBlocks] = text.split(/^(?:ITEM NO\. SUPPLIES\/SERVICES|CLIN PR PRLI UI) .*$/m);
  const p = paras(head), hdr = p.shift();
  const reference_docs = [], approved_sources = [], requirement_codes = [], notes = [], desc = [];
  // Description: the line under "ITEM DESCRIPTION" (automated) or the next paragraph (manual).
  let d = (p.shift() ?? '').split('\n').slice(1);
  if (!d.length) d = (p.shift() ?? '').split('\n');
  const cut = d.findIndex(l => CODE.test(l));
  if (cut >= 0) p.unshift(d.splice(cut).join('\n'));
  for (const l of d) {
    const ref = l.match(/^(.*\S)\s+(\d{1,2}\/\d{1,2}\/\d{4})$/); // "DD 22571 B-3-122 9/13/1988"
    if (ref) reference_docs.push({ type: null, cage: null, number: ref[1], revision: null, date: date(ref[2]), part_number: null });
    else desc.push(l.replace(/"/g, '').trim());
  }
  for (const para of p) {
    const lines = para.split('\n');
    let note = [], code = null, m;
    const flush = () => { if (note.length) notes.push(unwrap(note.join('\n'))); note = []; };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if ((m = l.match(CODE))) {
        flush();
        requirement_codes.push((code = { code: m[1], text: l.slice(m[0].length) }));
      } else if ((m = l.match(/^IAW REFERENCE (\S+)(?: NR)? ?(.*)$/))) { // "IAW REFERENCE DRAWING NR 53711 5893927"
        flush(); code = null;
        const cage = m[2].match(/^((?=[A-Z0-9]*\d)[A-Z0-9]{5}) (.+)$/); // drawings/QAPs lead with a CAGE; specs don't
        const ref = { type: m[1], cage: cage ? cage[1] : null, number: (cage ? cage[2] : m[2]) || null,
          revision: null, date: null, part_number: null };
        const rev = lines[i + 1]?.match(/^REVISION NR ?(\S*?) ?DTD ?(\S*)$/);
        if (rev) { i++; ref.revision = rev[1] || null; ref.date = date(rev[2]); }
        const pn = lines[i + 1]?.match(/^PART PIECE NUMBER: ?(.*)$/);
        if (pn) { i++; ref.part_number = pn[1] || null; }
        reference_docs.push(ref);
      } else if ((m = l.match(SOURCE))) {
        flush(); code = null;
        approved_sources.push({ name: m[1], cage: m[2], part_number: m[3] });
      } else if (code) code.text += '\n' + l;
      else note.push(l);
    }
    flush();
  }
  for (const c of requirement_codes) c.text = unwrap(c.text);
  const nsnLine = hdr.match(/NSN\/MATERIAL:(\S+)/) ?? hdr.match(/^SUPPLIES\/SERVICES: (?!PGC)(\S+)/);
  return {
    pgc: hdr.match(/PGC: (\S+)/)?.[1] ?? null,
    pr: hdr.match(/^PR: (\d+)/)?.[1] ?? null,
    nsn: nsn(nsnLine?.[1]),
    description: desc.join(' ').replace(/,$/, '') || null,
    reference_docs, approved_sources, requirement_codes, notes,
    clins: clinBlocks.map(b => clin(b, govt)),
  };
}

// One CLIN block: the row under the CLIN table header up to the next one.
function clin(text, govt) {
  const p = paras(text), get = re => text.match(re)?.[1] ?? null, used = new Set([0]);
  const [row, ...rest] = p[0].split('\n');
  let c, m = row.match(/^(\d{4}) (\d{10}) (?:(\d{4}) )?([A-Z]{2}) ([\d,.]+)$/); // automated: CLIN PR [PRLI] UI QTY
  if (m) c = { clin: m[1], nsn: get(/^NSN\/MATERIAL:(\S+)/m), nomenclature: null, unit: m[4], qty: m[5],
    pr: /[1-9]/.test(m[2]) ? m[2] : null, prli: m[3] ?? null };
  else if ((m = row.match(/^(\d{4}) (\S+(?: - \S+)?) ([\d,.]+) ([A-Z]{2}) /))) { // manual: ITEM NSN QTY UNIT $ ___ $ ___
    const g = govt[m[1]] ?? {};                                                 // (first-article CLIN: "0001 - S00000053")
    c = { clin: m[1], nsn: m[2].replace(' - ', ''), unit: m[4], qty: m[3], pr: g.pr ?? null, prli: g.prli ?? null, rdd: g.rdd,
      nomenclature: rest.reduce((a, l) => (a ? a + (l.startsWith(',') ? '' : ' ') + l : l), '') || null }; // wraps at "," or " "
  }
  must(c, `CLIN row "${row}"`);

  // Packaging codes split by a page break continue in the next paragraph.
  let pk = p.findIndex(x => /^PKGING DATA\s*-/.test(x));
  while (pk >= 0 && /^(QUP|PRES MTHD|WRAP MAT|CUSH|UNIT CONT|INTRMDTE|PACK CODE|MARKING SHALL|SPECIAL MARKING CODE)/.test(p[pk + 1] ?? ''))
    p.splice(pk, 2, p[pk] + '\n' + p[pk + 1]);

  const ship_to = {};
  let firstAddr = p.length;
  for (const [key, label] of Object.entries(ADDRESSES)) {
    const i = p.indexOf(label);
    ship_to[key] = null;
    if (i < 0) continue;
    firstAddr = Math.min(firstAddr, i);
    const dodaac = /^[A-Z0-9]{6}$/.test(p[i + 1] ?? '') ? p[i + 1] : null, j = i + (dodaac ? 2 : 1);
    [i, i + 1, j].forEach(k => used.add(k));
    if (!p[j] || Object.values(ADDRESSES).includes(p[j])) continue;
    let block = p[j];
    const tail = (p[j + 1] ?? '').split('\n'); // a page break can push the last lines ("CITY ST ZIP", "US") to the next page
    if (!COUNTRY.test(block.split('\n').at(-1)) && tail.length <= 4 && COUNTRY.test(tail.at(-1)) && /\d{4,6}(-\d{4})?$/.test(tail.at(-2) ?? '')) {
      block += '\n' + p[j + 1];
      used.add(j + 1);
    }
    ship_to[key] = address(block, { dodaac });
  }
  let packaging = null;
  if (pk >= 0) {
    packaging = {
      standard: p[pk].match(/^PKGING DATA\s*-\s*(MIL-STD-\S+)/)?.[1] ?? null,
      codes: Object.fromEntries([...p[pk].matchAll(/([A-Z][A-Z\/ ]*?):\s?(\S+)/g)].map(x => [x[1], x[2]])),
      instructions: p.slice(pk + 1, Math.max(pk + 1, firstAddr)).map(unwrap),
    };
    for (let i = pk; i < Math.max(pk + 1, firstAddr); i++) used.add(i);
  }
  p.forEach((x, i) => { // label lines parsed below, GOVT USE table, price-break table, "* * *" separators
    if (x.split('\n').every(l => FIELD.test(l) || /^[*\s]+$/.test(l)) || /^GOVT USE\b/.test(x) || /CLIN Range From/.test(x)) used.add(i);
  });
  const qv = text.match(/QTY VARIANCE: PLUS (\d+)% MINUS (\d+)%/);
  const breaks = [...text.matchAll(/^\d{4} (\d{13}) (\d{13}) \$ _+ (\d+)$/gm)]
    .map(x => ({ qty_from: +x[1], qty_to: +x[2], delivery_days: +x[3] }));
  return {
    clin: c.clin, nsn: nsn(c.nsn), nomenclature: c.nomenclature,
    quantity: +c.qty.replace(/,/g, ''), unit: c.unit,
    pricing_terms: get(/^PRICING TERMS: (.+)$/m),
    qty_variance_pct: qv && { plus: +qv[1], minus: +qv[2] },
    inspection_point: get(/^INSPECTION POINT: (.+)$/m),
    acceptance_point: get(/^ACCEPTANCE POINT: (.+)$/m),
    fob: get(/^(?:DELIVER )?FOB: (\S+)/m),
    delivery_days_ado: int(text.match(/^DELIVERY \(IN DAYS\):(\d+)/m) ?? text.match(/DELIVERY DATE: (\d+) DAYS ADO/)),
    rdd: c.rdd ?? date(get(/^Original Required Delivery Date:(\S+)/m)),
    need_ship_date: date(get(/^Need Ship Date:(\S+)/m)),
    pr: c.pr, prli: c.prli,
    ...(breaks.length && { price_breaks: breaks }),
    packaging, ship_to,
    notes: p.filter((_, i) => !used.has(i)).map(unwrap),
  };
}

// Clause headings: "52.246-2 TITLE (AUG 1996) FAR", "252.203-7000 TITLE (SEPT 2011) (DFARS)", DLA notes "E08 TITLE (MAR 2025)".
// Long headings wrap onto the next lines; clause body text is skipped.
const CLAUSE = /^(\d{2,3}\.\d{3}-\d+|[A-Z]\d{2}) (?=[A-Z])/;
const DATE = /\s*\(([A-Za-z]{3,4})\.? (\d{4})\)/g;
function clauses(section, text) {
  const lines = text.split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!CLAUSE.test(lines[i])) continue;
    let h = lines[i];
    for (let k = 0; k < 2 && !/\([A-Za-z]{3,4}\.? \d{4}\)/.test(h) && lines[i + 1]; k++) h += (/\w-$/.test(h) ? '' : ' ') + lines[++i];
    if (/^\(?(FAR|DFARS|DLAD)\)?$/.test(lines[i + 1] ?? '')) i++;
    h = h.replace(/\s+\(?(FAR|DFARS|DLAD)\)?$/, '');
    const number = h.split(' ')[0];
    const dev = h.match(/\s*\((?:CLASS )?DEVIATION ([^)]+)\)/i), alt = h.match(/,? ALT(?:ERNATE)? ([IVX]+)\b/);
    const rest = h.slice(number.length).replace(dev?.[0] ?? '', '').replace(alt?.[0] ?? '', '');
    const [d, alt_date] = [...rest.matchAll(DATE)].map(x => `${x[1].slice(0, 3).toUpperCase()} ${x[2]}`); // SEPT -> SEP
    out.push({
      section, number,
      title: rest.replace(DATE, '').replace(/[\s,]+$/, '').trim(),
      date: d ?? null,
      ...(alt && { alt: alt[1] }),
      ...(alt_date && { alt_date }),
      ...(dev && { deviation: dev[1] }),
    });
  }
  return out;
}

// DIBBS prints the NSN's past awards as a table among the notes: a "Procurement History for NSN/FSC:<NIIN>/<FSC>"
// header, the column titles, then rows "<CAGE> <contract> <qty> <unit price> <yyyymmdd> <surplus Y/N>". The header
// repeats after a page break, and the last rows can run into the next paragraph, which stays a note.
const PH_HEAD = /^Procurement History for NSN\/FSC:([A-Z0-9]{9})\/(\d{4})\s*/; // NIIN or a local "LL..." number
const PH_COLS = /^(?:CAGE Contract Number Quantity Unit Cost AWD Date Surplus Material)?\s*\.?\s*/;
const PH_ROW = /^(NOT FO|[A-Z0-9]{5,6})(?: (\S+))? (\d[\d.]*) (\d[\d.]*) (\d{4})(\d\d)(\d\d) ([YN])(?: |$)/; // NOT FO: no CAGE

/** Splits the procurement history rows out of the notes. */
export function procurementHistory(notes) {
  const history = [], rest = [];
  let nsnOf = null;
  for (let note of notes) {
    const head = note.match(PH_HEAD);
    if (head) [nsnOf, note] = [nsn(head[2] + head[1]), note.slice(head[0].length)];
    if (nsnOf) {
      note = note.replace(PH_COLS, '');
      for (let m; (m = note.match(PH_ROW)); note = note.slice(m[0].length))
        history.push({
          nsn: nsnOf, cage: m[1] === 'NOT FO' ? null : m[1], contract: m[2] ?? null,
          quantity: +m[3], unit_price: +m[4], award_date: `${m[5]}-${m[6]}-${m[7]}`, surplus: m[8] === 'Y',
        });
      if (!note) continue;
      nsnOf = null; // any other text ends the table
    }
    rest.push(note);
  }
  return { history, notes: rest };
}

/** One RFQ PDF to its JSON. Throws "could not parse ..." rather than return partial data. */
export async function parseRfq(bytes, sourceFile) {
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 });
  try {
    return await convert(await task.promise, sourceFile);
  } finally {
    await task.destroy();
  }
}

async function convert(doc, sourceFile) {
  const page = await pageLines(await doc.getPage(1)), f = page1(page);
  must(SOL.test(f.number ?? '') && DAY.test(f.issued ?? '') && f.due, 'page 1 header');

  // Pages 2+: front matter, then sections A..M (a section continued on later pages is merged).
  const pages = [];
  for (let i = 2; i <= doc.numPages; i++) {
    await setImmediate(); // one page at a time, so the API keeps answering during a day's parse
    pages.push(pageText(await pageLines(await doc.getPage(i))));
  }
  const body = pages.join('\n\n');
  const [front, ...split] = body.split(SECTION);
  const sec = {};
  for (let i = 0; i < split.length; i += 2) sec[split[i]] = (sec[split[i]] ?? '') + '\n\n' + split[i + 1];
  must(sec.B, 'section B');

  // Manual RFQs: GOVT USE table rows "ITEM PR PRLI EXT-PR EXT-PRLI EXT-MATERIAL RDD".
  const govt = {};
  for (const [, c, pr, prli, rdd] of sec.B.matchAll(/^(\d{4}) (\d+) (\d{4}) \S+ \S+ \S+ (\d{1,2}\/\d{1,2}\/\d{4})$/gm))
    govt[c] = { pr, prli, rdd: date(rdd) };
  // An item starts at a "SUPPLIES/SERVICES:" or "PR:" header followed by ITEM DESCRIPTION (not a price-break table).
  const items = sec.B.split(/\n\n(?=(?:SUPPLIES\/SERVICES: |PR: )[^\n]*(?:\n[^\n]+)*\n\nITEM DESCRIPTION)/)
    .filter(t => /^(SUPPLIES\/SERVICES: |PR: )/.test(t)).map(t => item(t, govt));
  must(items.length && items.every(i => i.clins.length), 'line items');

  // First article: Section A block (automated) or 52.209-3/-4 fill-in (manual); warranty: 52.246-17 fill-in.
  const F = unwrap([front, sec.A, sec.I].filter(Boolean).join('\n\n'));
  const fa = F.match(/shall (?:deliver|test) ([^.]*?) unit\(s\) of Lot\/Item\s*(.*?)\s*(?:within|as specified)/i);
  let faAt = F.match(/unit\(s\) of Lot\/Item[^.]*? to the Government at (.+?) (?:\[insert|for first article tests)/i)?.[1] ?? null;
  if (/location specified below/i.test(faAt ?? ''))
    faAt = F.match(/for first article tests\.? (.+?) within \d+ calendar days after the Government receives/i)?.[1] ?? faAt;

  const { history, notes } = procurementHistory(
    paras([front, sec.A].filter(Boolean).join('\n\n')).map(unwrap).filter(x => !/^[*\s]+$/.test(x)));
  return {
    source_file: sourceFile,
    solicitation: {
      number: f.number,
      issue_date: ymd(f.issued),
      quote_due_date: ymd(f.due),
      purchase_request: f.pr,
      dpas_rating: f.rating,
      naics: unwrap(body).match(/(?:NORTH AMERICAN INDUSTRY CLASSIFICATION SYSTEM|NAICS code)\s*[(\[]?(\d{6})/)?.[1] ?? null,
      quote_validity_days: int(page.map(l => l.text).join('\n').match(/valid for (\d+) days/)),
    },
    issuing_office: address(f.office.join('\n')),
    buyer: f.buyer,
    items,
    first_article: fa && {
      testing: F.match(/FIRST ARTICLE APPROVAL\s*[-–]+\s*(GOVERNMENT|CONTRACTOR) TESTING/i)?.[1].toUpperCase() ?? null,
      quantity: int(fa[1].match(/(\d+)/)),
      lot_item: fa[2] || null,
      // days after award the units (government testing) or the test report (contractor testing) are due
      due_days_after_award: int(F.match(/(?:unit\(s\) of Lot\/Item|first article test report)[^.]*? within (\d+) calendar days from the date of this contract/i)),
      govt_decision_days: int(F.match(/within (\d+) calendar days after the Government receives the (?:first article|test report)/i)),
      ship_to: faAt,
    },
    warranty_months: int((sec.I ? unwrap(sec.I) : '').match(/warrants that for (\d+) months/)),
    notes,
    procurement_history: history,
    clauses: Object.entries(sec).filter(([s]) => s !== 'A' && s !== 'B').flatMap(([s, t]) => clauses(s, t)),
  };
}

if (import.meta.main) {
  const [out, ...files] = process.argv.slice(2), ms = [];
  for (const file of files) {
    const t = performance.now();
    try {
      const json = await parseRfq(await readFile(file), basename(file));
      await writeFile(join(out, basename(file).replace(/\.pdf$/i, '.json')), JSON.stringify(json, null, 2));
      ms.push(performance.now() - t);
    } catch (e) {
      process.exitCode = 1;
      console.error(`${file}: ${e.message}`);
    }
  }
  ms.sort((a, b) => a - b);
  console.log(`${ms.length} PDFs, median ${Math.round(ms[ms.length >> 1] ?? 0)} ms, max ${Math.round(ms.at(-1) ?? 0)} ms`);
}
