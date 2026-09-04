# Importers

Everything that brings motorcycle data into MotoSwipe lives here, and nothing
else in the application knows where that data came from.

```
importers/
├── types.ts              The MotorcycleProvider contract
├── import.service.ts     Turns normalized records into database rows
├── registry.ts           Which providers exist
└── providers/
    ├── sample.provider.ts   Reference implementation (local, no network)
    ├── sample-data.ts       The demo catalogue it reads from
    └── wikipedia/           Real data: ~1,100 motorcycles with photographs
        ├── wikipedia.provider.ts  Fetching, batching, retry, image licensing
        ├── infobox.ts             Wikitext parsing (pure, heavily tested)
        └── categories.ts          Classification (pure, heavily tested)
```

## Why the boundary exists

Scraping is fragile, legally awkward and slow. The application is none of those
things. Keeping fetch logic behind a single interface means a provider can be
rate-limited, rewritten or deleted without touching a route, a service or a
component — and it means the app never depends on a third party being up.

Imports are **command-line only**. There is deliberately no "import now" button
in `/admin`: a scraper you can trigger with an HTTP request is a
denial-of-service vector pointed at somebody else's website, and not something a
self-hosted box should ever do by accident.

## The contract

```ts
interface MotorcycleProvider {
  readonly source: string; // stored on every row it creates
  readonly displayName: string;
  readonly requiresNetwork: boolean; // gates the --allow-network flag

  listMotorcycles(options?): Promise<ProviderListing[]>;
  fetchMotorcycle(externalId: string): Promise<RawMotorcycle>;
  normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null;
}
```

`listMotorcycles` enumerates what is available without fetching each record in
full. `fetchMotorcycle` gets one record in the source's own shape.
`normalizeMotorcycle` maps it onto MotoSwipe's model — unit conversion, category
mapping, parsing `"999cc"` into a number. Return `null` to skip a record that
cannot be mapped honestly.

None of these methods touch the database. `ImportService` owns all persistence.

## Rules the import layer enforces

**A human correction beats a scraper.** A row with `manuallyEdited = true` is
never overwritten unless you pass `--overwrite-manual-edits`. Individual fields
listed in `protectedFields` survive every refresh regardless.

**Never invent data.** A field the provider did not supply (`undefined`) leaves
the column untouched. A field the provider explicitly says is unknown (`null`)
is stored as null. Those are different statements and the importer keeps them
different.

**Nothing is deleted.** When a source stops listing a model, `--retire-missing`
sets `isActive = false` and stamps `retiredAt`. The row stays, because a user's
shortlist from last year should not evaporate because a manufacturer took a page
down. Retired motorcycles never enter a new deck; they remain visible everywhere
they are already referenced. Swipe foreign keys use `onDelete: Restrict`, so the
database refuses a delete that would orphan history.

**Provenance is recorded.** Every row carries `source`, `externalId`,
`sourceUrl` and `importedAt`, and `@@unique([source, externalId])` makes
re-imports idempotent rather than duplicating.

**One motorcycle, one row.** A provider that declares `mergeByModelName` does
not create a row for a machine the catalogue already has — it fills that row's
gaps and adds its photographs. The registry and the encyclopedia both know about
the Kawasaki Z900, and two cards for one bike is the most visible way a
multi-source catalogue goes wrong. Matching is on `matchKey`, a normalised
`brand|model` built by `match.ts`; enrichment is strictly additive, so whichever
source created a row keeps ownership of its facts.

## Cross-source matching

`match.ts` is the whole of it, and it is pure — no database, no network — so the
rules that decide whether two rows are the same motorcycle are cheap to test.

- `normalizeBrand` collapses the corporate names sources disagree about:
  "KAWASAKI", "Kawasaki Motors" and "Kawasaki Heavy Industries Motorcycle &
  Engine" are one brand. The noise list is ordered longest-first so "motor
  company" is removed before "motor" could get at "Moto Guzzi".
- `normalizeModel` throws away the spacing and punctuation sources differ on:
  "Z 900" and "Z900", "R 1250 GS" and "R1250GS".
