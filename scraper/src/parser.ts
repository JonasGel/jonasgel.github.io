/**
 * HTML-Parser für die Lübeck-Ticket Veranstaltungsliste.
 *
 * Strategie: Wir verlassen uns NICHT auf konkrete CSS-Klassen
 * (die könnten sich ändern). Stattdessen suchen wir nach robusten
 * Mustern:
 *   1. Datums-Strings im Format "Wochentag, DD. Monat YYYY"
 *   2. Von dort aus walken wir den DOM nach oben, um den "Event-Container"
 *      zu finden, und extrahieren die anderen Felder.
 */

import * as cheerio from 'cheerio';
import type { ScrapedEvent } from './types.js';

const MONTHS_DE: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

const WEEKDAYS_DE: Record<string, string> = {
  montag: 'Mo', dienstag: 'Di', mittwoch: 'Mi', donnerstag: 'Do',
  freitag: 'Fr', samstag: 'Sa', sonntag: 'So',
};

/** Matched z.B. "Freitag, 29. Mai 2026" */
const DATE_RE = /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/i;

/** Matched z.B. "19:30 Uhr" oder "20:00" */
const TIME_RE = /\b(\d{1,2}):(\d{2})(?:\s*Uhr)?\b/;

/** Matched z.B. "3€", "15€", "10,50€", "10.50 €" */
const PRICE_RE = /(\d+(?:[.,]\d{1,2})?)\s*€/;

const FREE_KEYWORDS = ['Eintritt frei', 'kostenlos', 'gratis'];
const DONATION_KEYWORDS = ['Spende', 'auf Spendenbasis'];

interface ParsedDate {
  startsAt: string;
  weekday: string;
  dateLabel: string;
  timeLabel: string;
}

function parseGermanDateTime(dateText: string, timeText: string | null): ParsedDate | null {
  const match = dateText.match(DATE_RE);
  if (!match) return null;

  const [, weekdayDe, dayStr, monthDe, yearStr] = match;
  const day = parseInt(dayStr, 10);
  const month = MONTHS_DE[monthDe.toLowerCase()];
  const year = parseInt(yearStr, 10);
  if (!month) return null;

  let hour = 20;
  let minute = 0;
  let timeLabel = '';
  if (timeText) {
    const tm = timeText.match(TIME_RE);
    if (tm) {
      hour = parseInt(tm[1], 10);
      minute = parseInt(tm[2], 10);
      timeLabel = `${tm[1]}:${tm[2]} Uhr`;
    }
  }

  // Wir nehmen Europe/Berlin an. Sommer- vs. Winterzeit grob unterschieden:
  // CEST (UTC+2) zwischen Ende März und Ende Oktober, sonst CET (UTC+1).
  // Für Anzeigezwecke ist das ausreichend; die Astro-Seite formatiert sowieso lokal.
  const isSummerTime = month > 3 && month < 11;
  const offset = isSummerTime ? '+02:00' : '+01:00';
  const startsAt =
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;

  const weekday = WEEKDAYS_DE[weekdayDe.toLowerCase()] ?? '';
  const dateLabel = `${day}. ${monthDe.charAt(0).toUpperCase() + monthDe.slice(1).toLowerCase()} ${year}`;

  return { startsAt, weekday, dateLabel, timeLabel };
}

function parsePrice(text: string): { priceText: string; priceAmount: number | null } {
  const trimmed = text.trim().replace(/\s+/g, ' ');

  for (const kw of FREE_KEYWORDS) {
    if (trimmed.toLowerCase().includes(kw.toLowerCase())) {
      return { priceText: 'Eintritt frei', priceAmount: 0 };
    }
  }
  for (const kw of DONATION_KEYWORDS) {
    if (trimmed.toLowerCase().includes(kw.toLowerCase())) {
      return { priceText: 'Spende', priceAmount: null };
    }
  }

  const m = trimmed.match(PRICE_RE);
  if (m) {
    const amount = parseFloat(m[1].replace(',', '.'));
    return { priceText: trimmed, priceAmount: Number.isFinite(amount) ? amount : null };
  }

  return { priceText: trimmed, priceAmount: null };
}

function extractIdFromUrl(url: string): string {
  // Lübeck-Ticket Detail-URLs sehen so aus:
  //   /lue/events/1/list/<hash>/<numericId>-<numericId2>/
  // Wir nehmen die letzten beiden Zahlen-IDs als stabile ID.
  const m = url.match(/\/(\d+-\d+)\/?$/);
  if (m) return m[1];
  // Fallback: letzter nicht-leerer Pfad-Bestandteil.
  const parts = url.split('/').filter(Boolean);
  return parts[parts.length - 1] || url;
}

