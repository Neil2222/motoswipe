# UI/UX-review — 5 september 2026

Beoordeeld vanaf commit `ae69535`, na de laatste wijzigingen van Claude.
De swipeflow is lokaal bekeken op desktop en mobiel. De bredere opmerkingen
hieronder komen uit de pagina's en componenten in de code; dit is geen volledige
toegankelijkheidsaudit van ieder scherm.

## Wat goed werkt

- De motorfoto krijgt de hoofdrol. Specificaties zijn één handeling verwijderd,
  waardoor het eerste oordeel visueel blijft.
- De donkere stijl, oranje merkaccenten en aparte besliskleuren zijn consequent.
- Ronden, een shortlist en onderlinge vergelijkingen vormen een duidelijke route
  van ontdekken naar kiezen. De garage biedt daarnaast een blijvende verzameling.
- De filters behandelen ontbrekende gegevens zorgvuldig. De aanbevelingen mogen
  die regels niet omzeilen.

## Aangepast

- **Een ronde leert van swipes.** Categorie weegt het zwaarst, merk bescheidener.
  Likes verhogen de kans, afwijzingen verlagen die, superlikes tellen dubbel en
  skips blijven neutraal. De invloed van de eerste swipes is gedempt. Andere
  typen houden altijd een positieve kans.
- **Kleine buffers.** Vier kaarten bij de start, aanvullen richting vier zodra
  er twee over zijn. Foto's worden alvast geladen; aanwezige kaarten verspringen
  niet. Elke aanvulling gebruikt de inmiddels opgeslagen keuzes.
- **Vrijheid om te stoppen.** De shortlist is direct bereikbaar vanuit het
  swipescherm. De nieuwe-rondepagina legt uit dat je niet alles hoeft te swipen.
- **Bediening op mobiel.** De vijf knoppen hebben zichtbare namen, passen ook
  op 320 pixels breed en hebben minimaal 44 bij 44 pixels aanraakruimte.
  De informatieknop is eveneens vergroot.
- **Herstel bij problemen.** Een mislukte aanvulling toont een retry in plaats
  van 'Deck complete'. Opslag loopt in volgorde, tellers blijven rekening houden
  met wachtende keuzes en undo wacht op opslag. Navigatie binnen de app wacht op
  de opslagwachtrij voordat de shortlist of een andere ronde opent.

## Bewuste grenzen

Voorkeuren horen bij één ronde. Een zoekopdracht voor een eerste motor hoeft
geen invloed te hebben op een latere vakantiemotor. Undo verwijdert het signaal
uit toekomstige aanvullingen; de al geladen buffer blijft staan. Bij heropenen
kunnen ongeziene kaarten opnieuw gerangschikt worden. Opgeslagen beslissingen
blijven behouden.

De selectie gebruikt categorie en merk, geen beeldherkenning of voorspelling
van comfort, prijs of geschiktheid. Dit is een uitlegbare eerste versie waarvoor
geen databasewijziging of externe dienst nodig is.

## Volgende verbeterpunten

1. **Kortere startpagina.** Doel en notities staan nu vóór de primaire actie,
   terwijl ze optioneel zijn. Onder een uitklapbaar onderdeel kunnen ze ruimte
   maken voor sneller beginnen. Vermeld daarbij dat vrije tekst geen filter is.
2. **Eén ingang naar ronden.** 'Dashboard' en 'Rounds' staan beide in het menu,
   terwijl `/rounds` naar `/dashboard` verwijst. Eén naam voorkomt een keuze
   tussen twee ingangen naar hetzelfde scherm.
3. **Dialoogbediening.** De specificaties en shortcuts gebruiken `aria-modal`,
   maar hebben nog geen volledige focusverplaatsing, focusbegrenzing en
   focusteruggave. Dit verdient een gezamenlijke aanpak voor alle dialogen.
4. **Ruimere visuele aanbevelingen.** Pas na ervaring met deze eerste versie
   verwante categorieën toevoegen, bijvoorbeeld naked en hyper naked. Nu staat
   een categorie voor zichzelf; één stijlvoorkeur is geen bewijs voor een andere.

De catalogus en de regels voor foto- en gegevensevidence zijn niet aangepast.
