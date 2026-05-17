/**
 * Dependency-free Smoke-Tests für die Parser-Hilfsfunktionen.
 *
 * Inhaltlich identisch zu den Funktionen in parser.ts — wir kopieren sie
 * hier, um sie auch ohne cheerio (also ohne npm install) testen zu können.
 * Reine Logikvalidierung; das eigentliche DOM-Walking wird beim ersten
 * echten npm-Lauf gegen die Fixture verifiziert.
 */

import { strict as assert } from 'node:assert';

const MONTHS_DE = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};
const WEEKDAYS_DE = {
  montag: 'Mo', dienstag: 'Di', mittwoch: 'Mi', donnerstag: 'Do',
  freitag: 'Fr', samstag: 'Sa', sonntag: 'So',
};

const DATE_RE = /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/i;
const TIME_RE = /\b(\d{1,2}):(\d{2})(?:\s*Uhr)?\b/;
const PRICE_RE = /(\d+(?:[.,]\d{1,2})?)\s*€/;

function parseGermanDateTime(dateText, timeText) {
  const match = dateText.match(DATE_RE);
  if (!match) return null;
  const [, weekdayDe, dayStr, monthDe, yearStr] = match;
  const day = parseInt(dayStr, 10);
  const month = MONTHS_DE[monthDe.toLowerCase()];
  const year = parseInt(yearStr, 10);
  if (!month) return null;
  let hour = 20, minute = 0, timeLabel = '';
  if (timeText) {
    const tm = timeText.match(TIME_RE);
    if (tm) {
      hour = parseInt(tm[1], 10);
      minute = parseInt(tm[2], 10);
      timeLabel = `${tm[1]}:${tm[2]} Uhr`;
    }
  }
  const isSummerTime = month > 3 && month < 11;
  const offset = isSummerTime ? '+02:00' : '+01:00';
  const startsAt =
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
  return {
    startsAt,
    weekday: WEEKDAYS_DE[weekdayDe.toLowerCase()] ?? '',
    dateLabel: `${day}. ${monthDe.charAt(0).toUpperCase() + monthDe.slice(1).toLowerCase()} ${year}`,
    timeLabel,
  };
}

function parsePrice(text) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (/eintritt frei|kostenlos|gratis/i.test(trimmed)) {
    return { priceText: 'Eintritt frei', priceAmount: 0 };
  }
  if (/spende/i.test(trimmed)) {
    return { priceText: 'Spende', priceAmount: null };
  }
  const m = trimmed.match(PRICE_RE);
  if (m) {
    const amount = parseFloat(m[1].replace(',', '.'));
    return { priceText: trimmed, priceAmount: Number.isFinite(amount) ? amount : null };
  }
  return { priceText: trimmed, priceAmount: null };
}

function extractIdFromUrl(url) {
  const m = url.match(/\/(\d+-\d+)\/?$/);
  if (m) return m[1];
  const parts = url.split('/').filter(Boolean);
  return parts[parts.length - 1] || url;
}

// ====================== TESTS ======================
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.error(`  ✗ ${name}\n     ${e.message}`); fail++; }
}

console.log('\n▶ parseGermanDateTime');
test('Freitag, 29. Mai 2026 / 19:30 Uhr → ISO Sommerzeit', () => {
  const r = parseGermanDateTime('Freitag, 29. Mai 2026', '19:30 Uhr');
  assert.equal(r.startsAt, '2026-05-29T19:30:00+02:00');
  assert.equal(r.weekday, 'Fr');
  assert.equal(r.dateLabel, '29. Mai 2026');
  assert.equal(r.timeLabel, '19:30 Uhr');
});
test('Samstag, 14. November 2026 / 18:45 Uhr → Winterzeit', () => {
  const r = parseGermanDateTime('Samstag, 14. November 2026', '18:45 Uhr');
  assert.equal(r.startsAt, '2026-11-14T18:45:00+01:00');
  assert.equal(r.weekday, 'Sa');
});
test('Samstag, 12. September 2026 / 20:00 Uhr', () => {
  const r = parseGermanDateTime('Samstag, 12. September 2026', '20:00 Uhr');
  assert.equal(r.startsAt, '2026-09-12T20:00:00+02:00');
  assert.equal(r.weekday, 'Sa');
});
test('Freitag, 12. Juni 2026 / 19:00 Uhr', () => {
  const r = parseGermanDateTime('Freitag, 12. Juni 2026', '19:00 Uhr');
  assert.equal(r.startsAt, '2026-06-12T19:00:00+02:00');
});
test('ohne Zeit → 20:00 Default', () => {
  const r = parseGermanDateTime('Freitag, 29. Mai 2026', null);
  assert.equal(r.startsAt, '2026-05-29T20:00:00+02:00');
  assert.equal(r.timeLabel, '');
});
test('Mittwoch, 1. Januar 2027 → Winterzeit', () => {
  const r = parseGermanDateTime('Freitag, 1. Januar 2027', '12:00 Uhr');
  assert.equal(r.startsAt, '2027-01-01T12:00:00+01:00');
});
test('Unbekanntes Datum → null', () => {
  assert.equal(parseGermanDateTime('Niemals, 99. Foo 1234', null), null);
});

