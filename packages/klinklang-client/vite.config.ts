import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '^/(api|oauth|fedi)/.*': {
        target: 'http://localhost:3000'
      }
    },
    allowedHosts: true,
    host: '0.0.0.0',
    port: 3001
  },
  build: {
    outDir: 'build'
  }
})
