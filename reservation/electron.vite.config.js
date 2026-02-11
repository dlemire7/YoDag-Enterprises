import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'playwright']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'playwright']
      }
    }
  },
  renderer: {
    plugins: [react()]
  }
})