- `stripBrandPrefix` removes a make repeated inside a model name. Registries
  hold "BMW / BMW R1200GSADVENTURE" and "KTM / KTM 1290 Super Adventure S",
  which otherwise never merge with the same bike spelled properly.
- `selectEnrichment` picks only the fields the existing row has no value for.
  `category` is the one exception: an existing `OTHER` carries no information,
  so a real category replaces it.

`Manufacturer.matchKey` does the same job for brands and is **unique**, so BMW
cannot exist three times over.

### Repairing a catalogue

Matching rules change, and rows imported before a change stay as they were.
These are all idempotent and safe to re-run:

```bash
npm run db:repair-model-names     # strip a make repeated inside a model name
npm run db:backfill-match-keys    # recompute matchKey for every row
npm run db:dedupe                 # merge rows that share a matchKey
npm run db:dedupe-manufacturers   # merge BMW / BMW Motorrad / BMW Group
```

Run them in that order: repairing names changes the keys, which changes what
merges.

## Running an import

```bash
npm run import:run -- --list                        # what is registered
npm run import:run -- --source sample               # run it
npm run import:run -- --source sample --limit 5 --dry-run
npm run import:run -- --source sample --retire-missing
```

Inside a container:

```bash
docker compose exec motoswipe npx tsx scripts/import.ts --source sample
```

| Flag                       | Effect                                                 |
| -------------------------- | ------------------------------------------------------ |
| `--list`                   | Show registered providers and exit                     |
| `--source <name>`          | Which provider to run                                  |
| `--limit <n>`              | Stop after n records                                   |
| `--dry-run`                | Report what would change, write nothing                |
| `--retire-missing`         | Retire rows the source no longer lists (never deletes) |
| `--overwrite-manual-edits` | Overwrite human corrections. Think first.              |
| `--allow-network`          | Required for any provider that reaches the internet    |

## Adding a provider

1. **Write it** in `providers/`. Copy `sample.provider.ts`; it is the reference
   implementation and exists partly to be copied.

   ```ts
   export class KawasakiProvider implements MotorcycleProvider {
     readonly source = 'kawasaki';
     readonly displayName = 'Kawasaki model pages';
     readonly requiresNetwork = true;

     async listMotorcycles({ limit } = {}) {
       /* … */
     }
     async fetchMotorcycle(externalId: string) {
       /* … */
     }
     normalizeMotorcycle(raw: RawMotorcycle) {
       /* … */
     }
   }
   ```

2. **Register it** — one line in `registry.ts`:

   ```ts
   register(new KawasakiProvider());
   ```

3. **Test the normaliser.** Save a real response as a fixture and assert
   `normalizeMotorcycle` maps it correctly. That function is pure, so it is the
   easy and valuable thing to test; the fetching is not.

4. **Run it dry first:**
   ```bash
   npm run import:run -- --source kawasaki --limit 3 --dry-run --allow-network
   ```

That is the whole procedure. Nothing outside this directory changes.

### What a good normaliser does

- Converts units into MotoSwipe's (mm, kg, cc, Nm, hp **and** kW when both are
  published).
- Maps the source's taxonomy onto `MotorcycleCategory`, and keeps the original
  string in `categoryRaw` so a better mapping can be applied later without
  re-fetching.
- Leaves a field `undefined` when the source is silent. Do not default to `0`.
  A motorcycle with 0 hp is a claim; a motorcycle with unknown hp is the truth.
- Sets `passengerAllowed` only from an explicit statement. A pillion seat in a
  photograph is not a statement.
- Emits images only with an `attribution` you are entitled to redistribute.

### Before you scrape anything

Check the site's terms and its `robots.txt`, identify your client honestly, and
rate-limit yourself. `requiresNetwork` plus the `--allow-network` flag exist to
make sure fetching somebody else's data is always a deliberate act.

## The Wikipedia provider

The real one. It uses two sources because they are complementary:

| Source                | Licence    | What it provides                                  | Coverage                                      |
| --------------------- | ---------- | ------------------------------------------------- | --------------------------------------------- |
| **Wikidata**          | CC0        | Which motorcycles exist, manufacturer, photo link | 2,834 models, but only 29 with a displacement |
| **English Wikipedia** | CC BY-SA   | The `{{Infobox motorcycle}}` specifications       | ~1,220 models with articles                   |
| **Wikimedia Commons** | various CC | The photographs themselves                        | ~1,030 with usable images                     |

