import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

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
    host: '0.0.0.0',
    port: 3001
  },
  build: {
    outDir: 'build'
  }
})
