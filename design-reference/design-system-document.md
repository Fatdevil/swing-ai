# Design System Document: High-Tech Performance

## 1. Overview & Creative North Star

**Creative North Star: "The Kinetic Lens"**

This design system moves beyond the "static dashboard" aesthetic, evolving into a high-performance instrument. It is designed to feel like a heads-up display (HUD) for elite athletes and analysts. We reject the "boxed-in" layout of traditional apps in favor of **The Kinetic Lens**: an editorial approach where data breathes, containers float, and depth is achieved through light and transparency rather than lines.

By utilizing intentional asymmetry and high-contrast typography scales, we create a sense of forward motion. Elements should feel as though they are captured in mid-action, using overlapping layers and the "Electric Green" pulse to guide the eye through complex AI insights with surgical precision.

---

## 2. Colors & Surface Logic

The palette is rooted in the "void"—a deep, obsidian environment where the only thing that matters is the data.

### The Palette
- **Background / Surface**: `#0e0e0e` (Deep charcoal base)
- **Primary (Action)**: `primary_fixed` (#9DFF00) — Our "Electric Green." Use this to signify momentum and AI-driven confirmation.
- **Secondary (Context)**: `secondary` (#DAED63) — A muted lime for auxiliary data.
- **Error**: `error` (#FF7351) — High-visibility coral to denote performance drops or critical alerts.

### The "No-Line" Rule
Standard 1px borders are **strictly prohibited**. To define sections, use:
- **Background Shifts**: Place a `surface_container_low` card on a `surface` background.
- **Vertical Space**: Use the Spacing Scale (specifically `8` or `10`) to create clear cognitive breaks.
- **Tonal Transitions**: Use a subtle gradient from `surface_variant` to `surface_container_highest` to imply a boundary.

### Surface Hierarchy & Nesting
Think of the UI as layers of high-tech glass.
1. **Base Layer**: `surface` (#0e0e0e)
2. **Content Areas**: `surface_container` (#1a1a1a)
3. **Floating Elements/Active Cards**: `surface_container_high` (#20201f)
4. **Interaction States**: `surface_bright` (#2c2c2c)

### The "Glass & Gradient" Rule
To elevate the "Electric Green," never use it as a flat block for large areas. Apply a **linear gradient from `primary_fixed` (#9DFF00) to `primary_dim` (#93EF00) at a 135-degree angle** to give CTAs a "lit from within" energy.

---

## 3. Typography

We utilize a high-contrast pairing to balance technical data with aggressive performance branding.

- **Display & Headlines (Space Grotesk)**: This is our "Engine." It's a sleek, futuristic sans-serif with wide apertures. Use `display-lg` (3.5rem) for hero stats and `headline-md` (1.75rem) for section titles. **Design Note**: Use tighter letter-spacing (-2%) for headlines to increase the "sporty" tension.
- **Body & Labels (Inter)**: This is our "Precision." It provides maximum readability for complex AI analysis. Use `body-md` (0.875rem) for general descriptions.
- **Hierarchy via Scale**: Force a dramatic jump between `display-lg` and `body-sm`. Large numbers (e.g., "98% Accuracy") should dominate the screen, while secondary metadata stays small and tucked away.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through **Tonal Stacking**. An AI "Insight Card" should be `surface_container_low`. Inside that card, a "Action Stat" should be `surface_container_high`. This creates a natural "lift" that mimics the physical stacking of semi-opaque materials.

### Ambient Shadows
Avoid black shadows. Use a **"Tinted Glow"** for floating elements:
- **Shadow Color**: 8% opacity of `primary` (#9DFF00) for active elements.
- **Blur**: 24px - 40px for a soft, atmospheric bleed.

### Glassmorphism & Ghost Borders
For floating navigation or overlays:
- **Background**: `surface_container` at 70% opacity.
- **Backdrop Blur**: 20px.
- **Ghost Border**: If a boundary is required for legibility, use `outline_variant` at 15% opacity. This creates a "specular highlight" on the edge of the glass rather than a rigid container line.

---

## 5. Components

### Buttons
- **Primary**: `primary_fixed` background with `on_primary_fixed` text. Radius: `full`. Use a subtle 4px inner glow for a "3D glass" effect.
- **Secondary**: Ghost style. `outline_variant` (20% opacity) border with `on_surface` text. Radius: `md` (1.5rem).

### AI Data Cards
- **Container**: `surface_container` with `lg` (2rem) corner radius.
- **Header**: Use `title-sm` in `primary` color to categorize the analysis type (e.g., "VELOCITY").
- **No Dividers**: Separate "Input" and "Analysis" sections using a 16px (`4`) vertical gap and a background shift to `surface_container_high`.

### High-Contrast Data Viz
- **Charts**: Use `primary` for the main data line. Background grid lines must be `outline_variant` at 10% opacity.
- **Gauges**: Use a "Conic Gradient" from `surface_variant` to `primary` to show progress or intensity.

### Input Fields
- **State**: Surface-on-surface. Use `surface_container_lowest` for the field background.
- **Active State**: A 2px "Ghost Border" of `primary` at 40% opacity.

---

## 6. Do's and Don'ts

### ✅ Do
- Use asymmetrical margins (e.g., 24px left, 16px right) for dynamic data lists.
- Lean into `primary_fixed` (#9DFF00) for critical "AI Insights"—it should feel like a pulse of energy.
- Use `9999px` (full) rounding for chips/small buttons to contrast the `1.5rem` (md) rounding of cards.

### ❌ Don't
- Use 100% opaque borders. They kill the "High-Tech Performance" vibe.
- Use pure white (#FFFFFF) for body text. Use `on_surface_variant` (#ADAAAA) for secondary text.
- Use standard "drop shadows." If it doesn't look like it's glowing or floating in a void, it's too traditional.
