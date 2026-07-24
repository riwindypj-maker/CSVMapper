// macOS ホストが MainScreen を描画できることを確認する。
// ネイティブビルド前に共通 UI 接続の退行を検出するために存在する。
// RELEVANT FILES: ../App.tsx, ../package.json, ../jest.config.js

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { labels } from '@csvmapper/ui';

import App from '../App';

test('renders the main screen regions', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const root = renderer!.root;
  expect(
    root.findAll(node => node.props.accessibilityLabel === labels.mainScreen)
      .length,
  ).toBeGreaterThan(0);
  expect(
    root.findAll(node => node.props.accessibilityLabel === labels.toolbar)
      .length,
  ).toBeGreaterThan(0);
  expect(
    root.findAll(node => node.props.accessibilityLabel === labels.canvas)
      .length,
  ).toBeGreaterThan(0);
});
