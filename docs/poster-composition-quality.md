# Creation composition quality

The September 2026 supplied before/after poster and editable project are evaluation examples, not a fixed template or instructions embedded in an asset. The corrected project uses 48% background opacity, a prominent naturally proportioned speaker, adjacent schedule/date panels, and coordinated theme decoration.

General creation policy:
- Check fitted single-portrait height using both asset dimensions and canvas dimensions. Request enlargement and reflow during visual review when it is below 52%; aim for 60–75%. Explicit small portraits, framed portraits and groups remain exempt.
- Keep date and time close enough to read as a cluster. Independent panels are compatible with proximity. Conservative geometry feedback flags gaps over 18% of normalized canvas; explicit separation requests are exempt.
- Preserve model-selected background opacity and portrait masks during canonical asset reconciliation.
- Prompt for bottom-only 15% fades when unframed lower portrait edges need blending. Do not automatically fade every image or mask faces.
- Vary theme, logistics and decoration treatments alongside headline families. Keep underlines coordinated with their tilted text and logistics upright.
- Check required facts and assets in the first draft and include any omissions in final review feedback. Size, spacing and overlap heuristics must not block rendering a content-complete draft. Send those findings into visual review of the rendered first draft. Missing facts and layout findings share one final review call. The brief remains separate from repair feedback. If the review drops required facts or introduces more layout findings, retain the first draft without another automatic call. Never apply the rejected manifest. First drafts with missing facts are explicitly marked incomplete. Network failures retain the first draft with an explicit incomplete-review notice.

These numeric thresholds are product heuristics, not universal design laws. Geometry cannot prove face visibility, contrast or optical balance; those remain visual-review responsibilities. No guarantee of aesthetic quality follows from a passing manifest check.

Research consulted:
- [Nielsen Norman Group: proximity](https://www.nngroup.com/videos/proximity-gestalt/) supports placing related information together.
- [Nielsen Norman Group: visual design principles](https://www.nngroup.com/articles/principles-visual-design/) explains scale and visual hierarchy.
- [Adobe: typography](https://www.adobe.com/creativecloud/design/discover/typography.html) emphasizes readability and reviewing typography at different sizes.

Validation includes fitted-aspect-ratio checks, preserved blending, date/time separation, and component regressions proving that review cannot trigger a third call or replace the first draft when Host is dropped. Live model output still needs an end-to-end visual check with configured credentials.


## Bounded generation and analysis payloads

Automatic creation has a shared limit of two AI requests and a 120-second deadline across generation, stock lookup, compilation and rendered review. Each AI request uses at most 90 seconds, or the remaining budget if smaller. The UI stops waiting at the deadline and preserves an already applied draft. Pending fetches receive an abort signal. This is a processing ceiling, not a promise that a model returns a usable poster in that time.

Uploads retain the existing 1536px editor working copy and receive a separate 768px WebP analysis copy. Only the small copy is sent for low-detail asset analysis. No blank-canvas image is sent to the model. Review uses one 960px rendered preview at high detail plus asset identity/dimension metadata; duplicate source image bytes are omitted. Reconstruction of an existing poster retains its previous high-detail image behavior.

Review uses a strict patch response: changed/new complete layers, removed non-image keys, optional changed canvas, and summary. The server merges these with the previous manifest and validates the result. Duplicate keys and removal or identity changes of bound images are rejected. Returning only changed layers reduces output without lowering the output-token ceiling and risking truncation.

Request deadlines cover response-body reading. Server timing logs record phase, response mode, elapsed milliseconds, image count and timeout status without logging the brief, image data or credentials. Real latency and visual quality must be measured with live generations; regression tests establish bounds and preservation behavior, not speed guarantees.
