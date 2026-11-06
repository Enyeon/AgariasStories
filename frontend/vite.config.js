import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // En desarrollo, /api se redirige al backend FastAPI para evitar CORS.
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:8000';

  return {
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.js'],
      setupFiles: ['tests/setup.js'],
    },
  };
});
