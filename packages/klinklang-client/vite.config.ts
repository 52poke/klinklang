import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '^/(api|oauth)/.*': {
        target: 'http://localhost:3001'
      }
    }
  },
  build: {
    outDir: 'build'
  }
})