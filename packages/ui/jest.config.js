// @csvmapper/ui の Jest 設定。
// React Native コンポーネントを Node 上で検証するために存在する。
// RELEVANT FILES: package.json, babel.config.js, __tests__/main-screen.test.tsx
const path = require('path');

module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: ['/node_modules/'],
  watchman: false,
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-macos|react-native-svg)/)',
  ],
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': path.join(
      __dirname,
      'node_modules/@babel/runtime/$1',
    ),
    '^react-native-svg$': path.join(
      __dirname,
      '__mocks__/react-native-svg.js',
    ),
  },
};
