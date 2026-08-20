# AI reference-to-poster workflow

## Template Creator

The poster editor also includes **Template Creator**, a separate general-purpose
reconstruction path for bootstrapping reusable templates from flattened PNG,
JPEG, or WebP posters.

1. The browser prepares a high-detail working reference and sends it to
   `POST /api/ai/poster-reconstruction`.
2. The Worker requests a strict reconstruction manifest containing editable
   text, basic geometry, cropped image regions, approximate fonts, canvas
   colors, z-order, confidence, suggested field labels, and whether a prominent
   headline clearly uses the approved two-layer 3D treatment.
3. Trusted browser code compiles the manifest into ordinary EasyPoster/Fabric
   layers. No model-produced SVG, paths, URLs, or executable code is accepted.
4. A low-opacity, locked copy of the reference is added as a tracing guide and
   must be replaced or deleted before the template is published.
5. The editor enters its existing template-labeling mode automatically. Likely
   titles, dates, names, venues, logos, and portrait slots arrive pre-labeled;
   the creator can correct the draft and then save it to the cloud library.

Clearly dimensional headline blocks are compiled with
`two-layer-face-shell-v1`: a light front face and a poster-matched colored rear
shell. Separate headline lines are requested as separate 3D poster elements so
they can be resized independently on the poster canvas. The elements keep the
full 3D configuration for editing, and their template text bindings regenerate
the preview without changing the poster-sized bounding box. Outlines, glows,
and ordinary drop shadows remain flat text.

This first version intentionally keeps complex photos, logos, and decorations
as rectangular raster crops. It is an editable starting point, not lossless
layer recovery from pixels. A future segmentation pass can replace those crops
with alpha-masked regions without changing the reconstruction contract.

EasyPoster now has a template-first reference workflow. The AI never generates
the final bitmap or arbitrary editor code. It returns a small, validated design
plan; trusted TypeScript recipes compile that plan into editable Fabric.js and
3D-text layers.

## What is implemented

1. **Reference preparation in the browser**
   - The reference is resized to a maximum 1024 px edge and encoded as WebP.
   - Portraits are resized separately and remain in the browser; they are not
     sent to OpenAI.
2. **Authenticated Worker planner**
   - `POST /api/ai/poster-plan` accepts the reference and exact event brief.
   - The Worker sends one vision request through the OpenAI Responses API.
   - Structured Outputs restrict the response to approved template, recipe,
     font, palette, and normalized-layout tokens.
   - Text visible in the poster is treated as untrusted; exact names, dates,
     scripture, and venue always come from the form.
3. **Cost controls**
   - D1 caches each validated plan by owner, reference hash, brief, model,
     quality, prompt version, schema version, and recipe-catalog version.
   - Exact repeats return the cache without another model call.
   - D1 enforces a configurable per-owner daily generation limit before an
     upstream call.
   - The default model is `gpt-5.6-luna`; economy mode uses low-detail vision.
4. **Deterministic compiler**
   - Creates an A-series portrait canvas, atmospheric background, organization
     line, two independent 3D title layers, vector theme plaque, up to four
     portrait slots, roles/names, and two-band footer.
   - The initial 3D title is a dependable SVG-backed preview with the full
     WebGL material configuration attached. Use **Edit in 3D** to render or
     refine it with the existing Three.js editor.
5. **Local fallback**
   - In `APP_ENV=development`, no OpenAI key is required. The endpoint returns
     the built-in four-person conference recipe so the complete UI and compiler
     can be tested for free.
   - Production fails closed when the secret is missing.

## Run it locally now

The existing `.dev.vars` should contain:

```text
APP_ENV=development
MAX_PROJECT_BYTES=15728640
```

Then run:

```text
npm install
npm run db:migrate:local
npm run dev -- --host 127.0.0.1
```

Open the poster editor and choose **Create with AI** in the left panel. Without
an API key, the result uses the free deterministic fallback. Upload transparent
PNG/WebP portrait cutouts for the best composition; missing portraits receive
editable placeholders.

