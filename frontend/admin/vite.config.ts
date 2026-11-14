import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The admin portal is served from /admin/ on the same CloudFront domain as the shop.
// In development (`npm run dev:admin`) sign-in is skipped and /api goes to the local API.
// The shop and baker names come from the deployment parameters (scripts/publish-frontend.sh).
// These local-development fallbacks also fill the %VITE_...% placeholders in index.html.
process.env.VITE_BUSINESS_NAME ||= "Example Cake Co";
process.env.VITE_BAKER_NAME ||= "Sam";

export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  server: { port: 5174, proxy: { "/api": "http://localhost:3001" } },
  build: { outDir: "dist", sourcemap: true },
});
