import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  // The default public/ directory holds the exported public repo, which must
  // never be shipped as static assets.
  publicDir: false,
  plugins: [cloudflare()],
});
