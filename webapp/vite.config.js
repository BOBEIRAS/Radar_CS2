import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts : true,
    proxy: {
      '/cs2_webradar': {
        target: 'ws://localhost:22006',
        ws: true,
      },
    },
  },
})