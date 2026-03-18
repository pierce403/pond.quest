import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 8088,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Ensure Phaser is bundled correctly
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
