// react-native-svg の Jest 用スタブ。
// ネイティブブリッジなしで EdgeLayer を描画検証するために存在する。
// RELEVANT FILES: ../jest.config.js, ../src/canvas/EdgeLayer.tsx

const React = require('react');
const { View } = require('react-native');

function Svg(props) {
  return React.createElement(View, { ...props, accessibilityLabel: props.accessibilityLabel ?? 'svg' });
}

function Path(props) {
  return React.createElement(View, { ...props, testID: 'svg-path' });
}

module.exports = {
  __esModule: true,
  default: Svg,
  Svg,
  Path,
};
