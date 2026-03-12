import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // カスタム要素 (web components) をVueコンポーネントとして解釈しないよう設定
      isCustomElement: (tag) => tag.includes('-'),
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
