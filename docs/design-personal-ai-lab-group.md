# Personal AI lab group redesign

The follow-up [living pixel lab update](design-living-pixel-lab.md) adds the
full-height hero, persistent motion controls, and public content pages. The
measurements below describe the original redesign revision.

The landing page takes composition cues from the supplied Amoeba reference: restrained monochrome surfaces, prominent typography, dotted scientific artwork, generous spacing, and actual product previews. All artwork and copy are specific to SciML Workbench.

## Shared system

- IBM Plex Sans and IBM Plex Mono remain the self-hosted type families.
- Dark is the first-visit default. An explicit saved light/dark choice persists across the landing page, sign-in, and every workspace route.
- Neutral interaction colors are defined in `frontend/app/styles/tokens.css`. Warning, error, information and partition colors retain their semantic meaning.
- Controls use 8px corners, panels 12–16px, and the hero 20px. Focus indicators, keyboard navigation, reduced motion, and native form submission remain available.
- Design dials: variance 4/10, motion 3/10 with a single short hero entrance, landing density 3/10. Detailed research screens retain their working density.
- Existing routes, API contracts, permission controls, form field names, and research behavior are preserved.

## Product preview assets

`frontend/scripts/capture-product.mjs` captures the real Ask, Detailed request and Check data screens using the repository's synthetic research fixtures. Start the frontend dev server, then run the script from `frontend/`. Set `CHROMIUM_EXECUTABLE` if using a system browser. Captures are explicitly labelled as sample data on the landing page. No development fixture routes are exposed in production.

The original decorative hero asset was generated using the built-in image tool. Prompt: a wide monochrome, near-black background with two interlocking scientific orbital clouds made of tiny halftone dots, dark negative space for the headline, no text, logos, or UI. It is decorative, not a scientific result.

## Skill sources

The requested UI UX Pro Max and Taste frontend skills were installed before implementation. Taste guides the marketing surface; UI UX Pro Max guides accessibility and product-wide consistency. The user's supplied visual reference takes precedence over generic style defaults.

## Verification

Production build and TypeScript checks pass. Browser coverage includes the landing page and sign-in at 375, 768, 1024, and 1440 pixels in both themes, keyboard preview tabs, theme persistence across direct loads and navigation, intended-destination sign-in, sign-out, research submission, workspace loading and recovery, data audits, splits, and benchmark inspections. Research API responses are synthetic fixtures; no live model or production account is used.

Automated axe checks found no WCAG A/AA violations on the landing and sign-in pages in either theme after entrance transitions completed.

Local Lighthouse mobile run: performance 97, accessibility 100, best practices 100, SEO 100; CLS 0 and total blocking time 20 ms. These are local measurements, not deployed Vercel performance guarantees.

The production checks found and corrected two integration issues: bundled public images needed explicit access through the login gate, and the theme boot string needed a server-safe module to run on direct dynamic page loads. Research files and API paths retain their authentication protection.