function absoluteUrl(url: string, base: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

/**
 * Parst die Veranstaltungsliste aus dem HTML.
 *
 * @param html  Roher HTML-Inhalt der Listenseite.
 * @param baseUrl  Basis-URL für relative Links.
 */
export function parseEvents(html: string, baseUrl: string): ScrapedEvent[] {
  const $ = cheerio.load(html);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  // Heuristik: alle Elemente finden, deren *eigener* Text einen Datums-String enthält.
  // Wir steigen dann nach oben, bis wir einen Container haben, der auch einen <h2>/<h3>/<h4>
  // mit einem Link enthält — das ist sehr wahrscheinlich die "Event-Karte".
  $('*').each((_, el) => {
    const $el = $(el);
    // Nur das direkte Textinhalt-Element (ohne Kindelement-Text) untersuchen,
    // um zu vermeiden, dass <body> matched.
    const ownText = $el.clone().children().remove().end().text();
    if (!DATE_RE.test(ownText)) return;

    // Container suchen: nach oben gehen, bis wir ein Element finden, das
    // mindestens eine Überschrift mit Link enthält UND nicht zu groß ist (max 4 Eltern).
    let $container: cheerio.Cheerio<any> = $el;
    for (let i = 0; i < 5; i++) {
      const parent = $container.parent();
      if (!parent.length) break;
      $container = parent;
      const hasHeadingLink = $container.find('h1, h2, h3, h4').filter((_, h) => $(h).find('a[href]').length > 0).length > 0;
      if (hasHeadingLink) break;
    }

    const $heading = $container.find('h1, h2, h3, h4').filter((_, h) => $(h).find('a[href]').length > 0).first();
    if (!$heading.length) return;
    const $titleLink = $heading.find('a[href]').first();
    const title = $titleLink.text().trim().replace(/\s+/g, ' ');
    const detailUrl = absoluteUrl($titleLink.attr('href') || '', baseUrl);
    if (!title || !detailUrl) return;

    const id = extractIdFromUrl(detailUrl);
    if (seen.has(id)) return;

    // Kategorie: nächste <a>-Verlinkung VOR der Überschrift, die nicht der Titel-Link ist.
    let category = '';
    const $catLinks = $container.find('a[href]').filter((_, a) => {
      const href = $(a).attr('href') || '';
      // Kategorien verlinken auf /events/... ohne numerische End-ID wie Tickets
      return /\/events\//.test(href) && $(a).text().trim().length > 0 && $(a).text().trim() !== title;
    });
    if ($catLinks.length) {
      category = $catLinks.first().text().trim();
    }

    // Datum + Zeit aus dem Container-Text rekonstruieren
    const containerText = $container.text().replace(/\s+/g, ' ').trim();
    const dateMatch = containerText.match(DATE_RE);
    if (!dateMatch) return;
    const dateStr = dateMatch[0];
    // Suche Zeit *nach* dem Datum
    const afterDate = containerText.slice(containerText.indexOf(dateStr) + dateStr.length);
    const timeMatch = afterDate.match(TIME_RE);
    const parsed = parseGermanDateTime(dateStr, timeMatch ? timeMatch[0] : null);
    if (!parsed) return;

    // Venue: Match nur den Vereinsnamen selbst, nicht die nachfolgenden Felder
    // (Preis, Tickets-Link). Wir akzeptieren "e.V.", "eV", "e. V." etc.
    let venue = 'Kulturwerkstatt Forum e.V.';
    const venueMatch = containerText.match(/Kulturwerkstatt\s+Forum(?:\s+e\.?\s*V\.?)?/i);
    if (venueMatch) {
      const raw = venueMatch[0].trim().replace(/\s+/g, ' ');
      // Normalisiere auf kanonische Schreibweise "Kulturwerkstatt Forum e.V."
      venue = /e\.?\s*V\.?$/i.test(raw)
        ? raw.replace(/\s+e\.?\s*V\.?$/i, ' e.V.')
        : `${raw} e.V.`;
    }

    // Preis + Tickets-Link
    let ticketUrl: string | null = null;
    const $ticketLinks = $container.find('a[href]').filter((_, a) => /tickets?/i.test($(a).text()) || /\/tickets?\//i.test($(a).attr('href') || ''));
    if ($ticketLinks.length) {
      ticketUrl = absoluteUrl($ticketLinks.first().attr('href') || '', baseUrl);
    }

    // Preistext: Letzte Zeile mit € oder mit FREE/DONATION keywords
    let priceText = '';
    const priceLineMatch = containerText.match(/(\d+(?:[.,]\d{1,2})?\s*€[^•]*?)(?=\s*(?:Tickets|$))/i);
    if (priceLineMatch) {
      priceText = priceLineMatch[1].trim();
    } else if (/Eintritt frei/i.test(containerText)) {
      priceText = 'Eintritt frei';
    } else if (/Spende/i.test(containerText)) {
      priceText = 'Spende';
    }
    const priceInfo = parsePrice(priceText);

    // Bild: Erstes <img> innerhalb des Containers
    let imageUrl: string | null = null;
    const $img = $container.find('img').first();
    if ($img.length) {
      const src = $img.attr('src') || $img.attr('data-src') || '';
      if (src) imageUrl = absoluteUrl(src, baseUrl);
    }

    events.push({
      id,
      title,
      category: category || 'Veranstaltung',
      startsAt: parsed.startsAt,
      weekday: parsed.weekday,
      dateLabel: parsed.dateLabel,
      timeLabel: parsed.timeLabel,
      venue,
      priceText: priceInfo.priceText,
      priceAmount: priceInfo.priceAmount,
      ticketUrl,
      detailUrl,
      imageUrl,
    });
    seen.add(id);
  });

  // Sortieren nach Startzeit (frühestes zuerst)
  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return events;
}
