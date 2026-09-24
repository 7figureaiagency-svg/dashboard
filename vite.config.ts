// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Hard-pin the Nitro build target to Vercel. This only takes effect
  // *outside* a Lovable build (Lovable's own pipeline always forces its own
  // Cloudflare preset regardless of this setting) — so it's safe to leave in
  // place even while still iterating inside Lovable, and it makes the
  // `vercel build` / GitHub->Vercel deploy deterministic instead of relying
  // on Nitro's env-based auto-detection.
  nitro: {
    preset: "vercel",
  },
});
