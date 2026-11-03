---
name: ZakazIQ
description: Dílky — a clear daily workspace for Czech small businesses.
colors:
  navy-950: "rgb(12 26 54)"
  navy-900: "rgb(19 40 80)"
  navy-800: "rgb(27 56 104)"
  navy-700: "rgb(35 71 139)"
  navy-600: "rgb(43 87 168)"
  navy-500: "rgb(58 110 196)"
  navy-400: "rgb(92 141 211)"
  navy-300: "rgb(138 174 227)"
  navy-200: "rgb(184 206 239)"
  navy-100: "rgb(220 231 247)"
  navy-50: "rgb(238 242 251)"
  ground: "rgb(244 246 251)"
  surface: "rgb(255 255 255)"
  ink: "rgb(12 26 54)"
  quiet: "rgb(74 88 120)"
  signal: "rgb(255 181 71)"
  signal-bg: "rgb(255 247 232)"
  signal-line: "rgb(225 154 44)"
  signal-ink: "rgb(107 67 0)"
  reward: "rgb(255 210 138)"
  danger: "rgb(179 38 30)"
  staff-1: "rgb(35 71 139)"
  staff-2: "rgb(13 124 117)"
  staff-3: "rgb(109 76 170)"
  staff-4: "rgb(166 83 94)"
  staff-5: "rgb(115 120 40)"
typography:
  display:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  heading:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  page-title:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  accent:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "inherit"
    fontWeight: 400
    lineHeight: "inherit"
    letterSpacing: "-0.01em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  tiny: "9px"
  chip: "12px"
  box: "20px"
  panel: "24px"
  slab: "32px"
  hero: "40px"
  pill: "9999px"
spacing:
  unit: "4px"
  compact: "8px"
  base: "16px"
  group: "24px"
  section: "120px"
components:
  button-primary:
    backgroundColor: "{colors.navy-700}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-inverse:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy-950}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.chip}"
    padding: "0 14px"
    height: "44px"
---

# Design System: ZakazIQ

## Overview

**Creative North Star: “Každá poptávka na svém místě.”**

ZakazIQ’s visual world starts with the 2×2 tile mark. The tiles connect the wordmark, the calendar, the customer’s loyalty stamps and the small-business modules. They identify the product; they do not replace its real work. The calendar and the request moving from pending to confirmed remain the strongest product image.

The Dílky identity is the approved visual system. Keep its navy shell, its warm request signal, its own type and its dark sidebar in Workspace. Taste and Impeccable contribute checks for hierarchy, density and repeated patterns; their neutral default palettes do not replace the approved brand.

**Key Characteristics:**

- Navy surfaces and the 2×2 mark establish the ZakazIQ identity.
- One request connects calendar, customer history and recorded income.
- Color, borders and motion indicate a real state or action.
- The landing page shows the product itself, with sample content marked “Ukázka”.
- The calendar is the main workspace; the next action sits alongside it on wide screens and the phone agenda puts times first.
- The calendar story sits on a quiet navy surface so the product and its narrative stay readable.

## Colors

The palette is a deep navy system with cool light surfaces. Warm amber is reserved for work that needs attention; staff colors distinguish calendar owners and do not mean status.

### Primary

- **Deep navy** (`navy-950` to `navy-700`): brand mark, Workspace sidebar, headings and primary actions. The primary action uses `navy-700`.
- **Mid navy** (`navy-600` to `navy-400`): logo and mark tones, links and restrained heading accents.

### Secondary

- **Request amber** (`signal`, `signal-bg`, `signal-line`, `signal-ink`): a new request, a live arrival indicator or a booking that needs a decision.
- **Reward amber** (`reward`): a loyalty reward that is ready.
- **Staff colors** (`staff-1` to `staff-5`): distinguish staff appointments in a multi-person calendar; they never encode urgency, approval or error.

### Neutral

- **Cool ground** (`ground`): the Workspace page canvas.
- **White surface** (`surface`): forms, panels and light product fragments.
- **Ink** (`ink`): primary text; **quiet** (`quiet`): supporting text on light surfaces.
- Dark mode maps the ground and surfaces to navy steps and raises text to the pale navy range.

### Named Rules

**The One Warm Signal Rule.** Warm amber belongs to a new request, an active arrival or a ready reward. It is not a decorative accent.

**The State Carries Meaning Rule.** A pending request has a dashed amber outline; a confirmed appointment has a navy tint and a solid leading edge. Preserve these signals across the app, booking page and product demonstrations.

### Contrast

**The Quiet Text Contrast Rule.** Keep the `quiet` token fully opaque for normal supporting text, placeholders, select prompts and outside-month dates. Reduce opacity only for truly disabled controls. On the light ground it exceeds 6:1 contrast.

## Typography

**Display Font:** Instrument Sans (system-ui, sans-serif)  
**Body Font:** Instrument Sans (system-ui, sans-serif)  
**Label/Mono Font:** JetBrains Mono (ui-monospace, monospace)  
**Accent Font:** Instrument Serif italic (Georgia, serif)

Instrument Sans carries the interface. Instrument Serif appears only as the second, emphasized part of a selected Workspace heading; landing page headings are one sentence in Instrument Sans with no italic accent and no section marker above them (R-078). JetBrains Mono is reserved for measured data: times, dates, amounts and counts.

### Hierarchy

- **Display** (600, 40px on phones; 64px from 640px; 88px from 1024px, 0.98 line-height): the landing page H1.
- **Headline** (600, 28px on phones; 44px from 640px; 56px from 1024px, 1.02 line-height): landing page H2.
- **Page title** (600, 28px on phones; 36px from 640px): Workspace page titles.
- **Body** (400, 15px in the compact layout and 17px at wider breakpoints, 1.5 line-height): explanatory and form text.
- **Data and labels** (12–13px, regular or medium): times, dates, amounts, section markers and secondary metadata.