So: enumerate with Wikidata, specify with Wikipedia, illustrate with Commons.

```bash
npm run import:run -- --source wikipedia --allow-network
```

Takes about four minutes and is fully idempotent — a second run reports
`created 0, updated 1089`.

### What you actually get

From a real run of ~1,090 imported motorcycles:

| Field                         | Populated |
| ----------------------------- | --------- |
| Photograph (with attribution) | 1,029     |
| Model year                    | 918       |
| Displacement                  | 717       |
| Weight                        | 578       |
| Power                         | 547       |
| Seat height                   | 408       |
| Torque                        | 302       |

No prices — neither source has them. Everything unpopulated is genuinely null
rather than guessed, and the UI renders it as an em dash.

### Licensing, which is not optional

Wikidata is CC0 and needs nothing. **Wikipedia prose is CC BY-SA**, so the
provider imports _facts only_ — a displacement figure is not copyrightable, a
paragraph is. Article text is never copied into `description`; the short
Wikidata description (CC0) is used instead and `sourceUrl` links back.

**Commons photographs require attribution.** The licence and author are fetched
from `extmetadata` and stored on every image row, and the motorcycle detail page
displays them. If you add another image source, do the same or do not import the
images.

Set `WIKIMEDIA_CONTACT` in your environment so the User-Agent identifies your
instance — Wikimedia's API policy asks for it, and it is the difference between
being a good citizen and being blocked.

### Judgement calls it makes

Wikidata's "motorcycle model" class is broader than what belongs in a swipe
deck, so the provider makes two distinctions:

- **Not a motorcycle at all** → dropped. "BMW 247 engine" is filed as a
  motorcycle model; a cylinder head has no business in a deck.
- **Not a road-going proposition** → kept, tagged `non-road`. Grand Prix
  prototypes, streamliners, concept bikes, minibikes, military half-tracks.
  Rounds exclude them by default, and a dream-garage round can switch them back
  on. Nothing is thrown away.

Both are tested, including the case that made the rule necessary: the Triumph
Tiger T110 is an ordinary 1953 road bike that sits in "Category:Land speed
record motorcycles" because a streamliner used its engine. An earlier version of
the rule removed it from every deck.

## The RDW provider

The Dutch vehicle registry, published as open data: every motorcycle registered
in the Netherlands, about 898,000 of them, updated daily. **Public domain**, no
API key, no documented rate limit.

Grouping registrations by make and model turns a registry into a catalogue of
roughly five thousand machines, with figures no encyclopedia has:

- **Price.** `catalogusprijs` is the Dutch list price in euros. Nothing else
  evaluated had prices at all, and "under €20,000" is not a filter you can offer
  without them.
- **Recency.** Registration dates run to today, so the catalogue reflects what is
  actually being bought rather than what has an article written about it.
- **Seats.** `aantal_zitplaatsen` answers the passenger question factually,
  which is the only way this app is willing to answer it.
- **Popularity.** The registration count per model is a real signal, and it is
  what orders the photograph job.

What it cannot give: **no photographs, no seat height, no torque**. Those come
from Wikipedia and Commons, which is exactly why the two sources merge.

Two things about the shape of the data are worth knowing. Figures are averaged
across every registered example, so for a model sold unchanged they are exact
and across a long production run they are a blend — which is why the import
starts at 2000 by default, since there is a 1973 Z900 as well as a 2017 one.
And model names are free text typed by whoever registered the bike, so the same
machine appears as "DL650" and "DL650A"; a minimum registration count filters
out one-off spellings without discarding genuine low-volume machines.

`classify.ts` guesses a category from the model name, because RDW's `inrichting`
field reads "Niet geregistreerd" for almost every motorcycle. Manufacturers name
their ranges by type — "GS" is an adventure bike, "Ninja" is a sportbike — so
the guess is usually right, and where it is not, a matched Wikipedia row
overrides it and anything unrecognised stays `OTHER` rather than being forced
into a bucket.

