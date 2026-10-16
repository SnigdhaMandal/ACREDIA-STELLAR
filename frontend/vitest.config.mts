import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        globals: true,
        coverage: {
            reporter: ['text', 'json-summary', 'lcov'],
            reportOnFailure: true,
            thresholds: {
                lines: 55,
                functions: 55,
                branches: 55,
                statements: 55,
            },
        },
    },
});
