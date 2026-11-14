import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The shop is served from the site root. In development, /api is proxied to the local
// API server (scripts/local/dev-api.ts); in AWS, CloudFront routes /api/* to API Gateway.
// The shop and baker names come from the deployment parameters (scripts/publish-frontend.sh).
// These local-development fallbacks also fill the %VITE_...% placeholders in index.html.
process.env.VITE_BUSINESS_NAME ||= "Example Cake Co";
process.env.VITE_BAKER_NAME ||= "Sam";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: { port: 5173, proxy: { "/api": "http://localhost:3001" } },
  build: { outDir: "dist", sourcemap: true, assetsInlineLimit: 0 },
});