When an OpenAI key is available, add it only to the ignored `.dev.vars` file:

```text
OPENAI_API_KEY=your-local-development-key
```

Never put a real key in `wrangler.jsonc`, source code, or a committed file.

## Cloudflare setup

The repository binds `DB` to the existing `easyposter-studio-db` database and
uses binding-only R2 declarations so modern Wrangler can provision the two
buckets on the first successful deployment. For a manual CLI deployment:

```text
npx wrangler login
npm run deploy
```

The deploy script builds the application, provisions the `PROJECTS` and
`ASSETS` bindings when needed, deploys the Worker, and applies the D1
migrations to `DB`. Then add the OpenAI secret interactively and deploy again:

```text
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

`wrangler secret put` prompts securely; do not place the value on the command
line. For Cloudflare's Git integration, use build command `npm run build` and
deploy command `npm run cloudflare:deploy`, then add `OPENAI_API_KEY` as an
encrypted runtime secret in the Worker dashboard. The R2 buckets store
projects/assets, while AI plan JSON and usage counters are stored in D1.
Reference pixels are not persisted by the AI route.

Before exposing production, protect `/api/*` with Cloudflare Access and ensure
the Worker cannot be reached through an unprotected `workers.dev` bypass. The
current production identity boundary trusts Cloudflare Access's authenticated
email header.

## Configuration

The non-secret settings live in `wrangler.jsonc`:

| Setting | Default | Purpose |
| --- | ---: | --- |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Cost-sensitive vision planner |
| `MAX_AI_REQUEST_BYTES` | 3 MiB | Bound on compressed reference request |
| `MAX_AI_GENERATIONS_PER_DAY` | 20 | Per-owner paid-call limit |
| `AI_PROMPT_VERSION` | `poster-planner-v2` | Cache invalidation for prompt changes |
| `AI_RECIPE_CATALOG_VERSION` | `easyposter-recipes-v2` | Cache invalidation for recipes |

## Current limits and next recipes

- Automatic portrait background removal is not included yet. Use transparent
  cutouts or the existing mask/selection tools.
- The sample's diamond-plate front is approximated by an ivory metallic face
  and rough material. A licensed diamond-plate texture can be added as a new
  versioned headline recipe.
- The first compiler focuses on event/conference posters with one to four
  people. New layout families should be added as trusted recipes, not arbitrary
  model-produced SVG or JavaScript.
- Process recordings remain recipe-development data. Distill several approved
  sessions into a tested TypeScript recipe, then expose only its short ID and
  parameter contract to the planner.

## Learned two-layer 3D headline recipe

`two-layer-face-shell-v1` is the first recording-derived headline recipe. It
uses two registered WebGL text meshes: a deep, rounded rear shell and a shallow
front face. The construction, material coupling, lighting, camera, and layer
order are locked; the safe inputs are text, font, face color, shell/extrusion
color, environment, internal scene transform, and poster placement.

The 3D editor exposes the recipe in **Learned 3D style** for manual testing.
Applying it rebuilds both meshes atomically so they cannot begin with different
text or fonts. The preset and general 3D editor share an expanded built-in font
menu, while uploaded custom TTF/OTF fonts remain supported. The AI planner can
select the same versioned recipe when its
reference analysis finds a raised face over a contrasting deep shell. AI-created
poster layers use a lightweight two-layer SVG preview immediately and retain the
full WebGL configuration for editing and high-quality re-export.

Poster position and scale remain ordinary editable poster-layer transforms.
Future approved recordings should vary text length, actual font asset, face and
shell colors, and accepted placement while keeping the locked construction
values unchanged. A recipe version must be bumped before changing a locked
geometry, material, lighting, camera, or layer-order value.

The current seed is intentionally bounded to 80 characters and 48–160 font
size because its camera/framing came from the supplied recording. Add accepted
short, long, narrow-font, and wide-font examples before widening that envelope
or adding automatic geometry-based camera fitting.
