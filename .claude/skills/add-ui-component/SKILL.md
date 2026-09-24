---
name: add-ui-component
description: Bring a UI component into the project from the approved free sources (21st.dev, aceternity, uiverse, reactbits; godly for inspiration) and adapt it to the light, comfy, mobile-friendly theme.
---

# Add a UI component

Approved sources only: 21st.dev/community/components, ui.aceternity.com, uiverse.io,
reactbits.dev, godly.design (inspiration only).

1. Find the component on the source site; fetch its source (WebFetch the component page, or
   ReactBits' TS+Tailwind variant). Never invent a component and attribute it to a source.
2. Put it in `src/components/ui/<Name>.tsx`, converted to TypeScript, using `motion/react`
   for animation and Tailwind for styles.
3. Adapt to the theme tokens in `src/index.css` (cream bg, sage/peach/sky, rounded-2xl,
   soft shadows). Make it work at 375px, tap targets >= 44px, no hover-only behavior.
   Respect `prefers-reduced-motion`.
4. Add a line to `CREDITS.md`: component name, source URL, what was changed.
