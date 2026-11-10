# Brand reference

> Taken from the business's printed Christmas flyer. The flyer itself is **not committed**
> to this repository, because it shows a personal phone number and the business name. It is
> kept privately with the project.

## What the flyer shows

| Element | Observation |
|---|---|
| Title | A short product line in a thin, dark-grey connected script |
| Strapline | "Traditional Jamaican Christmas and New Year cakes" in a bold, condensed grey sans-serif with a soft shadow |
| Prices | 6 inch £25 un-iced or £35 iced. 8 inch £40 un-iced or £50 iced. Rose-shaped mini cakes un-iced £10. The prices match the brief. |
| Signature | A gift tag signed by the baker in a red script |
| Logo | The business name in a red script, bottom right, with a phone number |
| Call to action | A red circle asking customers to order before a December deadline. **Not hardcoded.** The deadline is a setting the baker controls. |
| Imagery | A snowy silver-grey background, warm fairy lights, a white gift box with a deep red ribbon, red baubles and pine branches. **There is no cake photography.** |

## Business name

The brief, the flyer and the repository did not agree on the name, so it had to be
confirmed (Q1) before the domain, sender address, SNS topic name and page titles were
fixed. Every template and component takes it from the single `BusinessDisplayName`
deployment parameter, and the baker's first name from `BakerName`. Neither is in the code.

## Proposed design tokens (to be finalised in Phase 3)

These are taken from the flyer and from the brief's "deep red, white, subtle gold" direction.
The flyer has no gold, so gold is used sparingly, as the brief asks: thin rules and a small
accent on the prices. It is too light for text or focus rings, which need at least 3:1.

| Token | Value (proposed) | Use | Contrast note |
|---|---|---|---|
| `--red-700` | `#9E1B22` (deep ribbon red) | Primary buttons, headings, links | White text on it is 7.97:1 (passes AA and AAA, as calculated with the WCAG formula). |
| `--red-500` | `#C62828` (bauble red) | Hover states, highlights | |
| `--white` | `#FFFFFF` | Card backgrounds | |
| `--snow-100` | `#F2F3F5` | Page background (echoes the snowy flyer) | |
| `--silver-500` | `#8A8F98` | Borders and decorative elements | 3.25:1 on white, so it is not used for text |
| `--ink-900` | `#2B2B2B` | Body text (the flyer's dark grey) | |
| `--ivory-100` | `#F6EBD3` (gift-tag ivory) | Accent panels, e.g. "Payment in person" | |
| `--gold-500` | `#B8902F` | Fine accents only | 2.97:1 on white, so it is never used for text |

**Typography:** a script display face for the business name only. Options include *Great
Vibes* or *Parisienne* from Google Fonts, self-hosted for performance and privacy. It is
paired with a highly legible sans-serif for everything else, such as *Inter* or the system
UI font. Long passages are never set in script, for accessibility.

**Photography:** Real photos of the baker's cakes (iced, un-iced, a cut slice, the rose minis) are
needed. Stock photos of Christmas cakes would misrepresent the product. See Q21.

**The admin portal** uses the same red for primary actions, but otherwise follows a plain,
high-contrast, large-text layout. There are no snow effects or script fonts.

## Reference images (supplied 4 November 2026)

Four reference images were supplied. They are kept in the project files, **not in this repository**.

| Image | Use |
|---|---|
| A cake-shop product page ("Delicious" layout) | **Layout reference only.** Ideas to take from it: a large product photo framed in an **arch**, a big serif or script headline, the price beside a strong primary button, Description / Ingredients / Allergens in an **accordion**, generous white space, a simple top navigation, and a basket counter. It uses pink and purple. We will keep the red, white and ivory from the flyer instead. |
| A dark Jamaican black cake with a slice cut, on a wooden board | Placeholder product photo |
| A rum cake on a white stand, with a "Jamaican Rum Cake" caption baked into the image | Placeholder only. The caption would need cropping out. |
| A black cake on a red glitter board with pine, berries and baubles | Placeholder hero image. It is the best match for the festive red theme. |

**Licensing:** these look like images found online, and one looks AI-generated. Their
licences are unknown. They are fine as **development placeholders**, but they must be
replaced with the baker's own photos (Q21) before the site goes live. They should also not be
committed to a public repository. In Phase 3 the build will load placeholders from a
git-ignored `frontend/shop/public/placeholders/` folder, with a neutral fallback so a fresh
clone still builds.

**Motion (Phase 3):** subtle and purposeful. The hero photo fades and lifts gently into the
arch frame on load, product cards rise slightly on hover or focus, the accordions open
smoothly, and a light snowfall can play in the hero only. All of it switches off under
`prefers-reduced-motion`. Nothing animates in the admin portal, apart from brief feedback
on actions.
