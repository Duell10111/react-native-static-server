import React, {useEffect, useState} from 'react';

import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
} from 'react-native';

import {Colors} from 'react-native/Libraries/NewAppScreen';

import Server, {
  STATES,
  extractBundledAssets,
  resolveAssetsPath,
} from '@dr.pogodin/react-native-static-server';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  };

  // Once the server is ready, the origin will be set and opened by WebView.
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    const fileDir = resolveAssetsPath('webroot');

    // In our example, `server` is reset to null when the component is unmount,
    // thus signalling that server init sequence below should be aborted, if it
    // is still underway.
    let server: null | Server = new Server({fileDir, stopInBackground: true});
    const serverId = server.id;

    (async () => {
      server?.addStateListener((newState, details, error) => {
        // Depending on your use case, you may want to use such callback
        // to implement a logic which prevents other pieces of your app from
        // sending any requests to the server when it is inactive.

        // Here `newState` equals to a numeric state constant,
        // and `STATES[newState]` equals to its human-readable name,
        // because `STATES` contains both forward and backward mapping
        // between state names and corresponding numeric values.
        console.log(
          `Server #${serverId}.\n`,
          `Origin: ${server?.origin}`,
          `New state: "${STATES[newState]}".\n`,
          `Details: "${details}".`,
        );
        if (error) {
          console.error(error);
        }
      });
      const res = await server?.start();
      if (res && server) {
        setOrigin(res);
      }
    })();
    return () => {
      (async () => {
        // In our example, here is no need to wait until the shutdown completes.
        server?.stop();

        server = null;
        setOrigin('');
      })();
    };
  }, []);

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <Text style={styles.title}>React Native Static Server Example</Text>
      <Text>
        The &lt;WebView&gt; component below this text displays a sample, styled
        web page, served by HTTP server powered by the React Native Static
        Server library.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  text: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  webview: {
    borderColor: 'black',
    borderWidth: 1,
    flex: 1,
    marginTop: 12,
  },
});
