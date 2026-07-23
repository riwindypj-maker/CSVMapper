// macOS 検証ホストの共通 React Native UI を定義する。
// 外部 UI 依存を持たず、ネイティブホストの起動確認に使うために存在する。
// RELEVANT FILES: index.js, __tests__/App.test.tsx, macos/CSVMapper-macos/AppDelegate.mm
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <View
      accessibilityLabel="CSV Mapper macOS検証ホスト"
      style={[
        styles.container,
        isDarkMode ? styles.darkBackground : styles.lightBackground,
      ]}
    >
      <Text
        style={[styles.title, isDarkMode ? styles.lightText : styles.darkText]}
      >
        CSV Mapper
      </Text>
      <Text
        style={[
          styles.subtitle,
          isDarkMode ? styles.lightText : styles.darkText,
        ]}
      >
        macOS 検証ホスト
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  darkBackground: {
    backgroundColor: '#171717',
  },
  darkText: {
    color: '#171717',
  },
  lightBackground: {
    backgroundColor: '#f5f5f5',
  },
  lightText: {
    color: '#f5f5f5',
  },
  subtitle: {
    fontSize: 18,
    marginTop: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
  },
});

export default App;
