import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'

const apiBase =
  (process.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    define: {
      // Expose a single, centralized API base so the frontend never knows or
      // cares whether the backend is proxied locally or called directly in
      // production. In production this is baked at build time from the host
      // environment; locally it falls back to the Vite dev proxy origin.
      'import.meta.env.VITE_API_BASE': JSON.stringify(apiBase),
    },
    ...(isProduction && {
      build: {
        target: 'es2022',
        minify: 'esbuild',
      },
    } as Partial<UserConfig>),
  } as UserConfig
})
