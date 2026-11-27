# Origin of the sky and hills

The landscape in `lib/features/common/sky.dart` is drawn in code. Its shapes and
colours were traced on 2026-11-24 from a set of seven images made with Codex
image generation (1536×1024), which the home and login screens used as backdrops
until then (`assets/scene/*.jpg`, last in the tree at 1.0.27). Drawing it lets
the sun stand behind the owl, every page share one sky, and each page keep its
own horizon.

How the images were made, for new variants that should stay consistent:

1. The day image came from the geometric brief below with the "bold and
   minimal" treatment, with `assets/brand/zowl-icon.png` attached as the
   style reference. Softer painterly and paper-cut styles were rejected as not
   matching the owl's geometric look.
2. Dawn, dusk, night and the dark day were made from the series brief with the
   day image attached first and the owl icon second.
3. The dark dawn and dark dusk were made from the series brief with the light
   version of the same time attached first ("APPROVED backdrop for this time of
   day in the LIGHT theme").

Night is shared by both themes. The moon is drawn full instead of as a crescent,
so the ink owl stands out in front of it. `test/sky_test.dart` checks the text
contrast of every palette.

## Geometric brief (day)

```text
Generate ONE landscape image, 1536x1024 (3:2), using your image generation tool. Do not write any code or files; just generate the image.

The attached image is the app's mascot, Zowl the owl. It is the STYLE REFERENCE only: flat geometric vector shapes built from circles, arcs and simple curves, no outlines, no gradients inside the owl, ink navy with warm amber accents, calm and mature rather than cute. Do NOT draw the owl or any bird, animal, person, foreground branch, text, logo or UI in the new image.

Purpose: the backdrop of the illustrated header at the top of a personal-finance mobile app. The app draws the owl perched on a flat brown branch ON TOP of this image, at the lower right, so the landscape must look like it belongs to the same flat geometric world as the owl.

Composition (important):
- Horizon about 70% down from the top. Everything above is sky.
- The LEFT two-thirds of the sky must stay calm, open and low in detail: a heading and a line of text are laid over it.
- Put the sun (or moon) in the upper right area, roughly 65-75% across and 20-30% down.
- Below the horizon: a few layers of hills receding into the distance; small details (trees, a field pattern) belong mostly in the middle and right. The bottom 10% will be hidden behind a card, so keep it plain there.
- The image is cropped to aspect ratios from 16:9 to 4:3; keep everything important away from the outer edges.
- Restrained palette of 6-8 colours, harmonious with the owl's ink navy and amber. No pure black, no outlines, no photographic detail, no brush strokes.

Time of day: clear late-morning DAY. Soft sky blue at the top easing to a pale mint near the horizon, a pale-gold sun, fresh greens on the hills, distant hills pale blue-green.

Geometric treatment: bold and minimal. Very few large shapes: a big flat sun circle, three or four large hill arcs in stepped tones, one small group of geometric trees, a couple of capsule clouds. Lots of calm negative space; flat fills, crisp edges, subtle grain.
```

## Series brief

```text
Generate ONE landscape image, 1536x1024 (3:2), using your image generation tool. Do not write any code or files; just generate the image.

The first attached image is the APPROVED DAY backdrop for the header of a mobile app. Create the same scene for a different light, as one image of a matching set:
- Keep the composition EXACTLY: same horizon height, the same hill shapes and layers, the same group of three trees (round tree, tall pointed tree, small round tree) in the same place, the same sun position and size, the same field stripes, the same plain band along the bottom.
- Keep the same style: bold minimal geometric shapes, flat fills, crisp edges, a very subtle print grain, no outlines, no brush strokes, no gradients except the soft sky gradient.
- Only the lighting, the palette and the sky details change as described below.
- The left two-thirds of the sky must stay calm and empty: a heading and a line of text are laid over it.
- The second attached image is the app's owl mascot, for palette harmony only. Do NOT draw any owl, bird, animal, person, text or UI.
```

## dawn

```text
Light: early DAWN in a light theme. The sky goes from a soft peach-pink at the top to a pale warm cream near the horizon; it must stay light, because dark text sits on it. The sun is a soft coral-orange disc in the same place. Hills in muted sage and soft olive greens warmed by the morning light, distant hills pale lilac-grey. The two small clouds become pale cream.
```

## dusk

```text
Light: DUSK just after sunset. The sky goes from deep violet at the top through plum to a dusty rose near the horizon; it must be dark enough at the top-left for white text. The sun becomes a large flat warm orange disc in the same place, slightly lower in tone. Hills in deep plum, aubergine and muted teal-green; the field stripes in a muted gold. Two or three tiny geometric stars (small dots) near the top right. The two clouds become muted mauve.
```

## night

```text
Light: calm NIGHT. The sky is deep navy-indigo at the top easing to a softer slate-indigo near the horizon; white text sits on it. Replace the sun with a pale cream crescent moon of about the same size in the same place. A sparse scatter of small geometric stars (tiny dots and a few small four-point stars) in the upper right half only, none in the upper left. Hills in deep navy and blue-slate layers, trees in dark teal-navy, field stripes faint. The two clouds become faint slate-blue.
```

## day-dark

```text
Light: the same sunny DAY, redrawn for a DARK-MODE app screen. Overall about half as bright as the light version, but still clearly daytime: the sky is a deep muted steel blue at the top easing to a muted teal near the horizon; white text sits on it. The sun stays a warm amber-gold disc (softer, never olive or brown). Hills in deep muted greens and teal; the tall pointed tree in deep navy-teal; field stripes in muted olive-gold. The clouds become muted blue-grey.
```

## dawn-dark

```text
Light: the same DAWN, redrawn for a DARK-MODE app screen. Overall about half as bright as the attached light version, but still clearly dawn: the sky is a deep muted plum-mauve at the top easing to a muted warm terracotta-brown near the horizon; white text sits on it. The sun stays a warm coral disc (a little softer, never brown). Hills in deep muted sage, olive and dusky lilac; field stripes in muted gold. The clouds become muted dusty rose.
```

## dusk-dark

```text
Light: the same DUSK, redrawn for a DARK-MODE app screen. A little deeper than the attached light version: the sky is a very deep violet at the top easing to a deep muted rose-plum near the horizon; white text sits on it. The sun stays a warm orange disc, slightly softer. Hills in very deep aubergine and deep teal-green; field stripes in muted gold. Keep the few tiny stars. The clouds become deep muted mauve.
```
