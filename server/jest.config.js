/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    clearMocks: true,
    // uuid@13 is ESM-only; swap in a CJS-safe stand-in so modules that import it
    // (but don't need real UUIDs for the behavior under test) can still load.
    moduleNameMapper: {
        '^uuid$': '<rootDir>/src/test-utils/uuidMock.ts',
    },
};
