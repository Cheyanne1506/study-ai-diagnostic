import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: "/study-ai-diagnostic/",   // ⭐ IMPORTANT
  plugins: [react()],
})
