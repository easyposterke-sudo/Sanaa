# EasyPoster Cloudflare Core Port

This repository now runs the full EasyPoster editing engines inside the
Cloudflare application shell. The earlier proof-of-concept editor has been
replaced by the original Fabric.js poster editor and Three.js 3D text editor.
The first AI reference-to-poster workflow is now integrated behind the
Cloudflare Worker, with a no-key local fallback.

The previous proof-of-concept source is preserved under
`prototype-foundation/foundation-src` for reference. The original
`Easyposter` folder is not modified or required at runtime.

## Working core

- Fabric.js poster canvas with text, images, shapes, paths, layers, transforms,
  crop, masks, texture overlays, filters, gradients, outlines, and shadows
- Three.js multi-layer 3D text with extrusion, bevels, lighting, reflectiveness,
  bundled HDR environments, front/side textures, PBR maps, decals, and filters
- Render 3D text into a poster, reopen it in the 3D editor, and preserve its
  editable 3D recipe
- Undo/redo, canvas sizing and zoom, local uploads, and poster export
- Project JSON download/import for editable round trips
- Semantic process recording across poster and 3D changes, with reference and
  intent context, accepted-final review, camera/dependency capture, linked
  export evidence, integrity hashes, coalescing, and deterministic replay
- Reference-poster analysis with strict semantic plans, D1 caching and quotas,
  and deterministic editable poster compilation
- Cloudflare Worker, D1, and R2 APIs for projects, recordings, assets, and AI
  plan metadata

Selected poster images use the browser-side U²-NetP objects-and-products model
for free background removal. Image pixels stay on the user's device.
Unrestricted generative poster rendering remains intentionally excluded. AI
selects a constrained recipe; the editor renders all final layers locally.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for runtime boundaries and
known follow-up work.

See [docs/AI_POSTER_WORKFLOW.md](docs/AI_POSTER_WORKFLOW.md) for the implemented
reference workflow, local no-key mode, OpenAI secret setup, Cloudflare resource
creation, and production security requirements.

## Run locally

```text
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`. The root redirects to the poster editor.
The standalone 3D editor is also available at
`http://127.0.0.1:5173/#/3d`.

Local poster creation, 3D editing, uploads, JSON files, browser exports, and the
built-in AI-workflow fallback do not require an OpenAI key. Apply the local D1
migrations before testing the paid/cached planner path.

## Record a design process

1. Open the **Process recorder** at the bottom of the left sidebar.
2. Optionally open **Add reference & intent** to choose the technique, attach a
   reference poster, and describe what the session should teach.
3. Enter an optional session name, then select **Start recording**.
4. Work normally in the poster and 3D editors. Camera moves are recorded when
   orbit interaction finishes.
5. Export the poster/3D render (or use **Send to poster**) to attach exact visual
   evidence automatically, then select **Stop recording**.
6. Review the result, check **This is the accepted final result**, and use
   **Download JSON**. You can also replay it or import an older recording.

The recorder stores semantic design operations rather than raw pointer
coordinates. See [docs/RECORDING_FORMAT.md](docs/RECORDING_FORMAT.md).

## Validation

Run the release-gate checks with:

```text
npm run check
```

This runs lint, the test suite, and the production Cloudflare build. To inspect
the TypeScript projects separately, run `npm run typecheck`. GitHub Actions runs
type-checking, linting, all tests, and the production build for every pull
request and every push to `main`.

For a Worker packaging check without deploying:

```text
npx wrangler deploy --dry-run --config dist/easyposter_studio/wrangler.json
```

## Push to GitHub

This checkout is configured for:

```text
https://github.com/easyposterke-sudo/Sanaa.git
```

The default branch is `main`. Local secrets, build output, Wrangler state,
server logs, and profiling output are excluded by `.gitignore`.

## Connect the repository to Cloudflare

Cloudflare Workers Builds can deploy directly from the GitHub repository:

1. In Cloudflare, open **Workers & Pages** and select **Create application**.
2. Choose **Import a repository**, authorize GitHub, and select
   `easyposterke-sudo/Sanaa`.
3. Use `main` as the production branch and `/` as the root directory.
4. Set the build command to `npm run build`.
5. Set the deploy command to `npm run cloudflare:deploy`.
6. Name the Worker `easyposter-studio` to match `wrangler.jsonc`.

The D1 binding is pinned to the existing `easyposter-studio-db` database so
fresh Git builds reuse it instead of attempting to provision a duplicate. The
first successful deployment automatically provisions the two R2 buckets from
their binding-only declarations. The deploy script then applies every
checked-in D1 migration.

After the first deployment, add `OPENAI_API_KEY` under the Worker's
**Settings > Variables & Secrets** as an encrypted runtime secret, then trigger
another deployment. Do not add it as a GitHub secret, build variable, plain
Wrangler variable, or committed file.

To offer Pexels choices when template reconstruction detects an unsafe photo
crop, also add `PEXELS_API_KEY` as an encrypted runtime secret. This integration
is optional: without it, users can upload a clean replacement or continue with
the generated placeholder.

The selected-image **Remove background** action runs the Apache-licensed U²-NetP
objects-and-products model inside a browser worker. It does not use an API key
or spend a Remove.bg credit. The first run downloads the pinned 4.6 MB model;
the browser cache makes later runs faster.

Before enabling project/AI APIs for users, protect `/api/*` with Cloudflare
Access and make sure an unprotected `workers.dev` hostname cannot bypass that
policy. The production API trusts Cloudflare Access's authenticated email
header.

## Cloudflare storage bindings

The repository declares these bindings:

```text
D1 binding: DB -> easyposter-studio-db
R2 binding: PROJECTS
R2 binding: ASSETS
```
