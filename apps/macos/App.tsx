// macOS ホストが共通 UI の MainScreen を起動する入口。
// MappingSession を生成して Presentation 層へ注入するために存在する。
// RELEVANT FILES: index.js, __tests__/App.test.tsx, ../../packages/ui/src/screens/MainScreen.tsx

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MappingSession } from '@csvmapper/application';
import { MainScreen } from '@csvmapper/ui';

function App() {
  const session = useMemo(() => new MappingSession(), []);

  return (
    <View accessibilityLabel="CSV Mapper macOSホスト" style={styles.root}>
      <MainScreen session={session} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
