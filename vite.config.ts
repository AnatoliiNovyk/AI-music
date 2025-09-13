import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    
    return {
        base: isProduction ? '/' : '/',
        plugins: [react()],
        define: {
            'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development')
        },
        server: {
            host: '127.0.0.1',
            port: 5173,
            strictPort: true,
            hmr: { clientPort: 5173 },
            headers: {
                'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:;"
            },
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false,
                    rewrite: (path) => path.replace(/^\/api/, '')
                },
                '/audio': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false
                },
                '/assets': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false
                }
            }
        },
        preview: {
            port: 3000,
            strictPort: true,
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false
                }
            }
        },
        build: {
            outDir: 'server/public',
            assetsDir: 'assets',
            emptyOutDir: true,
            sourcemap: true,
            rollupOptions: {
                output: {
                    entryFileNames: 'assets/[name]-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]',
                }
            },
            minify: isProduction ? 'esbuild' : false,
            manifest: true
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            }
        }
    };
});
