// packages/ui の Babel 設定。
// Jest / Metro が TypeScript・JSX を変換するために存在する。
// RELEVANT FILES: jest.config.js, package.json
module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
