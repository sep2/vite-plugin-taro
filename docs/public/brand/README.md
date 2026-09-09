# VPT logo

**VPT, naturally.** The V itself is made from two growing leaves, not a solid letter decorated with foliage. Gently curved edges, soft green shading, fine branching veins, and two peach blossoms give the mark a botanical character: one flower sits at the right leaf's tip, and the smaller flower sits midway along the left leaf's outer edge. The petals have slightly different proportions and angles rather than perfect radial symmetry.

The leaf V is the first letter of the wordmark, followed by actual **Georgia Bold** P and T outlines—the font face used by the original heading's `font-weight: 600`. The glyphs are exported from Georgia Bold 5.00x-4, normalized to a 72-unit cap height, and retain the original `-0.08em` tracking. The P sits close to the leaf, and the P and T serifs meet. The canvas leaves 20 units below the letter baseline to balance the blossom above. All artwork is self-contained SVG, combining outlined lettering, vector gradients, and an SVG stamp filter. No font files, external resources, raster textures, or scripts are required.

![VPT logo presentation](preview.png)

## Assets

| File | Use |
| --- | --- |
| [vpt-logo.svg](vpt-logo.svg) | Self-contained botanical wordmark with automatic light/dark colors |
| [vpt-mark.svg](vpt-mark.svg) | Standalone two-leaf V with blossoms |
| [vpt-mark-mono.svg](vpt-mark-mono.svg) | Single-color leaf silhouettes with transparent flower centers |
| [../favicon.svg](../favicon.svg) | Adaptive small-size version with two leaves and one blossom |
| [preview.html](preview.html) | Visual sheet with downloads and actual-size samples; open directly or at `/brand/preview.html` on the docs site |
| [preview.png](preview.png) | Shareable 1280 × 1120 capture of the visual sheet |

## Usage

- Use the full wordmark at **80 px wide or larger**, and the detailed standalone mark at **32 px or larger**.
- At **16–24 px**, use the favicon. It keeps the two-leaf silhouette but omits gradients, veins, flower centers, and the smaller blossom.
- Keep at least **16 units of clear space** around the visible artwork on the 128-unit mark grid.
- Preserve the proportions and transparent background. Do not stretch, rotate, or separate the leaves.
- The monochrome SVG uses a luminance mask for transparent flower centers. Set `color` when inlining it, or replace `currentColor` for a fixed-color export. A page's text color does not pass into an external SVG image.

The palette pairs green lettering `#17673d` with green leaf gradients, peach petals, and buttercream centers. Representative midtones are leaf `#58a564`, peach `#f5b098`, and buttercream `#ffefbe`. Light surfaces use `#fbfaf1`; dark surfaces use `#1b1d21` with mint lettering `#91dfa5`.

The documentation header and homepage hero load the same `vpt-logo.svg` at different sizes. The crop, colors, gradients, light/dark styles, and stamp filter all live inside the SVG; the page only sets its display size. Native SVG media queries follow the embedding page's color scheme, or the system theme when the file is opened directly. No external styles, filters, scripts, or theme-specific SVG copies are needed.
