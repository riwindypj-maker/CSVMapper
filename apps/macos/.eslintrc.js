// macOS 検証ホストの JavaScript と TypeScript の静的解析設定を定義する。
// CMake 生成物を除外し、保守対象のソースだけを検査するために存在する。
// RELEVANT FILES: tsconfig.json, package.json, macos/build/
module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['macos/build/**'],
};
