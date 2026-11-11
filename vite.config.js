import { defineConfig } from 'vite';

// Playables yêu cầu đường dẫn tương đối và không gọi mạng ra ngoài:
// mọi asset được đóng gói cục bộ, model cá/đảo/thuyền sinh bằng code nên gói tải rất nhỏ.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
