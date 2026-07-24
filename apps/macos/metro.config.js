// React Native Metro のバンドル設定。
// file: リンクした packages の依存をホスト node_modules から解決するために存在する。
// RELEVANT FILES: package.json, ../../packages/application/package.json, ../../packages/application/src/layout/autoLayout.ts

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
  ],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    extraNodeModules: {
      // リンク先実パス解決でもホストに入れた dagre を使えるようにする。
      '@dagrejs/dagre': path.resolve(
        projectRoot,
        'node_modules/@dagrejs/dagre',
      ),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
