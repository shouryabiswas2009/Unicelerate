# Design system

The look: **open, editorial and tidy**. Content sits on the page and is
organised by type, spacing and thin rules, not by stacks of rounded cards.
Colours, fonts (Plus Jakarta Sans for headings, Geist for text) and the logo
are unchanged; the tokens live in `app/globals.css`.

## How it works and why

Everything being a floating rounded card is the generic "template" look:
each box adds a border, padding and a corner, and pages turn into a grid of
equal-weight tiles where nothing leads. Taking the boxes away and letting
headings, alignment and hairlines do the grouping makes pages calmer, easier
to scan and more clearly *designed*. The rules below keep it consistent; a
test (`scripts/design-guard.test.mjs`) stops the old look creeping back.

## Radius scale

`--radius` is **6px**. Derived: `rounded-sm` 4px (tags, small controls),
`rounded-md` 5px (buttons, inputs, popovers), `rounded-lg` 6px (cards and
panels), `rounded-xl` 8px (the largest; rarely needed). `rounded-2xl`,
`3xl` and `4xl` are capped at 8px for old code but **not allowed** in new
code. `rounded-full` only for things that are round by nature: dots, the
logo mark, avatars, slider thumbs and progress bars.

## Grouping: border, divider or band?

| Use | When | Example |
| --- | --- | --- |
| **Nothing** (whitespace) | Text that belongs to its heading | Section intros, About |
| **Hairline divider** (`border-t`, `divide-y`) | A list of like items, figures, rows | What's new, Real data, figure lists on a university page, top picks |
| **Left rule** (`border-l-2 pl-3`) | A note, tip or callout inside a section | "How well does it fit you?", verdicts on the offers page, warnings |
| **Band** (full-width background) | Changing the mood between sections | Try it (tinted), the numbers (dark green), the closing call to action (light) |
| **Card** (`rounded-lg border`, no shadow) | Something you act on as one unit | A university in a result list, an offer, a form panel, the "Your fit" panel |

Rules:
- **No card inside a card.** Inside a card, group with dividers or a left rule.
- **No pill unless it's interactive.** Labels are plain text with a coloured
  dot (`components/dot-label.tsx`), or a slash/dot separator. Buttons and
  removable chips may have a shape.
- **No shadows on things that sit on the page.** `shadow-md` is the most,
  and only for things that float above it (popovers, menus, the sticky
  compare bar). No glows, gradients or glass blur.
- **No icon circles.** Icons are small line icons inline with a heading or
  label, or left out.

## Type scale and rhythm

- Headings: Plus Jakarta Sans, bold; sections use `text-section`, the hero
  `text-display`; a small uppercase **eyebrow** (`.eyebrow`) or a numbered
  marker ("01", "02") above or beside.
- Body: Geist, comfortable line length (about 60–70 characters:
  `max-w-xl`/`max-w-2xl` on paragraphs).
- Numbers that matter are large and stand alone (the numbers band, the
  headline figures on a university page), not boxed.
- Spacing: sections use `section-y` (3–5rem, fluid); inside a section,
  `gap-6`/`gap-10` between groups and `py-3`–`py-6` per row. Layouts are
  asymmetric where it helps (heading column + list column).

## Links, focus and motion

- Text links are underlined with a light underline that darkens on hover.
- Focus rings (`focus-visible:ring-3 ring-ring/50`) on everything
  interactive; nothing removes them.
- Motion is short and subtle (`.rise`, `.appear`, `.reveal`), and turned
  off by `prefers-reduced-motion`.
- Dark mode uses the same tokens; check contrast (WCAG AA) when adding a
  colour.

## Imagery

Real data visuals (the match scores, numbers, mock screens built from real
data) and the existing original graphics, shown without frames. No stock
photos beyond the credited hero, and nothing copied from another brand.

## Brand assets and their licences

(Moved from the credits page, which now lists only data and image
citations.)

- **Logo**: original, made for this project: a graduation cap lifted by an
  upward swoosh, hand-drawn as SVG paths in `components/brand/mark.ts`; it
  doesn't copy or adapt any other brand's logo or a stock icon. The tab
  icon, app icons and share image are generated from it
  (`npm run brand:icons`, `app/opengraph-image.tsx`).
- **Fonts**: Geist and Geist Mono (body, code) and Plus Jakarta Sans
  (headings), SIL Open Font License 1.1, self-hosted by `next/font`.
- **Icons**: Lucide (`lucide-react`, ISC) and flag-icons (MIT).
- The landing page's screen previews are drawn with the site's own
  components and real computed data, not images.

The credits page keeps one line naming these licences, since the OFL, ISC
and MIT licences ask for their notices to travel with the software.

