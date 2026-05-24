# Beija — Icon Design Spec

Detailed visual spec for the 1024×1024 master icon. Hand to a designer or feed to an AI image tool — same brief, same output.

---

## Big picture

> A bold, modern, gradient-soaked **B** that reads as romance + Brazil at a glance. Recognizable at 40 px, distinctive next to Tinder / Bumble / Hinge.

Anti-goals: photos, faces, literal kissing lips, hearts, fire emoji. Anything that could feel cheap, dated, or NSFW.

---

## Canvas

| Field | Value |
|---|---|
| Size | 1024 × 1024 px |
| Color profile | sRGB |
| Background | solid (no transparency) |
| Bleed | none — design extends edge to edge |
| Safe area | center 80% (≈ 819 × 819) — keep all glyph + ornament inside |
| Corner radius | 0 (Apple/Android round it) |

---

## Color palette

| Token | Hex | Use |
|---|---|---|
| `primary` | `#FF4D88` | top-left gradient stop, light-mode start |
| `secondary` | `#FFA07A` | bottom-right gradient stop |
| `white` | `#FFFFFF` | the letter B |
| `dark-bg` | `#1c0a2b` | dark-mode (Apple Watch) background |
| `dark-accent` | `#FF6B9D` | dark-mode B color (slightly desaturated) |

Gradient: 135° angle, `primary` at 0%, `secondary` at 100%. No mid-stops, no banding.

---

## Typography

- **Family:** Geometric sans-serif. First choice **Inter** (700 / 800). Fallbacks: Poppins, SF Pro Display.
- **Weight:** 800 (extra bold).
- **Letter:** single capital **B**.
- **Shape language:** soften the bowls of the B so the two curves feel like stylized lips when squinted at — not literal lips, just a suggestion. Round terminals, no sharp serifs.
- **Optical size:** B occupies ~60% of safe-area height (≈ 490 px tall).
- **Position:** mathematically centered on the canvas, with optical adjustment (B sits slightly above geometric center because of its bottom-heavy weight).

---

## Light mode (default)

```
┌─────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░ │  pink gradient
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ░░░░░░░░    █████░░░░░░░░░ │
│  ░░░░░░    ████████░░░░░░░░ │  B in white
│  ░░░░░░    ████   ░░░░░░░░░ │
│  ░░░░░░    ████   ░░░░░░░░░ │
│  ░░░░░░    ████████░░░░░░░░ │
│  ░░░░░░    ████   ░░░░░░░░░ │
│  ░░░░░░    ████   ░░░░░░░░░ │
│  ░░░░░░    ████████░░░░░░░░ │
│  ░░░░░░░░    █████░░░░░░░░░ │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░ │  coral gradient
└─────────────────────────────┘
```

Optional ornaments (subtle, don't overpower):
- Inner glow on the B (white 8% opacity, blur 20 px).
- Drop shadow under the B (#000 at 12% opacity, blur 32 px, y-offset 8 px).

---

## Dark mode (Apple Watch, dark display)

| Field | Value |
|---|---|
| Background | solid `#1c0a2b` |
| B color | gradient `#FF4D88` → `#FFA07A` (same gradient, inverted application) |
| Effects | no inner glow; outer glow OK |

This guarantees the icon reads on a black bezel without an opaque pink rectangle.

---

## Variants to ship

1. **Master 1024×1024** — light mode.
2. **Dark variant 1024×1024** — for Apple Watch + adaptive theming.
3. **Monochrome variant 1024×1024** — solid white on transparent (used by Apple Tinted Mode on iOS 18+, and for system notifications).

All three exported as PNG.

---

## Reference / starting points

These are templates the designer can fork, **not** finished icons:

- Figma community: search "iOS app icon template 1024" — Apple publishes one updated yearly at https://developer.apple.com/design/resources/
- Canva: search "app icon template" — picks free templates that have the right canvas + safe area
- Bezier playground for the lips-inside-B detail: any vector tool (Illustrator, Figma, Affinity). Start with the regular Inter B at 800 weight, then nudge anchor points on the two bowls outward and round them.

---

## Approval checklist

Before considering the master done:

- [ ] At 40 × 40 px the B is still recognizable
- [ ] No text other than the B
- [ ] No transparency anywhere
- [ ] Gradient has no visible banding (export at sRGB 8-bit, dither if needed)
- [ ] Dark variant readable on a #000 background
- [ ] Monochrome variant readable on both light and dark contexts
- [ ] Saved as PNG, < 250 KB for the 1024 master
- [ ] Filename: `frontend/public/icons/icon-1024.png` (light); `icon-1024-dark.png`, `icon-1024-mono.png` for variants
