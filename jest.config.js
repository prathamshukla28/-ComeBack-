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
  // them as coverage grows; never lower them.
  //  - './lib/' is the logic layer (data access, streak/day math, AI prompt and
  //    memory safety, billing, offline outbox). Measured ~76/73/71/77.
  //  - Jest subtracts files matched by a path threshold from `global`, so `global`
  //    here covers only what is left — the screen/UI layer (app/, components/),
  //    which is exercised manually and is honestly near zero (~3%). Whole-codebase
  //    coverage is ~45% statements.
  coverageThreshold: {
    './lib/': { statements: 75, branches: 72, functions: 70, lines: 75 },
    global: { statements: 3, branches: 4, functions: 2, lines: 3 },
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/', '/ios/', '/android/'],
};
