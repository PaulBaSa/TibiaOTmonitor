import React, { createContext, useContext, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBaseURL } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const STORAGE_KEYS = {
  BACKEND_URL:  'tibia_backend_url',
  SESSION_ID:   'tibia_session_id',     // read by Android home-screen widget
  DB_PARAMS:    'tibia_widget_db_params', // DB query params for widget (plain JSON)
  SSH_CONFIG:   'tibia_ssh_config',     // stored in SecureStore (encrypted)
  DB_CONFIG:    'tibia_db_config',      // stored in SecureStore (encrypted)
  PREFERENCES:  'tibia_preferences',
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [sessionId,   setSessionId]   = useState(null);
  const [backendURL,  setBackendURL]   = useState('');
  const [sshConfig,   setSshConfig]    = useState(null);
  const [dbConfig,    setDbConfig]     = useState({});
  const [preferences, setPreferences]  = useState({ refreshInterval: 30 });
  const [isLoading,   setIsLoading]    = useState(false);
  const [error,       setError]        = useState(null);

  const saveConnectionConfig = useCallback(async (bURL, ssh, db) => {
    await AsyncStorage.setItem(STORAGE_KEYS.BACKEND_URL, bURL);
    await SecureStore.setItemAsync(STORAGE_KEYS.SSH_CONFIG, JSON.stringify(ssh));
    if (db && Object.keys(db).length > 0) {
      await SecureStore.setItemAsync(STORAGE_KEYS.DB_CONFIG, JSON.stringify(db));
      // Also persist DB params in plain AsyncStorage so the home-screen widget
      // can append them to the metrics URL (SecureStore is inaccessible from Java).
      if (db.dbName) {
        await AsyncStorage.setItem(STORAGE_KEYS.DB_PARAMS, JSON.stringify({
          dbName: db.dbName,
          dbUser: db.dbUser || '',
          dbPass: db.dbPass || '',
        }));
      }
    }
  }, []);

  const loadSavedConfig = useCallback(async () => {
    try {
      const bURL   = await AsyncStorage.getItem(STORAGE_KEYS.BACKEND_URL);
      const sshStr = await SecureStore.getItemAsync(STORAGE_KEYS.SSH_CONFIG);
      const dbStr  = await SecureStore.getItemAsync(STORAGE_KEYS.DB_CONFIG);
      const prefStr = await AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES);

      if (bURL)    setBackendURL(bURL);
      if (sshStr)  setSshConfig(JSON.parse(sshStr));
      if (dbStr)   setDbConfig(JSON.parse(dbStr));
      if (prefStr) setPreferences(JSON.parse(prefStr));

      // One-time migration: copy DB params from SecureStore → AsyncStorage so
      // the home-screen widget (Java) can read them without a native module.
      if (dbStr) {
        const already = await AsyncStorage.getItem(STORAGE_KEYS.DB_PARAMS);
        if (!already) {
          const db = JSON.parse(dbStr);
          if (db.dbName) {
            await AsyncStorage.setItem(STORAGE_KEYS.DB_PARAMS, JSON.stringify({
              dbName: db.dbName,
              dbUser: db.dbUser || '',
              dbPass: db.dbPass || '',
            }));
          }
        }
      }

      return { backendURL: bURL, sshConfig: sshStr ? JSON.parse(sshStr) : null };
    } catch (_) {
      return {};
    }
  }, []);

  const clearSavedConfig = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.BACKEND_URL);
    await AsyncStorage.removeItem(STORAGE_KEYS.DB_PARAMS);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.SSH_CONFIG);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.DB_CONFIG);
    setBackendURL('');
    setSshConfig(null);
    setDbConfig({});
  }, []);

  const updatePreferences = useCallback(async (prefs) => {
    const merged = { ...preferences, ...prefs };
    setPreferences(merged);
    await AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(merged));
  }, [preferences]);

  const establishConnection = useCallback((sid, bURL) => {
    setSessionId(sid);
    setBaseURL(bURL);
    connectSocket(bURL);
    // Persist sessionId for the Android home-screen widget.
    // The widget reads this directly from AsyncStorage's SQLite database —
    // no native module required, works on every build.
    AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, sid);
  }, []);

  const clearConnection = useCallback(() => {
    setSessionId(null);
    disconnectSocket();
    AsyncStorage.removeItem(STORAGE_KEYS.SESSION_ID);
  }, []);

  return (
    <AppContext.Provider value={{
      sessionId,
      backendURL,  setBackendURL,
      sshConfig,   setSshConfig,
      dbConfig,    setDbConfig,
      preferences,
      isLoading,   setIsLoading,
      error,       setError,
      saveConnectionConfig,
      loadSavedConfig,
      clearSavedConfig,
      updatePreferences,
      establishConnection,
      clearConnection,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
