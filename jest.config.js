/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-worklets))',
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  // Ratchet, not target: each floor sits just under the measured coverage. Raise
  // them as coverage grows; never lower them. Re-measure with `npm run test:coverage`.
  //  - './lib/' is the logic layer (data access, streak/day math, AI prompt and
  //    memory safety, billing, offline outbox, private-tab re-lock). Measured
  //    85/81/84/86 (statements/branches/functions/lines).
  //  - Jest subtracts files matched by a path threshold from `global`, so `global`
  //    here covers only what is left — the screen/UI layer (app/, components/).
  //    Component tests cover the locked private tab, the dashboard, chat safety,
  //    Pro copy and Settings; the remaining screens are exercised manually.
  //    Measured 34/32/27/36. Whole-codebase coverage is ~68% statements.
  coverageThreshold: {
    './lib/': { statements: 84, branches: 79, functions: 82, lines: 84 },
    global: { statements: 33, branches: 30, functions: 26, lines: 35 },
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/', '/ios/', '/android/'],
};
