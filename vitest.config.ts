import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` v testu vyhodí chybu (není to serverová komponenta);
      // prázdný modul ho zastoupí, aby šly testovat soubory, které ho mají.
      'server-only': path.resolve(__dirname, 'lib/__tests__/helpers/server-only.ts'),
    },
  },
  // tsconfig má `jsx: preserve` kvůli Nextu — vitest si JSX musí přeložit sám,
  // jinak nejde z testu importovat ani čistou funkci ležící v .tsx komponentě.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    // Staré worktree v .claude/worktrees/ nejsou v gitu, ale vitest by v nich
    // posbíral stovky testů ze starších verzí repa (a desítky padajících).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.claude/worktrees/**'],
  },
})
