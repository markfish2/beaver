import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-breaks', 'rehype-raw'],
          'vendor-lucide': ['lucide-react'],
          'vendor-axios': ['axios'],
          'vendor-excalidraw': ['@excalidraw/excalidraw'],
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['beaver.svg', 'beaver.png', 'apple-touch-icon.png', 'maskable-icon.png', 'icons/*'],
      // manifest 文件名，鸿蒙浏览器需要明确引用
      manifestFilename: 'manifest.json',
      // 🚀 核心修复：移除 manifest: false，使用内部配置
      manifest: {
        name: "Beaver",
        short_name: "Beaver",
        description: "轻量个人知识库",
        display: "standalone",
        start_url: "/",
        scope: "/",
        background_color: "#1A1B1E",
        theme_color: "#ffffff",
        color_scheme: "dark light",
        orientation: "portrait-primary",
        categories: ["productivity", "utilities"],
        lang: "zh-CN",
        icons: [
          { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
          { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
          { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
          { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        // 鸿蒙6 兼容
        prefer_related_applications: false,
        related_applications: [],
        // Web Share Target：Android 分享面板中显示 Beaver
        share_target: {
          action: "/share",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              { name: "media", accept: ["image/*", "video/*"] }
            ]
          }
        }
      },
      // 切换为 injectManifest 模式以支持自定义 Service Worker（Web Share Target）
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw-src.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}', 'icons/**/*', 'beaver.png', 'apple-touch-icon.png', 'maskable-icon.png'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    allowedHosts: ['flowy.arcbox.top'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
