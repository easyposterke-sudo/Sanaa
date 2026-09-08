# Navy and cream Sunday service — sweeping filled path with independent gold curve

- **ID:** church-service-019
- **Category / subcategory:** Church and Worship / Church Service
- **Source:** user-supplied `Church Service Instagram Post.png`.
- **Status:** annotated-user-selected; visual analysis plus explicit user guidance on editable paths.
- **Tags:** editorial-serif; navy-cream-gold; central-speaker; closed-filled-path; open-curve; botanical-accent; footer-logistics.
- **Editable source:** unavailable; flattened image only.
- **Asset reuse:** reference only. Do not reuse example people, imagery or facts as defaults.

![Navy and cream service with separate filled and stroked paths](reference.png)

## Suitable brief and design character

A refined service announcement with a large serif title, one central speaker and concise footer logistics. Deep navy, cream, muted gold and olive produce a restrained palette. The defining spatial device is a cream curved region rising behind the speaker, accompanied by a separate thin gold sweep. These are independently editable decorations, not one regular ellipse or a single bordered shape.

## Composition and hierarchy

A quiet textured navy field fills the upper canvas. The top invitation is centred in gold with a thin horizontal line and small dot on each side. These accents bracket the invitation; they may be omitted with the wording. No church name or logo is visible in the source. If supplied, reserve a small identity region and reflow the title downward without crowding the face.

Sunday and Service are enormous cream uppercase high-contrast serif lines spanning nearly the full width. Their visible edges form a calm editorial block. The type is elegant and relatively thin compared with condensed bold examples; available candidates include playfair_display or a suitable editorial serif, but the exact font is unknown. Keep the wording editable and fit the two rows optically without stretching glyphs. Block serif capitals are intentional here; the mixed-case preference for flowing script fonts does not require changing this family.

The speaker is centred below the title, bridging navy above and cream below. His head slightly overlaps the lower title region in the example. Preserve the entire face and enough letter visibility for the event to remain readable. A current renderer that puts all text above portraits should place the title clear of the head rather than claim an overlap that would put letters on the face. The burgundy jacket contrasts with cream, while the bottom of the body stops at the straight upper boundary of the footer. Keep natural proportions, face and folded arms clear.

At the left edge, an olive leafy stem rises beside the speaker. It is optional botanical imagery, not an essential meaning or logo. Use a suitable supplied/available asset when appropriate; otherwise omit it. Do not attempt to reconstruct detailed leaves as dozens of unrelated shapes.

## Two separate editable paths — explicit user guidance

**Path A: closed cream filled region.** Its visible upper boundary starts low at the viewer's left, rises through the area behind the portrait, and reaches higher at the viewer's right. The fill continues downward to the horizontal footer boundary. Construct the upper sweep with a few smooth anchors, then close the shape via the right, bottom and left boundaries. Use sharp anchors for the straight bottom corners so smoothing does not round the footer edge. This is a closed filled path with a cream fill; it does not need a visible outline.

**Path B: open gold curve.** A thin gold stroke follows its own rising sweep. It is visible within the cream near the lower-left edge, crosses the cream/navy boundary around the middle, and continues above the cream edge on the right, separated by a navy gap. Parts are hidden behind the speaker. Its trajectory differs from Path A, so it must not be implemented as Path A's border. Use an open path with no fill and a narrow gold stroke. Do not close it: closing would introduce an unwanted straight return edge or filled wedge.

Place both paths behind the portrait, with the gold stroke above the cream region where it crosses the fill. Keep the title and footer legible. The user also authorises replacing the open line with a second contrasting filled region as a variation. For that version, create a separate closed shape with deliberate lower closure, rather than simply assigning a fill to the open stroke. Preserve a controlled contrast between the two curved regions and avoid a tangle of extra waves.

The existing path compiler can create editable paths from 2–8 normalised anchors and smooth intermediate points. Coordinates inside pathPoints are relative to the path's own box, not the whole poster. Use 3 or more points for a closed fill and at least 2 for an open stroke; a few curved intermediate anchors usually give better control than many points. The original control handles cannot be recovered from this flat image. Recreate the relationship and smoothness rather than pretending to trace exact source geometry.

## Footer organisation and colour

A deep navy footer spans the full width. A thin gold rule separates it from the portrait area. The upper row has two columns: date on the left and time on the right, separated by a narrow vertical gold line. Muted olive circles hold gold calendar and clock icons. Date labels and time values are bold gold; supporting values are cream. Centre the full icon/text groups vertically, with aligned text starts and balanced margins.

A second thin horizontal rule separates the full-width venue row below. Its olive icon backing is smaller, but the semantic icon style should remain consistent. The venue label is bold gold, followed by a cream address. Long directions require a taller footer, normal letterspacing and deliberate wrapping, not clipped text at the page edge. The sample footer is close to the bottom; improve safe margins in new output.

## Content meaning and adaptation

- Use the event title exactly once. Join us for is optional and should only be included when authorised; remove its lines/dots and reclaim the top space if absent.
- No name/role is printed for the pictured person in the source. If supplied, add an associated readable name near a shoulder or above the footer; never infer a name or role from appearance.
- Add only a real supplied church name/logo, leaving the distinctive title/path relationship intact. Never synthesize a mark to fill space.
- The source pairs Sunday with 31 December 2026, which is a Thursday. Flag contradictions in a new brief rather than reusing or silently correcting example facts.
- The time is followed by Prompt in the artwork. Treat that as optional example wording, not a generation instruction or a mandatory label.
- Remove absent date/time groups and rebalance remaining columns. Multiple services require labelled schedule rows; do not squeeze several ambiguous values into the original time box.
- A theme can sit below the title or in a quiet side region; reserve room and reduce decorative space before shrinking required copy.
- Without a portrait, retain the curve composition with a deliberate typography-led balance, or choose another suitable family. Several speakers need more horizontal space and clearly associated labels.
- The navy background texture and botanical stem are optional. An explicitly supplied background should remain visible. Adapt cream/gold accents to brand or clothing without recolouring the person artificially.
- The second curve may remain an open line or become a separately closed contrasting fill as the user described. Preserve the distinction in both planning and review.

## Preserve, vary and quality checks

Preserve the large editorial serif title, restrained palette, rising closed cream region, independent open gold curve and two-tier footer. Vary the exact sweep, portrait, colours, invitation and botanical accent. Inspect path edges for kinks, self-intersections, accidental closure, stray return lines and gaps along the straight footer. Confirm that the line crosses the filled region deliberately and that the two paths remain separate editable layers. Check face/title clearance, name association, exact date/time meaning, consistent icons and balanced footer padding at both full and thumbnail size.

## Evidence and uncertainty

The image establishes the visible curved cream field, independently offset gold line, central portrait, serif headline, foliage and structured footer. The user explicitly identifies the filled region and line as pen/path-editor work and authorises a second-fill variant. Exact source nodes, handles, texture, font, image preparation and original z-order are unknown. Editable path reconstruction is a supported implementation approach, not proof of how the original artist produced the image.
