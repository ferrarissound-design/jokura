# WORLD TREE — Special Generation Poster

A promotional / selection-screen poster for the **🌳 WORLD TREE** special-generation
landmark, drawn in jokura's blocky voxel style and matching the in-game UI theme
(dark panels, gold `#f9d342` accents, `🏗 特殊生成` selection-screen feel).

The whole scene is generated procedurally — there is **no external image**. A seeded
isometric voxel renderer builds a floating island with a towering World Tree
(fat trunk, sprawling roots over the cliffs, layered canopy), a hidden purple dungeon
gate at the base, waterfalls, a lake, in-branch village houses / shrines / lanterns,
and a small adventurer watching from a grassy ledge. The game-style UI (title frame,
Legendary Landmark lore panel, feature badges, Rare Discovery box, Generate button)
is layered on top with HTML/CSS.

## Files

- `world-tree-poster.html` — self-contained poster (canvas voxel scene + HTML/CSS UI).
- `world-tree-poster.png` — rendered 1600×1000 image.
- `render.sh` — re-renders the PNG from the HTML.

## Preview

Open `world-tree-poster.html` in any browser, or view `world-tree-poster.png`.

## Re-render the PNG

Uses the repository's bundled headless Chromium and Pillow:

```bash
bash poster/render.sh
```

This screenshots the page at 1600×1100 and crops to a clean 1600×1000 PNG.
