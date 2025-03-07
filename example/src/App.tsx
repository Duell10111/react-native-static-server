import React, { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { Colors } from 'react-native/Libraries/NewAppScreen';

import { readFile, readFileAssets, unlink } from '@dr.pogodin/react-native-fs';

import { WebView } from 'react-native-webview';

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
    let server: null | Server = new Server({ fileDir, stopInBackground: true });
    const serverId = server.id;

    (async () => {
      // On Android we should extract web server assets from the application
      // package, and in many cases it is enough to do it only on the first app
      // installation and subsequent updates. In our example we'll compare
      // the content of "version" asset file with its extracted version,
      // if it exist, to deside whether we need to re-extract these assets.
      if (Platform.OS === 'android') {
        let extract = true;
        try {
          const versionD = await readFile(`${fileDir}/version`, 'utf8');
          const versionA = await readFileAssets('webroot/version', 'utf8');
          if (versionA === versionD) {
            extract = false;
          } else {
            await unlink(fileDir);
          }
        } catch {
          // A legit error happens here if assets have not been extracted
          // before, no need to react on such error, just extract assets.
        }
        if (extract) {
          console.log('Extracting web server assets...');
          await extractBundledAssets(fileDir, 'webroot');
        }
      }

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
        if (error) console.error(error);
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

  const webView = useRef<WebView>(null);

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
      <Button
        onPress={() => {
          if (webView.current) {
            // This way a text message can be sent to the WebView content,
            // assuming that content document has prepared to receive it by
            // attaching .onNativeMessage() handler to its `window` object.
            const message = 'Hello from the React Native layer!';
            const envelope = `window.onNativeMessage('${message}')`;
            webView.current.injectJavaScript(envelope);
          }
        }}
        title="Send a message to the WebView content"
      />
      <View style={styles.webview}>
        <WebView
          cacheMode="LOAD_NO_CACHE"
          // This way we can receive messages sent by the WebView content.
          onMessage={(event) => {
            const message = event.nativeEvent.data;
            Alert.alert('Got a message from the WebView content', message);
          }}
          // This way selected links displayed inside this WebView can be opened
          // in a separate system browser, instead of the WebView itself.
          // BEWARE: Currently, it does not seem working on Windows,
          // the onShouldStartLoadWithRequest() method just is not triggered
          // there when links inside WebView are pressed. However, it is worth
          // to re-test, troubleshoot, and probably fix. It works fine both
          // Android and iOS.
          onShouldStartLoadWithRequest={(request) => {
            const load = request.url.startsWith(origin);
            if (!load) {
              Linking.openURL(request.url);
            }
            return load;
          }}
          ref={webView}
          // NOTE: RN WebView requires source object to be provided with either
          // its `html` or `uri` field defined. Passing an empty string into
          // `uri` is a bad idea - on some systems, e.g. Mac Catalyst, it will
          // cause the app to open the app's resources folder in a new Finder
          // window - as we rather want to show a blank page until the server
          // is up and running, we should thus prefer to define an empty `html`
          // field in such case.
          source={origin ? { uri: origin } : { html: '' }}
        />
      </View>
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
