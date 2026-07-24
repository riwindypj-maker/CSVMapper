// macOS ホストが共通 UI の MainScreen を起動する入口。
// MappingSession と NativeProcessingGateway を注入するために存在する。
// RELEVANT FILES: index.js, src/NativeProcessingGateway.ts, ../../packages/ui/src/screens/MainScreen.tsx

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MappingSession } from '@csvmapper/application';
import { MainScreen } from '@csvmapper/ui';

import { NativeProcessingGateway } from './src/NativeProcessingGateway';

function App() {
  const session = useMemo(() => new MappingSession(), []);
  const gateway = useMemo(() => new NativeProcessingGateway(), []);

  return (
    <View accessibilityLabel="CSV Mapper macOSホスト" style={styles.root}>
      <MainScreen session={session} gateway={gateway} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
