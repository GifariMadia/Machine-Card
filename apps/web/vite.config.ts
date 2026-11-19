import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'stale-asset-and-cache-recovery',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          if (url.includes('/assets/') || url === '/' || url.includes('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }

          // Deteksi jika browser/ekstensi simulator memuat HTML cache lama yang meminta bundle JS statis
          if (url.includes('/assets/') && url.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.statusCode = 200;
            res.end(
              "console.warn('Machine Card: Memulihkan sesi otomatis dari cache lama...');\n" +
              "try { sessionStorage.clear(); } catch(e) {}\n" +
              "window.location.replace(window.location.origin + window.location.pathname + '?v=' + Date.now());"
            );
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1'],
    fs: { strict: true, deny: ['.env', '.env.*', '**/.runtime/**', '**/.audit-backups/**', '**/private/**', '**/*.{crt,pem,key,pfx}'] },
    cors: false,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('maintenance-scenarios')) return 'scenarios';
          if (id.includes('SupervisorDashboard') || id.includes('SupervisorPMPlanner')) return 'supervisor';
          if (id.includes('TechnicianDashboard')) return 'technician';
          if (id.includes('AdminDashboard')) return 'admin';
          if (id.includes('OperatorDashboard') || id.includes('OpenWorkDrawer')) return 'operator';
        },
      },
    },
  },
});
