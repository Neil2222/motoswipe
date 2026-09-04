# MotoSwipe — working rules for Claude Code

Self-hosted "Tinder for motorcycles": SvelteKit 2 / Svelte 5, TypeScript strict,
PostgreSQL, Prisma 7, Tailwind v4, Zod 4. Read `README.md`, `docs/` and
`src/lib/server/catalog/README.md` before touching the catalogue.

## Product requirements (not suggestions)

- Self-hosted only: no Firebase/Supabase/Clerk/Auth0, no external hosted auth or
  databases. Never hardcode secrets. Never invent data. Don't claim something
  works unless you verified it. Dark industrial design; rider fit hedged;
  passenger information factual only; private rounds answer 404, not 403; no
  social features. Don't redesign UI, social or recommendation.
- **Maximum trust per card, not maximum database size.** False data is worse
  than missing data. Bikes from 2020 onward first. Unknown never satisfies a
  positive filter. Never convert UNKNOWN to a value, never infer seat height or
  torque, never merge generations to fit an image, never promote a family-level
  image to generation scope without evidence, never hide conflicts.
  Garage/browse may be permissive with warnings; discovery is strict.
- Evidence rules are product requirements. Don't loosen baseline discovery
  eligibility (`no-image`, `family-image-on-divided-family`, `identity-thin`,
  `not-on-dutch-market`) to improve a number.

## Catalogue architecture

- Layers: `SourceRecord` → `ModelFamily` → `Motorcycle` (= one generation) →
  `ModelYear`. Identity, aliases and categories are curated in
  `src/lib/server/catalog/curated.ts`; generation boundaries in
  `catalog/generations.ts`; the merge in `merge.ts`; evidence statuses in
  `evidence.ts`; image judgement in `assess.ts`; the rebuild in `rebuild.ts`.
- Each generation is merged only from the source records whose era touches it
  (`contributionsForSpan`): a maker's page describes the model year it names,
  an encyclopedia article still in production is open-ended.
- Images carry `scope` (MODEL_YEAR / GENERATION / FAMILY), `modelYear`,
  `evidence` and `license`. Manufacturer images are hotlinked only
  (`license: 'manufacturer'`; `MANUFACTURER_IMAGES=off` disables them). Never
  copy or redistribute manufacturer photography. Commons/Wikipedia images are CC.
- Photographs are pooled by picture, not URL (`images/identity.ts`): the same
  Commons file via en- and de-Wikipedia is one image. Photographs that show a
  different machine despite a correct file name go in `REJECTED_IMAGES` in
  `curated.ts` with a reason. Photo-job images (commons-search/-category) live
  only in `motorcycle_images`; the rebuild keeps their dated evidence over an
  article's undated copy of the same file.
- A Commons file name that states a model year is evidence
  (`yearInTitle` in `importers/photos/commons-match.ts`, applied to every
  pooled photograph by the rebuild with `brandImplied`). Accepted: "MY2018",
  "Modelljahr 2024", a year directly after the name or after a code in
  capitals or with a digit ("XT", "RN43", "750"), a year between brand and
  model, or leading the title after at most a colour. Refused: dates, a year
  after a word or preposition ("Moto Cage 2015", "at the 2009 Show"), an
  event or museum name, a year after a comma, another comma segment. The
  rebuild recomputes this every run and strips stale "file name states model
  year" evidence, so a rule change takes effect with a rebuild only.
- A dated photograph the family's generations do not cover becomes a
  FAMILY image; if a curated boundary at that edge says the family starts
  later or ended earlier, the photograph is dropped (a 2003 GasGas EC 250
  is not the 2021 KTM-based one). One model year past the last generation is
  still that generation; more is not.
- The rebuild is deterministic: records are ordered by source rank
  (wikipedia, manufacturer, wikipedia-de, then the rest) and a family is
  named by the spelling most records use, then the longest-filed one. After
  a rebuild, `npm run db:audit -- --since 2020 --top 100` must still give
  990 / 357 / Top 100 = 76 (`docs/audits/audit-final5.txt`, 2026-09-04;
  the restored dump gave 990 / 338 / 69); compare before touching anything
  else.
- Audits: `npm run db:audit -- --since 2020 --top 100 --json <file>` and
  `npm run db:audit:focus -- --json <file>`. Earlier outputs live in
  `docs/audits/`; a new audit must rerun the exact same metrics so a
  before/after table is possible.

## Accounts, demo, email, PWA

- The sign-up-free demo is a **guest account** (`User.isGuest`) with one
  hand-picked round (`filters.motorcycleIds`) chosen by
  `services/demo.service.ts` from eligible modern generations only. Claim,
  adopt-on-login and discard live there too; never loosen the deck to
  ineligible cards.
- Email is Resend over plain `fetch` (`server/mail/`). Password reset and
  address verification hide themselves without `RESEND_API_KEY`. Tests never
  pick a real provider; on the host use `MAIL_PROVIDER=console npm run dev`.
- PWA icons are rendered from `static/favicon.svg` with
  `npx tsx scripts/render-icons.ts` (Playwright Chromium). Edit the SVG, not
  the PNGs.

## Deployment on this PC

- Production runs as the Portainer stack `motoswipe` (Portainer on
  localhost:9000) from `docker-compose.portainer.yml` with the pre-built
  `motoswipe:local` image, published on 192.168.178.39:3100 for the NAS
  reverse proxy. After a code change: `docker compose build`, then
  `PORTAINER_API_KEY=... npx tsx scripts/portainer-deploy.ts`. Never run
  `docker compose up` next to the stack; they share the database volume.

## Operational facts learned the hard way

- Wikimedia rate-limits one IP across Commons and every Wikipedia (429,
  Retry-After 45–60 s). Run only ONE Wikimedia-hitting job at a time
  (`scripts/fetch-photos.ts`, `scripts/fetch-photos-categories.ts`, the
  `wikipedia` and `wikipedia-de` imports). Manufacturer imports are independent.
- A full rebuild (`npm run db:rebuild`) takes about an hour with default
  settings and about four minutes with
  `DATABASE_URL="<url>&options=-c%20synchronous_commit%3Doff"` for that command.
- The manufacturer provider (curated URL table in
  `src/lib/server/importers/providers/manufacturer/official-pages.ts`) reads
  Honda, Suzuki, Yamaha, Triumph, KTM and Kawasaki NL pages. Kawasaki's
  `/nl_nl/Motorcycles/<Category>/<Model>_<Year>.html` pages are plain HTML
  with the model year in the title and in every asset code ("26KLE650H");
  the rows must be moved to the next model year's URL once a year. BMW
  (photos as blob: URLs), CFMOTO (no model images) and Piaggio/Vespa
  (bot-blocked) still could not be read. Re-import one maker with
  `npx tsx scripts/import.ts --source manufacturer --allow-network --skip-rebuild --only kawasaki`.
- German Wikipedia refresh:
  `WIKIPEDIA_DE_REFRESH=1 npx tsx scripts/import.ts --source wikipedia-de --allow-network --skip-rebuild`,
  optionally with `WIKIPEDIA_DE_TITLES="Kawasaki Z 400"` for named articles only.
- Verify before reporting: `npx tsc --noEmit`, `npm run lint`, `npm run check`,
  `npm run test`, `npm run build`.
