// macOS ホストの Jest 設定。
// 共通 packages をホストの React Native 依存へ解決するために存在する。
// RELEVANT FILES: package.json, metro.config.js, __tests__/App.test.tsx
const path = require('path');

module.exports = {
  preset: 'react-native',
  watchman: false,
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': path.join(
      __dirname,
      'node_modules/@babel/runtime/$1',
    ),
    // packages/ui 配下のネストした RN を使わずホスト側を強制する。
    '^react$': path.join(__dirname, 'node_modules/react'),
    '^react-native$': path.join(__dirname, 'node_modules/react-native'),
    // ネイティブ SVG ではなく UI パッケージの Jest スタブを共有する。
    '^react-native-svg$': path.join(
      __dirname,
      '../../packages/ui/__mocks__/react-native-svg.js',
    ),
    '^react-test-renderer$': path.join(
      __dirname,
      'node_modules/react-test-renderer',
    ),
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-macos)/)',
  ],
};
