# The catalogue

Two layers, and the distinction between them is the whole design.

**`SourceRecord`** is what one provider said about one machine, kept exactly as
it said it. Never merged away, never edited. There is one row per
`(source, externalId)`.

**`Motorcycle`** is the canonical machine — one row per real motorcycle,
assembled from every source record that describes it. It is the only thing a
round, a swipe, a comparison or a garage ever points at.

The deck operates on canonical motorcycles. That is the point.

## Why

The catalogue used to write provider output straight into `Motorcycle`, and a
second source could only fill the blanks the first one left. Three things went
wrong, all of them visible to the user:

- **The same bike appeared twice.** `Z900` and `Z900 ABS` are one motorcycle;
  `MT-07` and `MTN690` are one motorcycle. Nothing about the strings says so.
- **Import order decided the data.** Run the registry first and every seat
  height was missing; run the encyclopedia first and every price was.
- **Different bikes merged.** A 1976 Kawasaki Z650 and a 2017 one share every
  character of their name.

## Identity — `identity.ts`

An identity key is `brand | model | generation`, built from three things in
increasing order of how much they need to know:

1. **Normalisation.** Spacing, punctuation, corporate suffixes, and trim
   markers that never name a motorcycle — `ABS`, `DCT`, `E5`, `A2`. Pure string
   work, always safe. Note what is _not_ on that list: `R`, `S`, `GT` and `RS`
   are all real motorcycles, and stripping them would fold the Honda CB1000R
   into the CB1000.

2. **Curated aliases — `curated.ts`.** A registry files the Yamaha MT-07 as
   `MTN690` and the Suzuki GSX-8S as `GSX800`. No string operation connects
   those; it is a fact about motorcycles. Same for single-letter type codes:
   `NC750XA` is an NC750X, but a general rule for trailing letters would ruin
   the CB1000R. So these are curated, as data rather than as code.

3. **Era.** Production years where a source knows them, otherwise the span over
   which examples were registered. Records only merge when their eras can belong
   to one machine, with a tolerance wide enough to absorb the lag between a bike
   being built and being registered — and narrow enough that 1976 and 2017 stay
   apart.

`sameMotorcycle(a, b)` answers the question directly and is the thing worth
reading first.

## Merging — `merge.ts`

Each field picks a winner, on two things in this order:

1. **Confidence**, which the provider attaches per field. RDW's engine power is
   sampled from whichever examples happen to be registered, so it says so; a
   published specification always beats it.
2. **Source priority per field**, consulted when confidence ties. This encodes
   authority, not quality — who is _supposed_ to know this:
   - the registry for price, seat count, kerb weight, wheelbase, licence class
     (it measured actual vehicles);
   - the encyclopedia for seat height, torque, gearbox, and the power a model
     makes unrestricted (a registry never records those honestly).

The result carries `fieldSources`, so every merged row can say where each of its
numbers came from:

```json
{ "seatHeightMm": "wikipedia", "msrpAmount": "rdw", "category": "curated" }
```

Merging is order-independent by construction, and there is a test that says so.

## Rebuilding — `rebuild.ts`

```bash
npm run db:rebuild      # no network; re-derives the catalogue from what is stored
```

Run it after changing an identity rule, a curated alias or a field priority. The
evidence has not changed, only what we make of it.

It is idempotent and safe:

- an identity reuses its existing row, so swipes and saved bikes survive;
- a canonical row nothing describes any more is **retired, never deleted** —
  swipes reference motorcycles with `onDelete: Restrict`;
- images a provider claims are replaced; photographs the Commons search job
  found are left alone, which is what `MotorcycleImage.source` is for.

An import runs a rebuild automatically when it finishes. Pass `skipRebuild` to
run several providers back to back and rebuild once at the end.

## Adding a curated entry

Add a row to `CURATED` in `curated.ts` and run `npm run db:rebuild`. No import,
no network. A curated category outranks every inferred one, which is how
"Ninja 650" stopped being a supersport.

## Type codes

A registry files most of the Japanese range under factory type codes —
`MTN890D` is a Yamaha MT-09 SP, `CB1000RA` a Honda CB1000R with ABS — and
spells each one a dozen ways. `typeCodes` on a curated entry matches the code as
a prefix of the first word, with any letter suffix ignored and any digit suffix
refused: `MTN690` claims `MTN690-U (MT-07)` but not `MTN6901`, and `CRF1100A`
claims `CRF1100A` but not `CRF1100A4`, which is the Adventure Sports and has its
own entry. Longest code wins, so `CB1000R` takes `CB1000RA` before `CB1000` can.

