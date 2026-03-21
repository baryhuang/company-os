import type { IncomingMessage, ServerResponse } from 'http'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

function serveAtlasData() {
  const dataDir = path.resolve(__dirname, '../data/reports/data')
  return {
    name: 'serve-atlas-data',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use('/data', (req: { url?: string }, res: { writeHead: Function; end: Function }, next: Function) => {
        const file = path.join(dataDir, req.url || '')
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(fs.readFileSync(file, 'utf-8'))
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveAtlasData()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/workspace-api': {
        target: 'https://workspace-endpoint.openagents.org',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/workspace-api/, ''),
        secure: true,
      },
      '/channel': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/channel/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err: Error, _req: IncomingMessage, res: ServerResponse) => {
            console.warn('[channel proxy] target unavailable:', err.message)
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Channel server unavailable' }))
            }
          })
        },
      },
    },
  },
})
