# AI template creator workflow

EasyPoster's remaining AI creation product is **Create template from poster**.
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
