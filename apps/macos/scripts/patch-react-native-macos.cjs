// React Native macOS が同梱する SocketRocket Podspec をローカル参照へ切り替える。
// CocoaPods Trunk への依存を避け、検証済みコミットから再現可能に取得するために存在する。
// RELEVANT FILES: ../package.json, ../macos/Podfile, ../macos/Podfile.lock

const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');

function replaceExact(relativePath, expected, replacement) {
  const absolutePath = path.join(appRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');

  if (source.includes(replacement)) {
    return;
  }

  if (!source.includes(expected)) {
    throw new Error(
      `${relativePath} の想定箇所が見つかりません。React Native macOS の更新内容を確認してください。`,
    );
  }

  fs.writeFileSync(absolutePath, source.replace(expected, replacement));
}

replaceExact(
  'node_modules/react-native-macos/scripts/react_native_pods.rb',
  `pod 'SocketRocket', "~> #{Helpers::Constants::socket_rocket_config[:version]}", :modular_headers => true`,
  `pod 'SocketRocket', :podspec => "#{prefix}/third-party-podspecs/SocketRocket.podspec", :modular_headers => true`,
);

replaceExact(
  'node_modules/react-native-macos/third-party-podspecs/SocketRocket.podspec',
  `s.source             = { :git => 'https://github.com/facebook/SocketRocket.git', :tag => socket_rocket_version }`,
  `s.source             = { :git => 'https://github.com/facebook/SocketRocket.git', :commit => '21ac000390781823dd4bd87fdc419976e05dd7a6' }`,
);
