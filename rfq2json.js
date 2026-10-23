// One-time script: DLA RFQ PDF (Standard Form 18 + continuation sheets) -> JSON on stdout.
// macOS only; uses the built-in PDFKit, nothing to install.
//   osascript -l JavaScript rfq2json.js /path/to/SPE1C127Q0018.pdf > SPE1C127Q0018.json
ObjC.import('PDFKit');
ObjC.import('AppKit');

const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = n => String(n).padStart(2, '0');
const ymd = s => { const [y, m, d] = s.split(' '); return `${y}-${pad(MON[m])}-${d}`; }; // "2026 OCT 22"
const mdy = s => { const [m, d, y] = s.split('/'); return `${y}-${pad(m)}-${pad(d)}`; };  // "9/13/1988"
const int = m => (m ? +m[1] : null);
const unwrap = s => s.replace(/\s*\n\s*/g, ' ').trim();
const paras = s => s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
const must = (ok, what) => { if (!ok) throw new Error(`could not parse ${what}`); };

// Running header lines repeated on every continuation sheet.
const HEADER = /^(CONTINUATION SHEET|REFERENCE NO\. OF DOCUMENT|CONTINUED ON NEXT PAGE|PAGE \d+ OF \d+ PAGES|[A-Z0-9]{6}-\d{2}-[A-Z]-\d{4}$|SUPPLY\/SERVICE: PGC: .*CONT'D$)/;

// Page text, one printed line per line, with a blank line wherever the page leaves a vertical gap.
function pageText(page) {
  const lines = page.selectionForRect(page.boundsForBox(0)).selectionsByLine;
  let out = '', prevBottom = null;
  for (let i = 0; i < lines.count; i++) {
    const sel = lines.objectAtIndex(i), text = sel.string.js.trim(), b = sel.boundsForPage(page);
    if (!text || HEADER.test(text)) continue;
    if (prevBottom !== null) out += prevBottom - (b.origin.y + b.size.height) > 4 ? '\n\n' : '\n';
    out += text;
    prevBottom = b.origin.y;
  }
  return out;
}

// SF 18 tick boxes are drawn lines, not text: render page 1 and look inside the box left of each label.
function setAside(page) {
  const text = page.string.js, at = text.indexOf('THIS RFQ IS IS NOT');
  must(at >= 0, 'set-aside block');
  const pb = page.boundsForBox(0);
  const img = page.thumbnailOfSizeForBox({ width: pb.size.width * 4, height: pb.size.height * 4 }, 0);
  const bmp = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation), k = bmp.pixelsWide / pb.size.width;
  const dark = (x, y) => {
    const c = bmp.colorAtXY(Math.round((x - pb.origin.x) * k), Math.round((pb.origin.y + pb.size.height - y) * k))
      .colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
    return c.alphaComponent > 0.5 && c.redComponent + c.greenComponent + c.blueComponent < 1.5;
  };
  const ticked = (start, length) => {
    const r = page.selectionForRange({ location: start, length }).boundsForPage(page);
    const y = r.origin.y + r.size.height / 2;
    let x = r.origin.x - 1;
    while (!dark(x, y)) { x -= 0.25; must(x > r.origin.x - 20, 'set-aside checkbox'); } // walk left to the box edge
    for (let i = x - 8; i < x - 2; i += 0.25) if (dark(i, y)) return true;             // ink inside = the X
    return false;
  };
  const is = ticked(at + 9, 2), isNot = ticked(at + 12, 6); // "THIS RFQ [ ] IS [ ] IS NOT"
  must(is !== isNot, 'set-aside checkbox (expected exactly one ticked)');
  return is;
}

function address(block, extra) {
  const m = block.match(/^(.+?),? ([A-Z]{2}) (\d{5}(?:-\d{4})?)$/m);
  return { ...extra, lines: block.split('\n'), city: m?.[1] ?? null, state: m?.[2] ?? null, zip: m?.[3] ?? null };
}

