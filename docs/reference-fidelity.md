# Reference reconstruction fidelity

The reference import flow now keeps a full-resolution source in browser memory and sends four overlapping detail crops alongside the working reference. Source pixels are used for asset crops; normalized boxes are converted in source space before output scaling. The original aspect ratio is the default output size, within the editor's existing size limits.

The reference provider contract supports up to 120 layers with compact fields per element type. Optional fidelity data carries explicit Bezier handles and holes, per-corner radii, multi-stop linear/radial gradients, transparency, shadows, text backgrounds, and related-layer identifiers. Measured corners bypass the legacy radius amplification. Older saved plans remain readable; schema version 14 is retained because these are optional extensions. Prompt/cache versions change to avoid reusing old analysis responses.

Users can check and correct wording before building. Uncertain transcription is flagged. Font comparison sheets can show the actual poster wording in built-in and available custom fonts. Missing fonts can still cause approximation; no font is downloaded from an arbitrary AI-supplied URL.

## Optional comparison pass

The import dialog exposes a comparison checkbox (enabled by default) and explains that it uses one additional AI request. Flat text and vector layers are rendered offscreen through the same Fabric object factory as the editor. Reference guides are excluded. This does not replace or mutate the active editor project until the completed result is applied.

The review receives the source, rendered draft, previous plan and regional error measurements. Its patch can refine or add flat vector/text layers. Existing wording, images and 3D layers are protected. The server rejects forbidden changes, and the client checks protected content again before compilation.

Both drafts are scored over identical unions of original and proposed bounds using color and edge error. Acceptance requires a mean reduction greater than 0.0005 and no individual region regression greater than 0.015. Foreground images and 3D regions are masked; intentional replacement photos may still influence scores behind text. The conservative outcome is to keep the first draft.

Review has a 90-second server request deadline, 95-second client request deadline, and 120-second overall bound. It makes at most one request and has no automatic retry. Errors, timeout or a worse comparison preserve the first draft. Font and detail preparation are optional and bounded separately.

## Compatibility and limits

- Prompt-based creation retains its existing 45-layer output contract and design/review flow.
- Uploaded speaker, logo and background choices continue through the existing replacement flow. Automatic review cannot rewrite image or 3D layer definitions.
- Single-layer edits preserve editor effects absent from legacy responses; explicit fidelity effects replace the corresponding supported effects.
- Related-layer identifiers are metadata, not a new editor grouping system.
- Pixel scores do not prove correct wording or exact font identity. The user wording check remains necessary, especially for tiny or blurred text.
- This adds no dedicated OCR engine, arbitrary-font recovery, or 3D/image reconstruction system. Visual accuracy still depends on the source, available fonts and model measurements.

## Validation

Regression coverage includes compact/legacy contracts, creation limits, protected-content patches, provider request construction, crop coordinates across source/output sizes, exact corners and curve handles, gradient opacity, text-background scaling, selected-layer effect preservation, actual Fabric rendering, regional acceptance/rejection and timeout rollback. Live model quality should be assessed on representative posters (dense schedules, rotated captions, gradients and user-replaced portraits); automated geometry tests cannot establish an exact-match rate.