console.log('\n▶ parsePrice');
test('"3€ Eintritt frei" → Eintritt frei (Eintritt-frei gewinnt)', () => {
  const r = parsePrice('3€ Eintritt frei');
  assert.equal(r.priceText, 'Eintritt frei');
  assert.equal(r.priceAmount, 0);
});
test('"15€ zzgl. VVK Gebühr" → 15', () => {
  const r = parsePrice('15€ zzgl. VVK Gebühr');
  assert.equal(r.priceAmount, 15);
  assert.match(r.priceText, /15€/);
});
test('"5€" → 5', () => {
  assert.equal(parsePrice('5€').priceAmount, 5);
});
test('"Spende Eintritt frei" → Eintritt frei', () => {
  // "Eintritt frei" matched zuerst, also wird das genommen.
  const r = parsePrice('Spende Eintritt frei');
  assert.equal(r.priceText, 'Eintritt frei');
});
test('"Spende" → priceAmount null', () => {
  const r = parsePrice('Spende');
  assert.equal(r.priceText, 'Spende');
  assert.equal(r.priceAmount, null);
});
test('"10,50€" → 10.5', () => {
  assert.equal(parsePrice('10,50€').priceAmount, 10.5);
});
test('"25€" → 25', () => {
  assert.equal(parsePrice('25€').priceAmount, 25);
});

// Venue-Normalisierung (Mini-Version der Parser-Logik)
function extractVenue(text) {
  const venueMatch = text.match(/Kulturwerkstatt\s+Forum(?:\s+e\.?\s*V\.?)?/i);
  if (!venueMatch) return 'Kulturwerkstatt Forum e.V.';
  const raw = venueMatch[0].trim().replace(/\s+/g, ' ');
  return /e\.?\s*V\.?$/i.test(raw)
    ? raw.replace(/\s+e\.?\s*V\.?$/i, ' e.V.')
    : `${raw} e.V.`;
}

console.log('\n▶ extractVenue (Regression: kein Greedy-Match)');
test('"Kulturwerkstatt Forum e.V. 3€ Eintritt frei" → nur Vereinsname', () => {
  assert.equal(extractVenue('Kulturwerkstatt Forum e.V. 3€ Eintritt frei'), 'Kulturwerkstatt Forum e.V.');
});
test('"Kulturwerkstatt Forum e.V. 15€ zzgl. VVK Gebühr Tickets"', () => {
  assert.equal(extractVenue('Kulturwerkstatt Forum e.V. 15€ zzgl. VVK Gebühr Tickets'), 'Kulturwerkstatt Forum e.V.');
});
test('"Kulturwerkstatt Forum eV ..." → e.V. normalisiert', () => {
  assert.equal(extractVenue('Kulturwerkstatt Forum eV 5€ Tickets'), 'Kulturwerkstatt Forum e.V.');
});
test('"Kulturwerkstatt Forum" ohne e.V. → wird ergänzt', () => {
  assert.equal(extractVenue('Kulturwerkstatt Forum, Wieksbergstr 2'), 'Kulturwerkstatt Forum e.V.');
});

console.log('\n▶ extractIdFromUrl');
test('Standard-Lübeck-Ticket-URL', () => {
  assert.equal(
    extractIdFromUrl('https://www.luebeck-ticket.de/lue/events/1/list/abc/334824-1355115/'),
    '334824-1355115',
  );
});
test('Ohne trailing slash', () => {
  assert.equal(
    extractIdFromUrl('https://www.luebeck-ticket.de/lue/events/1/list/abc/336271-1362330'),
    '336271-1362330',
  );
});
test('Fallback: keine numerische ID', () => {
  assert.equal(extractIdFromUrl('https://example.com/foo/bar/'), 'bar');
});

console.log(`\n${fail === 0 ? '✓ Alle' : '✗ ' + fail + ' von'} ${pass + fail} Tests bestanden.`);
process.exit(fail === 0 ? 0 : 1);
