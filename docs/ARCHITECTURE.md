# EasyPoster Cloudflare architecture

This repository is a core-functionality port of the original EasyPoster
frontend, not the earlier minimal greenfield editor. The complete poster and
3D rendering engines now run in the Cloudflare Vite application. The original
`Easyposter` folder remains untouched and is not a runtime dependency.

## Active runtime

| Responsibility | Implementation | Current persistence |
| --- | --- | --- |
| Poster composition | React + Fabric.js browser editor | Browser state, autosave, JSON files |
| Advanced 3D text | React + Three.js/WebGL | Editable recipe embedded with poster layer |
| HDR environments | Bundled static `.hdr` assets | Application assets |
| Local image upload | Browser FileReader/data URL | Embedded in editable poster JSON |
| PNG/SVG output | Browser renderer | Browser download |
| Application/API shell | Cloudflare Vite plugin + Worker | Worker bindings available |
| Reference planning | OpenAI Responses API through Worker | Validated plan cache in D1 |
| AI poster compilation | Trusted TypeScript recipes in browser | Editable project/layers |
| Future project metadata | D1 | API foundation retained |
| Future project/assets | R2 | API foundation retained |
| Design process recording | Browser semantic recorder | Downloadable JSON; R2 API retained |

The active routes are:

- `/#/poster` — full poster editor
- `/#/3d` — standalone full 3D text editor
- `/` — redirects to the poster editor

## Poster-to-3D data flow

1. The user opens the full 3D editor from the poster workspace.
2. Three.js renders the editable recipe: layers, geometry, materials, maps,
   lighting, environment, camera, and effects.
3. “Send to Poster” creates a transparent image layer and stores the recipe
   with that layer.
4. “Edit in 3D” restores the recipe, including texture and lighting settings.
5. Project JSON preserves both the poster composition and editable 3D data.

## Process recording

The recorder subscribes to the durable boundaries of both active Zustand
stores. Poster transactions are converted into canvas, layer, transform,
typography, path, and image commands. Three.js transactions are converted into
layer, typography, transform, material, lighting, environment, texture, decal,
and camera commands.

Rapid changes to the same target are consolidated within a short window. This
turns a drag or slider gesture into one meaningful command instead of recording
every pointer position. Each session contains exact initial state, ordered
commands, final state, timestamps, categories, and stable element/layer IDs.
Replay suppresses capture and applies the commands deterministically. Reference
previews, intent, review status, renderer dependencies, exact export hashes,
camera evidence, and archive-integrity hashes form an additive training layer.

Schema version 3 is the training/provenance envelope. Browser import migrates
version 2 in memory without changing replay data. The Worker validator accepts
prototype version 1, full-editor version 2, and training version 3 envelopes.

## Reference-to-poster boundary

The active build includes a constrained AI wizard. The browser compresses one
reference, while portraits remain client-side. The Worker requests a strict
semantic design plan and caches it in D1. A deterministic compiler—not the
model—creates every ID, text value, shape, image layer, 3D configuration, and
z-order. The initial 3D layer uses an SVG preview plus an editable WebGL recipe.

The active build still excludes an AI chat loop and arbitrary model-generated
code/SVG. Background removal is never triggered automatically by AI. The stable
action is proxied through the Worker to Remove.bg, while a separate experimental
action runs MODNet or U²-NetP entirely inside a dedicated browser worker. The
local action can be removed without changing the Worker API or stable action.
See `AI_POSTER_WORKFLOW.md`.

## Cloudflare boundary

D1/R2 routes and migrations store projects, recordings, assets, cached AI
plans, and usage counters. Local creative work does not depend on remote
Cloudflare storage. Production deployment still requires real binding IDs,
Cloudflare Access, migrations, the OpenAI secret, and environment configuration.

Large export remains a separate production concern. Very large multipliers
should ultimately use a queued Cloudflare container renderer with D1 job state
and R2 output rather than allocating multi-gigabyte canvases in the browser.

## Verification status

- Production Vite/Cloudflare Worker build passes.
- Ninety inherited unit tests pass.
- ESLint has no errors; inherited warnings remain.
- Wrangler dry-run packages the Worker and bindings successfully.
- Browser verification covers text creation, rich poster properties, 3D
  editing, bundled environments, PBR/front textures, sending a render to the
  poster, and reopening the editable 3D recipe.
- The original frontend's TypeScript errors remain in the port and are tracked
  separately from the runtime release gate.

## Known follow-up work

- Resolve inherited TypeScript errors module by module.
- Add automated browser tests and visual regression baselines for the main
  poster and 3D workflows.
- Build and validate a server-side large-export pipeline before promising
  reliable 8x output on ordinary devices.
- Finish production D1/R2 identity, lifecycle, backup, and deployment work only
  after the editor behavior is locked.