// One CLIN block of Section B: the row under "ITEM NO. SUPPLIES/SERVICES ..." up to the next one.
function clin(text, govt) {
  const p = paras(text), get = re => text.match(re)?.[1] ?? null;
  const [row, ...nomenclature] = p[0].split('\n');
  const [, clin, nsn, qty, unit] = row.match(/^(\d{4}) (\S+) ([\d,.]+) (\S+)/);
  const qv = text.match(/QTY VARIANCE: PLUS (\d+)% MINUS (\d+)%/);
  const pk = p.findIndex(x => x.startsWith('PKGING DATA - '));
  const pp = p.indexOf('PARCEL POST ADDRESS:'), fr = p.indexOf('FREIGHT SHIPPING ADDRESS:');
  const shipTo = i => (i < 0 ? null : address(p[i + 2], { dodaac: p[i + 1] }));
  return {
    clin, nsn,
    nomenclature: nomenclature.join(''),
    quantity: +qty.replace(/,/g, ''),
    unit,
    pricing_terms: get(/^PRICING TERMS: (.+)$/m),
    qty_variance_pct: qv && { plus: +qv[1], minus: +qv[2] },
    inspection_point: get(/^INSPECTION POINT: (.+)$/m),
    acceptance_point: get(/^ACCEPTANCE POINT: (.+)$/m),
    fob: get(/^FOB: (\S+)/m),
    delivery_days_ado: int(text.match(/DELIVERY DATE: (\d+) DAYS ADO/)),
    rdd: govt[clin]?.rdd ?? null,
    pr: govt[clin]?.pr ?? null,
    prli: govt[clin]?.prli ?? null,
    packaging: pk < 0 ? null : {
      standard: p[pk].match(/^PKGING DATA - (\S+)/)[1],
      codes: Object.fromEntries([...p[pk].matchAll(/([A-Z][A-Z\/ ]*?):\s?(\S+)/g)].map(m => [m[1], m[2]])),
      instructions: p.slice(pk + 1, pp < 0 ? undefined : pp).map(unwrap),
    },
    ship_to: { parcel_post: shipTo(pp), freight: shipTo(fr) },
  };
}

// Clause headings: "52.246-2 TITLE (AUG 1996) FAR", "252.232-7006 ...", or DLA notes like "E08 TITLE (MAR 2025)".
// Long headings wrap onto a second line; clause body text is skipped.
const CLAUSE = /^(\d{2,3}\.\d{3}-\d+|[A-Z]\d{2}) (?=[A-Z])/;
const DATE = /\s*\(([A-Z]{3} \d{4})\)/g;
function clauses(section, text) {
  const lines = text.split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!CLAUSE.test(lines[i])) continue;
    let h = lines[i];
    for (let k = 0; k < 2 && !/\([A-Z]{3} \d{4}\)/.test(h) && lines[i + 1]; k++) h += (h.endsWith('-') ? '' : ' ') + lines[++i];
    if (/^(FAR|DFARS)$/.test(lines[i + 1] ?? '')) i++;
    h = h.replace(/\s+(FAR|DFARS)$/, '');
    const number = h.split(' ')[0];
    const dev = h.match(/\s*\((?:CLASS )?DEVIATION ([^)]+)\)/), alt = h.match(/,? ALT ([IVX]+)\b/);
    const rest = h.slice(number.length).replace(dev?.[0] ?? '', '').replace(alt?.[0] ?? '', '');
    const [date, alt_date] = [...rest.matchAll(DATE)].map(m => m[1]);
    out.push({
      section, number,
      title: rest.replace(DATE, '').replace(/[\s,]+$/, '').trim(),
      date: date ?? null,
      ...(alt && { alt: alt[1] }),
      ...(alt_date && { alt_date }),
      ...(dev && { deviation: dev[1] }),
    });
  }
  return out;
}

