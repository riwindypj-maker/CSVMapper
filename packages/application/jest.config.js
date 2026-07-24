/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  // file: 依存の @csvmapper/contracts は TS エントリのため transform 対象にする。
  transformIgnorePatterns: ['/node_modules/(?!@csvmapper/contracts/)'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  watchman: false,
};