Tuning, via environment variables:

| Variable                | Default | Effect                                |
| ----------------------- | ------- | ------------------------------------- |
| `RDW_FROM_YEAR`         | 2000    | Ignore registrations older than this  |
| `RDW_MIN_REGISTRATIONS` | 3       | Drop models with fewer than this many |

## Photographs for registry bikes

RDW supplies thousands of motorcycles and not one picture, and a bike with no
photograph cannot enter a deck at all — rounds exclude them unless the round
explicitly asks for them. `scripts/fetch-photos.ts` fills that gap from
Wikimedia Commons:

```bash
npm run db:fetch-photos -- --limit 50 --dry-run   # see what it would find
npm run db:fetch-photos                           # everything with no photo
npm run db:fetch-photos -- --retry                # after changing the rules
```

It works most-registered-first and records every attempt in `photosSearchedAt`,
so it is safe to interrupt and resume, and a re-run does not ask Wikimedia about
four thousand machines nobody has ever photographed.

The interesting part is `photos/commons-match.ts`, which is pure and tested.
Commons search is full text, not a lookup: ask it for a "Kawasaki Ninja 400" and
it offers a ZX-6R; ask for a "Harley-Davidson Street Glide" and it offers an
Electra Glide dashboard. So a result is only accepted when the file name names
both the brand and the model, is not a close-up of a part or a shot of a rally
field, and is not better explained by a **longer model of the same brand** —
that last rule is what stops every Z900RS photograph being filed under Z900.

Expect a hit rate around a third. Showing the wrong motorcycle is worse than
showing none, because saying yes or no to what is in the picture is the entire
product.

## The sample provider

`sample.provider.ts` reads from a local array instead of the network, which
makes it both the reference implementation and the mechanism behind
`npm run db:seed` on a fresh install. That means the import path is exercised on every fresh
install, rather than being code nobody runs until the first real provider
arrives.

Its data is **demonstration data**: approximate, hand-entered, pinned to no
particular market, with generated illustrations rather than photographs. Several
fields are deliberately left null to exercise the "unknown spec" paths in the
UI. Do not treat any of it as a source of truth about a real motorcycle.

Which is why `db:seed` **skips it entirely once anything real has been
imported**. It did not always: `db:seed:docker` runs on every container start,
and twenty-seven invented motorcycles turned up among five thousand real ones.

## The German Wikipedia provider

`wikipedia-de` is a specification source rather than a catalogue source. It
starts from the families the registry already knows (thirty registrations or
more, on sale since 2015), looks each one up on de.wikipedia by title — "Kawasaki
Z 900", spaced the German way — and accepts only an article whose title is
exactly the brand and model. `Infobox Motorrad` supplies what the English
infobox usually lacks: `Sitzhöhe` (centimetres), `Drehmoment`, `Leistung` in kW
and PS, and `Bauart`, a category written by an editor. Photographs captioned
"Baujahr 2021" become model-year evidence.

```bash
npm run import:run -- --source wikipedia-de --allow-network --skip-rebuild --limit 400
```

Wikimedia rate-limits one IP across every wiki and Commons together. Run one
Wikimedia job at a time.

## The manufacturer provider

`manufacturer` reads the makers' own Dutch model pages from a curated table
(`providers/manufacturer/official-pages.ts`). Honda NL pages are the richest:
specifications, list price per variant, and images whose asset names state the
model year. Suzuki NL has a specification table and year-coded assets; Yamaha NL
only the year-stamped image. Triumph NL keeps an accessible specification table
on a sibling page and names the model year in its image files ("my26"); KTM NL
names the model year in the page title and URL and keeps the figures on a
technical-specifications page. Kawasaki (client-rendered), BMW (connection
refused from here), CFMOTO (no model images on the page) and Piaggio/Vespa
(bot-blocked) could not be read, which is why their current generations still
depend on Commons and German Wikipedia.

Their photographs are copyrighted. The provider stores the URL and marks the
row `license: manufacturer`; nothing is downloaded or self-hosted, and
`MANUFACTURER_IMAGES=off` keeps the specifications while dropping the images.
