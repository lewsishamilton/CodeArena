import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_ROUTES: Record<string, () => Promise<any>> = {
  'lookup': () => import('./api/lookup.js'),
  'create-order': () => import('./api/create-order.js'),
  'confirm-payment': () => import('./api/confirm-payment.js'),
  'payu-callback': () => import('./api/payu-callback.js'),
}

function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const endpoint = req.url.slice(5).split('?')[0]
        const loader = API_ROUTES[endpoint]
        if (!loader) return next()

        try {
          const mod = await loader()
          if (mod?.default) {
            let bodyStr = ''
            req.on('data', chunk => { bodyStr += chunk })
            req.on('end', async () => {
              try {
                (req as any).body = bodyStr ? JSON.parse(bodyStr) : {}
              } catch (_) {
                (req as any).body = bodyStr
              }
              ;(res as any).status = function (code: number) { this.statusCode = code; return this }
              ;(res as any).json = function (data: any) {
                this.setHeader('Content-Type', 'application/json')
                this.end(JSON.stringify(data))
              }
              try {
                await mod.default(req, res)
              } catch (err: any) {
                console.error(`Dev API error in /api/${endpoint}:`, err)
                if (!res.writableEnded) {
                  res.statusCode = err.status || 500
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: err.message || 'Internal server error' }))
                }
              }
            })
            return
          }
        } catch (err: any) {
          console.warn(`Could not load /api/${endpoint} module:`, err.message)
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
})

