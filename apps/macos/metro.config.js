// React Native Metro のバンドル設定。
// file: リンクした packages の依存をホスト node_modules から解決するために存在する。
// RELEVANT FILES: package.json, ../../packages/ui/package.json, ../../packages/application/package.json

const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [
    path.resolve(monorepoRoot, 'packages/application'),
    path.resolve(monorepoRoot, 'packages/contracts'),
    path.resolve(monorepoRoot, 'packages/ui'),
  ],
  resolver: {
    // packages/ui 配下の react を拾うと Invalid hook call になるため、階層探索を止める。
    disableHierarchicalLookup: true,
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    extraNodeModules: {
      // リンク先実パス解決でもホストに入れた依存を使えるようにする。
      '@dagrejs/dagre': path.resolve(
        projectRoot,
        'node_modules/@dagrejs/dagre',
      ),
      'react-native-svg': path.resolve(
        projectRoot,
        'node_modules/react-native-svg',
      ),
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
      'react-native-macos': path.resolve(
        projectRoot,
        'node_modules/react-native-macos',
      ),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
