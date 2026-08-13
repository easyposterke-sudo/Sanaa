# EasyPoster semantic recording format

EasyPoster recording JSON is designed for exact replay, human review, and a
future skill-building pipeline. It records semantic design changes rather than
raw mouse coordinates. Schema v3 adds the evidence needed to decide whether a
recording is a trustworthy training example; schema v2 imports are migrated in
memory without changing their replay data.

## Session envelope (v3)

```json
{
  "schemaVersion": 3,
  "id": "recording-...",
  "projectId": "project-...",
  "name": "Purple and gold 3D headline",
  "startedAt": "2026-08-13T10:44:17.860Z",
  "endedAt": "2026-08-13T10:48:39.901Z",
  "initialState": { "poster": {}, "three": {} },
  "commands": [],
  "finalState": { "poster": {}, "three": {} },
  "metadata": {
    "app": "EasyPoster",
    "format": "semantic-design-commands",
    "commandCount": 24,
    "appVersion": "0.1.0",
    "rendererVersion": "easyposter-three-webgl-v1"
  },
  "training": {
    "intent": {
      "skillType": "3d-text",
      "summary": "Create a dark-purple face with a polished gold extrusion",
      "tags": ["headline", "gold", "beveled"]
    },
    "acceptance": { "status": "accepted", "reviewedAt": "..." },
    "referenceImageIds": ["dep-reference-..."]
  },
  "dependencies": [],
  "evidence": {
    "initialCamera": {},
    "finalCamera": {},
    "exports": []
  },
  "integrity": {
    "algorithm": "sha256",
    "canonicalization": "easyposter-canonical-json-v1",
    "commandsSha256": "...",
    "finalStateSha256": "...",
    "sessionSha256": "..."
  }
}
```

The replay core is still `initialState + commands = finalState`. Training
context is additive, so it cannot alter the deterministic command sequence.

## Training context and evidence

- `training.intent` says which technique the session demonstrates and why.
- `training.acceptance` distinguishes exploration/drafts from an approved
  result. A recording is never assumed to be accepted merely because it ended.
- Reference images are canvas-reencoded as bounded WebP previews, stripping
  EXIF metadata before they enter the JSON archive.
- `dependencies` records the reference, fonts, textures, environment maps, and
  render previews needed to understand or reproduce the result.
- 3D camera pose is both part of editable state and captured with render
  evidence, including target, field of view, clipping planes, viewport,
  tone-mapping, and exposure.
- Export evidence hashes the exact exported bytes and links them to the hash of
  the poster or 3D state that produced them. An export becomes stale if that
  surface changes afterward.
- Integrity digests use recursively key-sorted JSON with array order preserved.
  The session digest omits the `integrity` object to avoid self-reference.

The embedded images are previews, not the original source files. Larger or
licensed production assets should be stored in R2 and referenced by stable URI
and SHA-256 digest.

Screen video is deliberately not embedded in v3. It is much larger and less
precise than the semantic commands; an optional video can later be stored in R2
as supplementary diagnostic evidence without becoming the training source of
truth.

## Commands and coalescing

Every command contains a stable ID and sequence, ISO timestamp and elapsed
milliseconds, surface (`poster` or `three`), category, readable label, and a
minimal mutation. Poster commands patch canvas/layers; 3D commands patch scene,
layer, material, lighting, texture, and camera state.

Successive changes to the same target within 900 ms are merged: the first
identity is retained and the latest value wins. This turns slider input and a
continuous drag into one replayable action. Real canvas changes remain separate
from layer transforms, and empty canvas patches are never synthesized.

## Validation and compatibility

Browser import validates schema bounds, command count, contiguous sequence,
unique IDs, monotonic time, dependency references, camera planes, and exact
replay against `finalState`. Cryptographic verification remains asynchronous so
normal replay APIs stay synchronous.

Cloudflare accepts legacy v1, full-editor v2, and training v3 archives. The
browser migrates v2 to v3 in memory with unknown app/renderer versions; it does
not invent references, acceptance, evidence, or hashes.
