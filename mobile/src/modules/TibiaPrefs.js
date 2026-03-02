/**
 * TibiaPrefs — thin JS wrapper around the TibiaPrefsModule native module.
 *
 * Used by AppContext to persist the active backendUrl + sessionId into
 * Android SharedPreferences so the home-screen widget can read them.
 *
 * On iOS (or when the native module is not yet linked) every call is a no-op,
 * so the rest of the app continues to work without changes.
 *
 * API
 *   TibiaPrefs.setValues(backendUrl, sessionId)  — call on successful connect
 *   TibiaPrefs.clearValues()                     — call on disconnect / forget
 */

import { NativeModules, Platform } from 'react-native';

const { TibiaPrefs: _native } = NativeModules;

// Only Android has the native module; provide safe no-ops for all other cases.
const TibiaPrefs =
  Platform.OS === 'android' && _native
    ? _native
    : {
        setValues:   () => {},
        clearValues: () => {},
      };

export default TibiaPrefs;
