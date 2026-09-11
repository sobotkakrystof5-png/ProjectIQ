import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // tsconfig má `jsx: preserve` kvůli Nextu — vitest si JSX musí přeložit sám,
  // jinak nejde z testu importovat ani čistou funkci ležící v .tsx komponentě.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
  },
})
