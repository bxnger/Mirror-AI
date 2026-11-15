# Twin visual assets: brief

Status: **not provided yet.** Until these files exist, `TwinMirror` (`src/components/twin/twin-mirror.tsx`) shows a monogram placeholder: the same letter in both frames, solid for the present and outlined for the future.

The `/twin` page checks for the files on the server (`src/app/(app)/twin/page.tsx`), so missing images are never requested. Rebuild after adding them.

## Files

| Path | Purpose |
|---|---|
| `public/twin/current-self.webp` | Current Self: grounded, known present |
| `public/twin/future-self.webp` | Future Self: the same person as an aspiration, not a prediction |

## Technical requirements

- WebP, **1200 × 1500 px** (4:5), transparent background (alpha), sRGB.
- Target ≤ 120 KB each. It is shown at up to 300 px CSS width, and `next/image` serves smaller variants.
- Subject centred, standing on the lower 20% line (the frame's horizon sits at 22% from the bottom). Leave about 10% headroom.
- Both images use **identical framing, scale and pose**, so switching reads as a change of light, not of person.

## Art direction

- 2.5D or soft 3D-rendered look: clay or matte material, subtle subsurface, no photorealistic face. Abstracted, gender-neutral, age-neutral figure or bust, or a non-figurative "identity object" (a sculpted form) if a figure is not wanted.
- **Current Self:** matte, opaque, defined edges. Cool blue rim light from below-left (≈ `#a3b9ff`), neutral key light.
- **Future Self:** the *same* form, slightly translucent or frosted, softer edges. Lavender (≈ `#c3afe4`) and apricot (≈ `#e8b98f`) rim light. No halo, no glow bloom.
- **Must not** change body shape, face, skin tone, clothing status, posture "confidence" or anything that implies one self is better, smarter or more attractive. Only lighting and material differ.
- No text, logos, UI elements or backgrounds baked in.
- Avoid: robots, stick figures, circles-as-heads, glowing orbs, purple gradient backdrops.

## Optional later

Per-user customization (choose among 3–4 neutral forms) can reuse the same paths with a suffix, for example `current-self-2.webp`. That is not needed for the MVP.
