# EasyPoster semantic recording format

EasyPoster recording JSON is designed for replay, analysis, and future
skill-training pipelines. It records design intent and resulting values rather
than raw mouse coordinates.

## Session envelope

```json
{
  "schemaVersion": 2,
  "id": "recording-...",
  "projectId": "project-...",
  "name": "Church event poster",
  "startedAt": "2026-07-30T10:00:00.000Z",
  "endedAt": "2026-07-30T10:04:12.000Z",
  "initialState": {
    "poster": {},
    "three": {}
  },
  "commands": [],
  "finalState": {
    "poster": {},
    "three": {}
  },
  "metadata": {
    "app": "EasyPoster",
    "format": "semantic-design-commands",
    "commandCount": 24
  }
}
```

The initial and final states make every session independently verifiable. The
ordered command list explains how the final result was created.

## Commands

Every command includes:

- Stable command ID and sequence number
- ISO timestamp and milliseconds since recording began
- Surface: `poster` or `three`
- Category and human-readable label
- A minimal mutation containing only changed values

Poster mutations can update the canvas, add or remove elements, patch one or
more elements, and change layer order. Three.js mutations can patch scene
settings, add/remove/update layers, and change 3D layer order.

Example:

```json
{
  "id": "cmd-...",
  "sequence": 4,
  "occurredAt": "2026-07-30T10:00:18.120Z",
  "elapsedMs": 18120,
  "surface": "poster",
  "category": "typography",
  "label": "Edit poster typography",
  "type": "poster.mutation",
  "mutation": {
    "updated": [
      {
        "id": "el_...",
        "elementType": "text",
        "patch": {
          "fontFamily": "Montserrat",
          "fontSize": 96,
          "charSpacing": 80
        },
        "changedFields": ["fontFamily", "fontSize", "charSpacing"]
      }
    ]
  }
}
```

## Coalescing

Successive updates to the same surface, category, and target within 900 ms are
merged. The first command identity is retained and the latest values win. This
is what converts slider input and drag gestures into compact training actions.

## Replay

Replay restores `initialState`, applies commands in sequence, and updates the
visible poster or 3D editor after each command. Recording capture is suppressed
during playback. The computed result can be compared with `finalState` for
dataset validation.

## Assets

Embedded poster data URLs are portable inside recording JSON. Browser `blob:`
URLs used by some custom 3D texture uploads are session-local; production
training archives should upload those assets to R2 and replace them with stable
asset references before long-term retention.
