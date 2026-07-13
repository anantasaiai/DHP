/**
 * Shared ESLint base config for all SlotQ TypeScript packages.
 * Each package extends this and adds its own overrides.
 *
 * §3A.3 enforcement: dependency-cruiser (Node) enforces that domain/** and
 * application/** never import from infrastructure, @nestjs/*, prisma, or axios.
 * The eslint rules here enforce the naming + style side; dep-cruiser handles
 * the import-boundary side.
 */

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Prefer explicit return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      // No floating promises — all async calls must be awaited or handled
      '@typescript-eslint/no-floating-promises': 'error',
      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // No unused variables (catches dead code early)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