### Named Rules

**The Two-Voice Rule.** Serif italic is an occasional heading accent, never a paragraph or a standalone decorative word. Mono is for data, code and the intentional chapter markers, not ordinary body copy.

## Layout

The landing page uses a fluid frame up to 1200px, with 20px phone gutters and 28px at wider breakpoints. Its sections have different compositions: the calendar story, customer history, money, module mosaic, web connection and pricing each show their own product object. The hero's tile field sits behind the introduction; the story itself has a solid navy surface so its content remains readable. The calendar and request detail stay visible together, with the calendar on the left and story on the right on desktop; on phones, the compact scene comes before the story in both visual and keyboard order. On very short screens the scene scrolls normally so the text remains readable.

Workspace uses a ground canvas with white working surfaces. The navy sidebar is a 92px icon rail on tablets and a 208px labelled navigation on wide screens. On Dnes, the calendar occupies the main area and the next action and incoming requests sit alongside it. Above 1280px, a detail can dock on the right and the calendar expands into the remaining area. On phones, the next action and a compact time-first agenda stack above the bottom navigation.

Spacing follows a 4px base. Keep at least 44px for touch actions. Product details should remain within two actions from Dnes where the workflow allows it.

## Elevation & Depth

Depth comes from contrast between navy and light surfaces, restrained tonal steps and thin borders. At-rest work panels do not need a shadow. Shadows belong to floating menus, dialogs and the distinctive loyalty card; the card’s depth is part of its existing navy gradient treatment.

**The Resting Surface Rule.** Use a border or a tone change for a panel. Reserve shadows for elements that float and the established loyalty card.

## Shapes

Controls and state chips use full pills. Inputs use a compact 12px corner. Product panels use the existing 20px and 24px radii; large landing surfaces use 32px and 40px corners. Small calendar entries use the tighter 9px corner so they remain legible in a dense schedule.

The pending request’s dashed edge and the confirmed appointment’s 3px leading edge are data marks, not a general card decoration. Keep the distinction and do not add colored edge bars to unrelated content.

## Components

### Buttons

- **Shape:** full pill; primary and inverse actions are at least 44px high.
- **Primary:** navy action (`navy-700`) with white text, 20px horizontal padding and a semibold Instrument Sans label.
- **Hover / Focus:** darken one navy step on hover; use the visible ring and offset from the shared button component.
- **Secondary / Ghost / Tertiary:** outlined, quiet surface, or text link. Keep one primary action on a screen.

### Chips

- **Style:** full pill, short Czech label, readable contrast. Neutral and confirmed states use navy tones.
- **State:** use the amber dashed treatment only for a new request or arrival. Do not turn every status into a colored pill.

### Cards / Containers

- **Corner Style:** use the radius that belongs to the object: 20px or 24px for regular panels; 32px or 40px for large landing sections.
- **Background:** white `surface` on the light `ground`, or a documented navy surface in dark contexts.
- **Shadow Strategy:** flat at rest; see Elevation & Depth for floating layers and the loyalty card.
- **Border:** a quiet navy-100 edge where a surface needs separation.
- **Internal Padding:** 16px to 24px for working panels; denser schedule blocks use their own compact spacing.

### Inputs / Fields

- **Style:** white surface, 1px token border, 12px radius, 44px height and 14px horizontal padding.
- **Focus:** navy border with a visible ring.
- **Error / Disabled:** use the danger token for errors; keep disabled labels legible.

### Navigation

Desktop Workspace navigation is a dark navy sidebar with the active item on a navy-700 surface; labels sit beside the icons on wide screens. Phone navigation uses the compact top bar and bottom destinations. Filter rows retain a pill for the current selection and use quieter text for the other options. When a detail is docked, search becomes a 44px icon button to leave room for the business name. Marketing navigation stays inside the dark hero and condenses to a dark, opaque floating bar while scrolling.

### Signature request and booking blocks

A pending request uses the signal background, a 1.5px dashed signal edge and signal ink. A confirmed appointment uses a navy-100 surface and a 3px navy-700 leading edge. These two shapes let the owner tell a request from a booking at a glance.

### Tile mark and loyalty card

The 2×2 tile mark is the product signature. Loyalty stamps reuse its rounded square shape. The loyalty card keeps its approved navy gradient and its distinctive floating shadow; neither treatment becomes a generic card style.

## Do's and Don'ts

### Do:

- **Do** keep the Dílky logo, navy palette, type roles and tile mark on ZakazIQ surfaces.
- **Do** make the calendar and the pending-to-confirmed journey the product’s visual evidence.
- **Do** use signal amber only for a new request, live arrival or ready reward.
- **Do** keep sample data clearly marked “Ukázka” and never invent proof or performance claims.
- **Do** preserve numbered landing chapters: their sequence and section map are part of the approved brief.
- **Do** use shared color and component tokens instead of raw UI colors.

### Don't:

- **Don't** replace Dílky with a generic neutral SaaS theme or the Workspace dark sidebar with a pale default shell.
- **Don't** add repeated icon-feature cards, generic dashboard tiles, stock photos, emoji, glass or decorative gradients.
- **Don't** use warm amber as decoration or let staff colors imply a booking state.
- **Don't** turn a pending request into a confirmed appointment or record income before payment is recorded.
- **Don't** apply this design system to the separate VIZEON, ALTENO or Hub admin.

The implementation sources are `app/ws-tokens.css`, `lib/ws/tailwind-dilky.ts`, `lib/ws/fonts.ts`, `components/ui/` and `components/ws/brand/`.
