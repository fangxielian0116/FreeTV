import { defineConfig, type Plugin } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { BUILTIN_SOURCES } from './src/domain/sources'
const tvBuild = process.env.FREETV_TARGET === 'tv'

// Local preview only: native requests have no browser CORS restriction.
function publicSourcePreview(): Plugin {
  const hosts = new Set([...BUILTIN_SOURCES.map(source => new URL(source.api).hostname), 'raw.githubusercontent.com', 'gh-proxy.com', 'movie.douban.com'])
  return { name: 'freetv-public-source-preview', apply: 'serve', configureServer(server) {
    server.middlewares.use('/__source/', async (request, response) => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
      response.on('close', () => controller.abort())
      try {
        const url = new URL(decodeURIComponent((request.url || '').replace(/^\//, '')))
        if (!['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname) || url.username || url.password) { response.statusCode = 403; response.end('Unsupported preview origin'); return }
        const upstream = await fetch(url, { signal: controller.signal, headers: request.headers['if-none-match'] ? { 'If-None-Match': String(request.headers['if-none-match']) } : {} })
        const content = await upstream.text(); if (content.length > 2 * 1024 * 1024) throw new Error('Source response too large')
        response.statusCode = upstream.status
        response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
        if (upstream.headers.get('etag')) response.setHeader('etag', upstream.headers.get('etag')!)
        response.end(content)
      } catch { response.statusCode = 502; response.end('Public source unavailable') }
      finally { clearTimeout(timer) }
    })
  } }
}
export default defineConfig({
  define: { __FREETV_TV__: tvBuild },
  plugins: [publicSourcePreview(), uni()],
  server: {
    watch: { ignored: ['**/.tools/**', '**/.cache/**', '**/.research/**', '**/.signing/**', '**/artifacts/**', '**/unpackage/**', '**/dist/**'] },
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.signing/**', '**/*.keystore', '**/*.jks'] },
  },
})
