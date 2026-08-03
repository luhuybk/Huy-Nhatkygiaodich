import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // If you deploy to a subpath (e.g. GitHub Pages project site),
  // set base to "/your-repo-name/". Otherwise leave as "/".
  base: "/",
});
