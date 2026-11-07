# ZakazIQ — product truth

This file gives design and writing tools a short, factual picture of ZakazIQ. Detailed scope remains in [`docs/workspace/PLAN.md`](docs/workspace/PLAN.md) and the current product decisions in [`memory/memory.md`](memory/memory.md).

## What it is

ZakazIQ is a Czech-language workspace for small service businesses. It keeps customer requests, appointments, customer history and business money together in one daily tool that works on a phone and a computer.

The product is used by a business owner and their staff. A business can connect its own website, use a ZakazIQ booking page, or share a booking link or QR code.

## The main job

Keep one customer request connected to the work that follows: the requested time, the confirmed appointment, the customer record and, after payment is recorded, the income and loyalty stamp.

A request is not a confirmed appointment. The owner reviews it and confirms, changes or declines it. Confirming a time alone does not record income or award a loyalty stamp.

## Included work

- Receive requests from a business website, booking page or widget.
- Manage appointments, availability, staff schedules and blocks in a calendar.
- Keep customer contacts, visit history, notes, groups and loyalty cards together.
- Manage jobs, invoices, income, expenses and an estimate of taxes.
- Send customer messages and appointment emails, with settings for the business.

The current plan includes these functions, one business and an unlimited number of staff members.

## Commercial terms

- 249 Kč per month as the final listed price.
- A 14-day free trial; a payment card is required at registration.
- One business per account. Adding another business is not available in the current product.
- The included functions are in one plan; do not invent tiers, add-ons or price reductions.

## Content and evidence rules

- Write for Czech small-business owners in plain Czech. Address the user as **vy**.
- Do not invent customer counts, time saved, outcomes, testimonials, reviews, customer logos or press mentions.
- Label demonstration content as **Ukázka**. Names and amounts in the existing product demonstrations are fictional.
- Describe a request as pending until the owner confirms it. Describe income only after payment is recorded.
- Do not promise a feature, integration or legal/compliance outcome beyond the current product plan.

## Landing page story

The public landing page tells one story: first the chaos (a business run from a phone, a diary, a spreadsheet, email and a paper note, backed by published statistics with a named source), then the question "do you recognise yourself?", then ZakazIQ as the one place for all of it. Statistics on the page must come from a named published source with a link; the product never claims its own numbers (time saved, income gained).

After the hero the page has exactly four blocks, in this order (R-081): statistics (ending with "do you recognise yourself?"), introduction (how a request arrives, the customer card, money), offer (the single price and the one main action), and inquiry (three short questions and the contact form as the end of the page). New landing content goes into one of these four blocks, not into a fifth section.

## Product surfaces

- The public landing page explains the product and its pricing.
- Workspace is the business owner's day-to-day application.
- The booking page, embedded booking widget and customer portal are public customer-facing surfaces.
- The VIZEON, ALTENO and Hub personal admin is a separate application with a separate visual system.

## Brand anchor

Keep the existing ZakazIQ **Dílky** identity: its logo, navy palette, tile motif and Instrument Sans / Instrument Serif / JetBrains Mono roles. The detailed visual rules are in [`DESIGN.md`](DESIGN.md) and the implementation in `app/ws-tokens.css`, `lib/ws/fonts.ts` and `lib/ws/tailwind-dilky.ts`.
