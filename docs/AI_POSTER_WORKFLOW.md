# AI template creator workflow

EasyPoster includes a first **Create with AI** prompt prototype for Church and Worship → Church Service, alongside **Create template from poster**.

## Prompt prototype

In the poster editor, open Create with AI. Enter exact wording and a visual brief, optionally upload a speaker photo, logo, or background, and choose a direction or let the app select a fresh family. Output is currently 1080 × 1350.

The Worker retrieves one of the seven actual Markdown annotations from `docs/design-library`, adds the runtime layout skill, and requests an original editable manifest. Example images and identities are not used as generated artwork. This initial retrieval uses portrait availability or an explicit style choice, not semantic ranking. A new seed varies each request; the automatic choice avoids immediately repeating the previous family within the open dialog.

The browser resolves supplied assets and optionally the first Pexels background match, compiles native editable layers, opens the draft, captures the rendered canvas including its background, and requests one correction pass. A failed review retains the first draft. The review is another quota-counted model request. Review quality is not guaranteed; inspect the result before publishing.

Creation now checks explicit prose fields (church, lead pastor, theme, venue, long-form date, and AM/PM times) before opening a draft. It attempts one additional generation if facts are missing or logistics overlap the portrait, then rejects an incomplete result without replacing the canvas. These conservative checks are not a complete natural-language fact extractor. A visual review that drops checked facts is rejected in favour of the initial draft. Creation also deduplicates standard Sunday Service headlines, removes known placeholder/slogan leakage, and orders wording above cards and photographs. Supplied logos are size-bounded in creation and fitted without cropping by the compiler. Reconstruction otherwise retains its original layering.

Save existing work first: generation opens a new document in the current editor. The result includes a preview and any warnings. Existing image reconstruction remains available through “Recreate an existing poster instead”. Follow-up chat editing is not included in this first prototype.

Local generation requires `OPENAI_API_KEY` in the ignored `.dev.vars`. There is no fake generation fallback when the key is absent. Optional stock search uses the existing `PEXELS_API_KEY`. Upload a transparent portrait for cutout layouts; this flow does not remove backgrounds automatically. No deployment or real model benchmark is implied by the local prototype.

Both modes use the existing authenticated, bounded, quota-controlled `/api/ai/poster-reconstruction` endpoint. An optional validated `creation` object selects original design or rendered review; cache keys include the brief, seed, reference choice, assets, review manifest, and creation version. Only the validated manifest is compiled; no model-generated executable code is accepted.

## Reference reconstruction

It converts a flattened PNG, JPEG, or WebP reference into an editable,
reusable template while keeping all model output behind validated contracts.

## How it works

1. The browser prepares a high-detail working reference and sends it to
   `POST /api/ai/poster-reconstruction`.
2. The Worker requests a strict reconstruction manifest containing editable
   text, basic geometry, cropped image regions, approximate fonts, canvas
   colors, z-order, confidence, suggested field labels, and supported 3D text
   treatment.
3. Trusted browser code compiles the manifest into ordinary EasyPoster/Fabric
   layers. Model-produced executable code, arbitrary URLs, and unvalidated SVG
   are not accepted.
4. A low-opacity, locked copy of the reference is added as a tracing guide and
   must be replaced or deleted before the template is published.
5. The editor enters template-labeling mode automatically. Likely titles,
   dates, names, venues, logos, and portrait slots arrive pre-labeled so the
   creator can correct the draft and save it to the cloud template library.

Complex references have a reconstruction-only output allowance of 12,000
tokens and a 110-second upstream timeout. The browser waits 135 seconds so the
Worker can return a structured error first. Worker logs distinguish output
limits, content filtering, and incomplete upstream responses.

Clearly dimensional headline blocks use the approved
`two-layer-face-shell-v1` treatment. Separate headline lines remain
independently editable. Outlines, glows, and ordinary drop shadows remain flat
text.

Complex photos, logos, and decorations are currently reconstructed as
rectangular raster crops. The result is an editable starting point rather than
lossless layer recovery from pixels.

## Local development

Set `APP_ENV=development` and `MAX_PROJECT_BYTES=15728640` in the ignored
`.dev.vars` file, then run:

```text
npm install
npm run db:migrate:local
npm run dev -- --host 127.0.0.1
```

Add `OPENAI_API_KEY` only to `.dev.vars` when testing the live model. Never
commit a real key.

## Cloudflare configuration

The Worker keeps `OPENAI_MODEL`, `MAX_AI_REQUEST_BYTES`, and
`MAX_AI_GENERATIONS_PER_DAY` as non-secret settings. The OpenAI key remains
an encrypted Worker secret. Reconstruction plans and usage counters are stored
in D1; reference pixels are not persisted by the AI route.

Before production exposure, protect `/api/*` with Cloudflare Access and avoid
an unprotected `workers.dev` bypass. The production identity boundary trusts
Cloudflare Access's authenticated email header.
