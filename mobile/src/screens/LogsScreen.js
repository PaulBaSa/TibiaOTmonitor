import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, typography, spacing, radius } from '../theme';
import { useApp } from '../context/AppContext';
import { fetchLogFiles } from '../services/api';
import { getSocket, startLogStream, stopLogStream } from '../services/socket';
import LogViewer from '../components/LogViewer';

const MAX_LINES = 1000;

export default function LogsScreen() {
  const { sessionId } = useApp();

  const [logFiles,     setLogFiles]     = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lines,        setLines]        = useState([]);
  const [streaming,    setStreaming]     = useState(false);
  const [autoScroll,   setAutoScroll]   = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error,        setError]        = useState(null);

  const socketRef = useRef(null);

  // Load list of log files
  const loadFiles = useCallback(async () => {
    if (!sessionId) return;
    setLoadingFiles(true);
    setError(null);
    try {
      const { files } = await fetchLogFiles(sessionId);
      setLogFiles(files);
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0]);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoadingFiles(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Set up socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    const onData = ({ chunk }) => {
      const newLines = chunk.split('\n').filter((l) => l.length > 0);
      setLines((prev) => {
        const combined = [...prev, ...newLines];
        return combined.length > MAX_LINES
          ? combined.slice(combined.length - MAX_LINES)
          : combined;
      });
    };

    const onError = ({ message }) => {
      setError(message);
      setStreaming(false);
    };

    const onConnected = ({ file }) => {
      setStreaming(true);
      setError(null);
    };

    const onDisconnected = () => {
      setStreaming(false);
    };

    socket.on('log-data',         onData);
    socket.on('log-error',        onError);
    socket.on('log-connected',    onConnected);
    socket.on('log-disconnected', onDisconnected);

    return () => {
      socket.off('log-data',         onData);
      socket.off('log-error',        onError);
      socket.off('log-connected',    onConnected);
      socket.off('log-disconnected', onDisconnected);
    };
  }, []);

  const handleStart = () => {
    if (!selectedFile) return;
    setLines([]);
    startLogStream(sessionId, selectedFile, 150);
  };

  const handleStop = () => {
    stopLogStream();
    setStreaming(false);
  };

  const handleClear = () => {
    setLines([]);
  };

  // Auto-start when file changes
  useEffect(() => {
    if (selectedFile && streaming) {
      setLines([]);
      startLogStream(sessionId, selectedFile, 150);
    }
  }, [selectedFile]);

  if (loadingFiles) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading log files…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Controls */}
      <View style={styles.controls}>
        {/* File picker */}
        {logFiles.length > 0 ? (
          <View style={styles.pickerWrap}>
            <Text style={styles.pickerLabel}>Log File</Text>
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={selectedFile}
                onValueChange={(v) => setSelectedFile(v)}
                style={styles.picker}
                dropdownIconColor={colors.textSecondary}
                itemStyle={{ color: colors.text, backgroundColor: colors.surface }}
              >
                {logFiles.map((f) => (
                  <Picker.Item key={f} label={f} value={f} color={colors.text} />
                ))}
              </Picker>
            </View>
          </View>
        ) : (
          <Text style={styles.noFilesText}>No log files found in /home/tibiaOG/logs/</Text>
        )}

        {/* Action buttons */}
        <View style={styles.btnRow}>
          {!streaming ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, !selectedFile && styles.btnDisabled]}
              onPress={handleStart}
              disabled={!selectedFile}
            >
              <Text style={styles.btnTextPrimary}>▶ Stream</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleStop}>
              <Text style={styles.btnTextDanger}>⏹ Stop</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, autoScroll && styles.btnActive]}
            onPress={() => setAutoScroll((v) => !v)}
          >
            <Text style={styles.btnTextSecondary}>
              {autoScroll ? '🔒 Auto' : '🔓 Manual'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleClear}>
            <Text style={styles.btnTextSecondary}>🗑 Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.streamDot, { backgroundColor: streaming ? colors.success : colors.textMuted }]} />
          <Text style={styles.statusText}>
            {streaming ? `Streaming ${selectedFile}` : 'Not streaming'}
            {lines.length > 0 ? ` · ${lines.length} lines` : ''}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Log output */}
      <LogViewer lines={lines} autoScroll={autoScroll} maxLines={MAX_LINES} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md },

  controls: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },

  pickerLabel: { fontSize: typography.size.xs, color: colors.textSecondary, marginBottom: 4 },
  pickerWrap: {},
  pickerBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: { color: colors.text, height: 44 },

  noFilesText: { color: colors.textMuted, fontSize: typography.size.sm, textAlign: 'center', padding: spacing.sm },

  btnRow: { flexDirection: 'row', gap: spacing.sm },

  btn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnDanger:  { backgroundColor: colors.errorDim, borderColor: colors.error },
  btnSecondary: { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
  btnActive:  { borderColor: colors.primary },
  btnDisabled: { opacity: 0.5 },

  btnTextPrimary:   { color: colors.background, fontWeight: typography.weight.bold, fontSize: typography.size.sm },
  btnTextDanger:    { color: colors.error, fontWeight: typography.weight.bold, fontSize: typography.size.sm },
  btnTextSecondary: { color: colors.textSecondary, fontSize: typography.size.sm },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  streamDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: typography.size.xs, color: colors.textMuted },

  errorBanner: { backgroundColor: colors.errorDim, padding: spacing.sm },
  errorText: { color: colors.error, fontSize: typography.size.sm },
});
