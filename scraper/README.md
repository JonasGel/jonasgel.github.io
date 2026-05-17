# Lübeck-Ticket Scraper

Holt die aktuellen Veranstaltungen der **Kulturwerkstatt Forum e.V.** von
[luebeck-ticket.de/kulturwerkstatt](https://www.luebeck-ticket.de/kulturwerkstatt/)
und schreibt sie als sauber strukturiertes JSON heraus.

## Installation

```bash
cd scraper
npm install
```

## Verwendung

### Live von Lübeck-Ticket scrapen

```bash
npm run scrape
# Schreibt nach events.json
```

### Gegen die mitgelieferte Test-Fixture parsen (kein Internet nötig)

```bash
npm run scrape:fixture
```

### Optionen

```bash
npx tsx src/index.ts --help
```

| Flag                 | Bedeutung                                                |
| -------------------- | -------------------------------------------------------- |
| `--url <URL>`        | Quell-URL überschreiben                                  |
| `--fixture <PATH>`   | Lokale HTML-Datei statt fetch nutzen (für Tests)         |
| `--out <PATH>`       | Output-Pfad (Default `events.json`)                      |
| `--pretty`           | JSON eingerückt (Default)                                |
| `--compact`          | JSON einzeilig (kleinere Datei)                          |

## Ausgabeformat

```jsonc
{
  "scrapedAt": "2026-05-17T12:34:56.000Z",
  "source": "https://www.luebeck-ticket.de/kulturwerkstatt/",
  "count": 7,
  "events": [
    {
      "id": "334824-1355115",
      "title": "Kneipenquiz im Forum",
      "category": "Sonstige",
      "startsAt": "2026-05-29T19:30:00+02:00",
      "weekday": "Fr",
      "dateLabel": "29. Mai 2026",
      "timeLabel": "19:30 Uhr",
      "venue": "Kulturwerkstatt Forum e.V.",
      "priceText": "3€ Eintritt frei",
      "priceAmount": 3,
      "ticketUrl": null,
      "detailUrl": "https://www.luebeck-ticket.de/lue/events/...",
      "imageUrl": null
    }
  ]
}
```

## Wie der Parser funktioniert

Der Parser verlässt sich **nicht** auf konkrete CSS-Klassen von Lübeck-Ticket
(die könnten sich jederzeit ändern). Stattdessen sucht er nach robusten
inhaltlichen Mustern:

1. **Datums-Muster** wie „Freitag, 29. Mai 2026" → daraus ergibt sich der
   Anker für jede Event-Karte.
2. Von dort wird der DOM hochgewandert, bis ein **Container** gefunden ist,
   der eine Überschrift mit Link enthält.
3. Aus diesem Container werden dann Titel, Kategorie, Zeit, Preis,
   Ticket-Link und Bild extrahiert.

So bleibt der Scraper auch dann stabil, wenn Lübeck-Ticket sein HTML-Markup
umbaut — solange die Inhalte erkennbar bleiben.

## Integration in die Astro-Website

Vorgesehene Anbindung an die Hauptseite (folgt im nächsten Schritt):

- **Vercel Cron Job** ruft alle 6 Stunden den Scraper auf.
- Ergebnis wird in **Vercel KV** oder als statische `events.json` im Repo
  abgelegt.
- Astro liest beim Build oder per ISR aus dieser Datei und rendert die
  Events-Sektion.

## Tests

### Schnell: Logik-Tests (keine Dependencies nötig)

```bash
npm test
```

Prüft die reinen Hilfsfunktionen (Datumsparsing, Preisparsing, ID-Extraktion)
ohne externe Pakete. Läuft direkt mit Node.

### Vollständig: Parser gegen Fixture

```bash
npm install
npm run scrape:fixture
cat events.json
```

Erwartete Ausgabe: **7 Events**, sortiert nach Datum, mit korrekten Preisen,
Tickets-Links und Detail-URLs.

### Live gegen Lübeck-Ticket

```bash
npm run scrape
cat events.json
```
