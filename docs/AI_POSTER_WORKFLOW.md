# AI reference-to-poster workflow

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

The repository uses binding-only D1/R2 declarations so modern Wrangler can
provision the required resources on the first deployment. For a manual CLI
deployment after creating the Cloudflare account:

```text
npx wrangler login
npm run deploy
```

The deploy script builds the application, provisions the `DB`, `PROJECTS`, and
`ASSETS` bindings when needed, deploys the Worker, and applies the D1
migrations. Then add the OpenAI secret interactively and deploy again:

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
| `AI_PROMPT_VERSION` | `poster-planner-v1` | Cache invalidation for prompt changes |
| `AI_RECIPE_CATALOG_VERSION` | `easyposter-recipes-v1` | Cache invalidation for recipes |

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
