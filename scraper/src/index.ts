/**
 * Lübeck-Ticket Scraper — CLI
 *
 * Lädt die Veranstaltungsliste der Kulturwerkstatt Forum e.V. von Lübeck-Ticket,
 * parst die einzelnen Events und schreibt das Ergebnis als JSON heraus.
 *
 * Aufrufe:
 *   pnpm tsx src/index.ts                      → live von luebeck-ticket.de
 *   pnpm tsx src/index.ts --fixture fixtures/sample.html  → aus lokaler Datei
 *   pnpm tsx src/index.ts --out events.json    → Pfad für Ausgabe
 *   pnpm tsx src/index.ts --pretty             → JSON eingerückt schreiben
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEvents } from './parser.js';
import type { ScrapeResult } from './types.js';

const DEFAULT_URL = 'https://www.luebeck-ticket.de/kulturwerkstatt/';
const DEFAULT_USER_AGENT =
  'KulturwerkstattForumBot/1.0 (+https://www.kulturwerkstatt-forum.de; Veranstaltungs-Sync)';

interface CliOptions {
  url: string;
  fixture: string | null;
  out: string;
  pretty: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    url: DEFAULT_URL,
    fixture: null,
    out: 'events.json',
    pretty: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--url':
        opts.url = argv[++i] ?? opts.url;
        break;
      case '--fixture':
        opts.fixture = argv[++i] ?? null;
        break;
      case '--out':
        opts.out = argv[++i] ?? opts.out;
        break;
      case '--pretty':
        opts.pretty = true;
        break;
      case '--compact':
        opts.pretty = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
Lübeck-Ticket Scraper

Optionen:
  --url <URL>          Quell-URL (Default: ${DEFAULT_URL})
  --fixture <PATH>     Statt fetch eine lokale HTML-Datei nutzen
  --out <PATH>         Output-Pfad (Default: events.json)
  --pretty             JSON eingerückt (Default)
  --compact            JSON einzeilig
  -h, --help           Diese Hilfe anzeigen
`);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'de-DE,de;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} beim Laden von ${url}`);
  }
  return await res.text();
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  let html: string;
  let source: string;
  if (opts.fixture) {
    const fixturePath = resolve(opts.fixture);
    console.error(`▶ Lade Fixture aus: ${fixturePath}`);
    html = await readFile(fixturePath, 'utf8');
    source = `file://${fixturePath}`;
  } else {
    console.error(`▶ Lade Seite: ${opts.url}`);
    html = await fetchHtml(opts.url);
    source = opts.url;
  }

  console.error(`▶ HTML geladen (${html.length} Zeichen). Parse Events…`);
  const events = parseEvents(html, source);
  console.error(`▶ ${events.length} Veranstaltung(en) gefunden.`);

  const result: ScrapeResult = {
    scrapedAt: new Date().toISOString(),
    source,
    count: events.length,
    events,
  };

  const outPath = resolve(opts.out);
  const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
  await writeFile(outPath, json + '\n', 'utf8');
  console.error(`▶ Geschrieben nach: ${outPath}`);

  // Kurz-Zusammenfassung auf stdout (für CI/Cron)
  for (const ev of events) {
    console.log(
      `  ${ev.weekday} ${ev.dateLabel.padEnd(20)} ${ev.timeLabel.padEnd(10)} ${ev.category.padEnd(14)} ${ev.title}`,
    );
  }
}

main().catch((err) => {
  console.error('✗ Fehler:', err);
  process.exit(1);
});
