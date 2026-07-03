import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// spec.md §7：外部ランタイム依存ゼロ（React/Vite 以外の npm 依存を追加しない）
export default defineConfig({
  plugins: [react()],
});
