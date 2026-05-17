/**
 * Datentypen für den Lübeck-Ticket Scraper
 */

export interface ScrapedEvent {
  /** Stabile ID, abgeleitet aus der Detail-URL */
  id: string;
  /** Titel der Veranstaltung */
  title: string;
  /** Kategorie ("Konzert", "Party", "Poetry Slam", "Sonstige", ...) */
  category: string;
  /** ISO 8601 Datum+Zeit, z.B. "2026-05-29T19:30:00+02:00" */
  startsAt: string;
  /** Wochentag (kurz, deutsch), z.B. "Fr" */
  weekday: string;
  /** Anzeigedatum, z.B. "29. Mai 2026" */
  dateLabel: string;
  /** Anzeigezeit, z.B. "19:30 Uhr" */
  timeLabel: string;
  /** Ort, idR. "Kulturwerkstatt Forum e.V." */
  venue: string;
  /** Roher Preistext, z.B. "15€ zzgl. VVK Gebühr", "Spende", "Eintritt frei" */
  priceText: string;
  /** Numerischer Preis in Euro (oder null bei Spende/frei) */
  priceAmount: number | null;
  /** Direkter Link zu Tickets (oder null wenn frei/Spende) */
  ticketUrl: string | null;
  /** Link zur Detailseite auf Lübeck-Ticket */
  detailUrl: string;
  /** URL eines Vorschaubildes (oder null wenn keines gefunden) */
  imageUrl: string | null;
}

export interface ScrapeResult {
  /** Zeitstempel des Scrape-Vorgangs (ISO 8601) */
  scrapedAt: string;
  /** Quelle (URL der gescrapten Seite) */
  source: string;
  /** Anzahl gefundener Events */
  count: number;
  /** Die gefundenen Events, sortiert nach Datum (frühestes zuerst) */
  events: ScrapedEvent[];
}
