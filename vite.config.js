import { defineConfig } from 'vite';

// Relative paths, so the built game works from any folder (GitHub Pages serves it under /<repo>/).
export default defineConfig({ base: './' });
