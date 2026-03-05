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
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
