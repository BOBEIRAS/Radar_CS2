import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Carregar config.json central se existir
const loadConfig = () => {
  const possiblePaths = [
    path.resolve(__dirname, '../config.json'),
    path.resolve(__dirname, 'config.json'),
    path.resolve(process.cwd(), 'config.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {}
    }
  }
  return {};
};

const config = loadConfig();
const wsPort = config?.server?.port || 22006;
const webPort = config?.server?.webPort || 5173;
const wsEndpoint = config?.server?.endpoint || '/cs2_webradar';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: webPort,
    allowedHosts: true,
    proxy: {
      [wsEndpoint]: {
        target: `ws://localhost:${wsPort}`,
        ws: true,
      },
      '/avatar': {
        target: `http://localhost:${wsPort}`,
        changeOrigin: true,
      },
    },
  },
})