## Families and generations — `generations.ts`, `boundaries.ts`

```
Manufacturer → ModelFamily → Motorcycle (one generation) → ModelYear
```

`Motorcycle` is one generation of a family, and the only thing a deck shows.
Most families have exactly one, with `boundarySource: UNKNOWN`, and that is the
honest default. A family is divided only by:

- **curated boundaries** in `generations.ts` — each with a reason and a
  reference, applied where a human established them and nowhere else; the
  uncovered years form their own `UNKNOWN` generation;
- **detected boundaries** — a step in engine capacity or rated power in the
  registry's own per-year figures. Mass and price are deliberately not signals:
  they moved with sampling noise and would have invented generations.

A restyle is invisible to the registry. The Kawasaki Z900 gained three
kilograms across two redesigns, so its generations are curated or they are
nothing.

Each generation carries its own registrations, price (the latest model year's
list price, with `msrpYear`), capacity and weight from its own years; a field
another source won — a published seat height — is left alone. `ModelYear`
holds the per-year registry figures behind that.

Photographs carry a scope. One found by name is evidence of the family and is
shown on every generation, marked `FAMILY`; one whose file name states a year is
`MODEL_YEAR` and goes only to the generation containing it. Nothing is ever
widened beyond what the file proves.

## Evidence and eligibility — `evidence.ts`, `assess.ts`

The product promise is a trustworthy card, not a large catalogue. So every
generation stores what its evidence amounts to, field by field:

| status        | means                                                              |
| ------------- | ------------------------------------------------------------------ |
| `VERIFIED`    | a curated fact, a published specification, or the registry on many |
| `HIGH`        | a real source, from fewer examples or with a known weakness        |
| `INFERRED`    | derived: a category from a name, a riding position from a category |
| `UNKNOWN`     | nobody said                                                        |
| `CONFLICTING` | two sources disagree materially; one was chosen, the doubt is kept |

`imageStatus` says how narrowly the primary photograph is known to be of this
generation, and `availability` whether the model is on sale new — decided from
first admissions in meaningful numbers, so one straggler dated 2026 does not
make a 2005 motorcycle available new.

`discoveryEligible` is the baseline for entering any discovery round: an
established identity and a photograph of _this_ generation. A family-scope
photograph on a divided family fails it, because a 2018 picture standing in for
the 2025 restyle is the one confident wrong answer this app cannot afford.
Everything else is the round's business: a round that filters on power excludes
unknown power by itself, and a round that does not never loses a bike over a
figure it did not ask about. Browse ignores all of this and shows the whole
catalogue.

```bash
npm run db:audit -- --since 2020     # the modern-catalogue audit
```

## Where photographs come from, and what each proves

| source             | what it is                         | what it proves                                                                          | licence          |
| ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| `wikipedia`        | files used in the English article  | the family; the model year when the file name states it                                 | CC, credited     |
| `wikipedia-de`     | files used in the German article   | the model year when the caption says "Baujahr 2021"; else the family                    | CC, credited     |
| `commons-search`   | Commons full-text search by name   | the family; the model year when the file name or caption states it                      | CC, credited     |
| `commons-category` | the family's Commons category tree | as above, plus: a year-named subcategory; a photo date that rules out later generations | CC, credited     |
| `manufacturer`     | the maker's own Dutch model page   | the current model year, stated in the asset name or path                                | **hotlink only** |

Every image row carries `scope`, `modelYear`, `evidence` (one checkable line)
and `license`. Nothing is ever widened beyond what the evidence says.

Manufacturer photography is copyrighted: those rows are never downloaded or
self-hosted, only shown from the maker's own URL, and `MANUFACTURER_IMAGES=off`
turns them off entirely while keeping the specifications. That is a defensible
position for a private instance; a public one should ask first.

```bash
npm run db:fetch-photos:categories -- --since 2020   # walk Commons category trees
npm run import:run -- --source wikipedia-de --allow-network --skip-rebuild
npm run import:run -- --source manufacturer  --allow-network --skip-rebuild
npm run db:rebuild
```