function run([path]) {
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(path ?? ''));
  must(path && !doc.isNil(), `PDF ${path}`);

  // Page 1 (SF 18): each value comes just before its block label in the text stream.
  const page1 = doc.pageAtIndex(0), p1 = page1.string.js;
  const before = label => p1.match(new RegExp(`^(.+)\\n${label}`, 'm'))?.[1];
  const number = before('1\\. REQUEST NO\\.'), issued = before('2\\. DATE ISSUED');
  const [firstDate, due] = p1.match(/^\d{4} [A-Z]{3} \d{2}$/gm) ?? []; // block 2, then block 10
  must(/^[A-Z0-9]{6}-\d{2}-[A-Z]-\d{4}$/.test(number) && firstDate === issued && due, 'page 1 header');
  const office = p1.match(/^3\. REQUISITION.*\n([\s\S]*?)\nBuyer: (.+?) (\S+) Tel: (\S+)\nEmail: (\S+)/m);
  must(office, 'issuing office / buyer');

  // Pages 2+: front-matter notes, then sections B..M (a section continued on later pages is merged).
  const body = [];
  for (let i = 1; i < doc.pageCount; i++) body.push(pageText(doc.pageAtIndex(i)));
  const [front, ...split] = body.join('\n\n').split(/^SECTION ([A-Z])\b.*$/m);
  const sec = {};
  for (let i = 0; i < split.length; i += 2) sec[split[i]] = (sec[split[i]] ?? '') + '\n\n' + split[i + 1];
  must(sec.B, 'section B');

  // GOVT USE table rows: ITEM PR PRLI EXT-PR EXT-PRLI EXT-MATERIAL RDD
  const govt = {};
  for (const [, c, pr, prli, rdd] of sec.B.matchAll(/^(\d{4}) (\d+) (\d{4}) \S+ \S+ \S+ (\d{1,2}\/\d{1,2}\/\d{4})$/gm))
    govt[c] = { pr, prli, rdd: mdy(rdd) };

  const CODE = /^(R[A-Z]\d{3})[,:]\s*/; // DLA master-list requirement codes (RA001, RP001, ...)
  const items = sec.B.split(/^SUPPLIES\/SERVICES: PGC: /m).slice(1).map(block => {
    const [head, ...clinBlocks] = block.split(/^ITEM NO\. SUPPLIES\/SERVICES.*$/m);
    const p = paras(head), pgc = p.shift(), reference_docs = [];
    let description = null;
    if (p[0] === 'ITEM DESCRIPTION:') {
      p.shift();
      const text = [];
      for (const line of p.shift().split('\n')) {
        const ref = line.match(/^(.*\S)\s+(\d{1,2}\/\d{1,2}\/\d{4})$/); // "DD 22571 B-3-122 9/13/1988"
        if (ref) reference_docs.push({ id: ref[1], date: mdy(ref[2]) });
        else text.push(line.replace(/"/g, '').trim());
      }
      description = text.join(' ').replace(/,$/, '');
    }
    return {
      pgc, description, reference_docs,
      requirement_codes: p.filter(x => CODE.test(x)).map(x => ({ code: x.match(CODE)[1], text: unwrap(x.replace(CODE, '')) })),
      notes: p.filter(x => !CODE.test(x)).map(unwrap),
      clins: clinBlocks.map(b => clin(b, govt)),
    };
  });
  must(items.length && items.every(i => i.clins.length), 'line items');

  // Fill-ins from clause text: 52.209-4 (first article) and 52.246-17 (warranty).
  const I = unwrap(sec.I ?? '');
  const fa = I.match(/deliver (\d+) unit\(s\) of Lot\/Item (\S+) within (\d+) calendar days from the date of this contract to the Government at (.+?) \[insert/);

  return JSON.stringify({
    source_file: path.split('/').pop(),
    solicitation: {
      number,
      issue_date: ymd(issued),
      quote_due_date: ymd(due),
      purchase_request: before('3\\. REQUISITION') ?? null,
      small_business_set_aside: setAside(page1),
      quote_validity_days: int(p1.match(/valid for (\d+) days/)),
    },
    issuing_office: address(office[1]),
    buyer: { name: office[2], code: office[3], phone: office[4], email: office[5] },
    items,
    first_article: fa && {
      quantity: +fa[1],
      lot_item: fa[2],
      due_days_after_award: +fa[3],
      govt_decision_days: int(I.match(/Within (\d+) calendar days after the Government receives the first article/)),
      ship_to: fa[4],
    },
    warranty_months: int(I.match(/warrants that for (\d+) months/)),
    notes: paras(front).map(unwrap).filter(x => !/^[*\s]+$/.test(x)),
    clauses: Object.entries(sec).filter(([s]) => s !== 'B').flatMap(([s, t]) => clauses(s, t)),
  }, null, 2);
}
