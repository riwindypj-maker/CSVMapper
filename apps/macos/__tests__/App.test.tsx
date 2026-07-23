// macOS 検証ホストの共通 UI が描画できることを確認する。
// ネイティブビルド前に React コンポーネントの退行を検出するために存在する。
// RELEVANT FILES: ../App.tsx, ../package.json, ../jest.config.js
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders the validation host', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(renderer!.root.findByProps({ children: 'CSV Mapper' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ children: 'macOS 検証ホスト' }),
  ).toBeTruthy();
});
