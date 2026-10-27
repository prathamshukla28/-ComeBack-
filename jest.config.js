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
  // Ratchet, not target (SPEC-GAP-009): pinned at the floor of the measured
  // coverage when it was introduced. Raise it as coverage grows; never lower it.
  coverageThreshold: {
    global: { statements: 22, branches: 21, functions: 16, lines: 22 },
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/', '/ios/', '/android/'],
};
