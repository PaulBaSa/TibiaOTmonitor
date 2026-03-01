import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Switch,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { useApp } from '../context/AppContext';
import { disconnectSSH } from '../services/api';
import { disconnectSocket } from '../services/socket';

const REFRESH_OPTIONS = [10, 15, 30, 60, 120];

export default function SettingsScreen({ navigation }) {
  const {
    sessionId,
    backendURL,
    sshConfig,
    dbConfig,
    preferences,
    updatePreferences,
    clearSavedConfig,
    clearConnection,
  } = useApp();

  const [refreshInterval, setRefreshInterval] = useState(preferences.refreshInterval || 30);

  const handleRefreshChange = (val) => {
    setRefreshInterval(val);
    updatePreferences({ refreshInterval: val });
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect',
      'This will close the SSH session and return you to the setup screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              if (sessionId) await disconnectSSH(sessionId);
            } catch (_) {}
            disconnectSocket();
            clearConnection();
            navigation.replace('Setup');
          },
        },
      ],
    );
  };

  const handleForget = async () => {
    Alert.alert(
      'Forget Credentials',
      'This will delete all saved connection settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            try { if (sessionId) await disconnectSSH(sessionId); } catch (_) {}
            disconnectSocket();
            clearConnection();
            await clearSavedConfig();
            navigation.replace('Setup');
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Connection info */}
      <SectionHeader title="Current Connection" />
      <View style={styles.infoCard}>
        <InfoRow label="Backend"  value={backendURL || '—'} />
        <InfoRow label="Host"     value={sshConfig?.host || '—'} />
        <InfoRow label="Port"     value={String(sshConfig?.port || 22)} />
        <InfoRow label="Username" value={sshConfig?.username || '—'} />
        <InfoRow label="Auth"     value={sshConfig?.privateKey ? 'Private Key' : 'Password'} />
        {dbConfig?.dbName && (
          <InfoRow label="Database" value={dbConfig.dbName} />
        )}
        <InfoRow label="Session"  value={sessionId ? sessionId.slice(0, 8) + '…' : 'None'} />
      </View>

      {/* Refresh interval */}
      <SectionHeader title="Auto-Refresh Interval" />
      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          {REFRESH_OPTIONS.map((val) => (
            <TouchableOpacity
              key={val}
              style={[styles.chip, refreshInterval === val && styles.chipActive]}
              onPress={() => handleRefreshChange(val)}
            >
              <Text style={[styles.chipText, refreshInterval === val && styles.chipTextActive]}>
                {val}s
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.optionHint}>
          Metrics are fetched every {refreshInterval} seconds
        </Text>
      </View>

      {/* Actions */}
      <SectionHeader title="Actions" />
      <View style={styles.actionGroup}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleDisconnect}>
          <Text style={styles.actionBtnIcon}>🔌</Text>
          <View style={styles.actionBtnText}>
            <Text style={styles.actionBtnTitle}>Disconnect</Text>
            <Text style={styles.actionBtnSub}>Close SSH session, keep saved credentials</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleForget}>
          <Text style={styles.actionBtnIcon}>🗑️</Text>
          <View style={styles.actionBtnText}>
            <Text style={[styles.actionBtnTitle, { color: colors.error }]}>Forget & Reset</Text>
            <Text style={styles.actionBtnSub}>Delete all saved credentials</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* About */}
      <SectionHeader title="About" />
      <View style={styles.infoCard}>
        <InfoRow label="App"     value="Tibia OT Monitor" />
        <InfoRow label="Version" value="1.0.0" />
        <InfoRow label="Platform" value="iOS & Android" />
      </View>
    </ScrollView>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },

  sectionHeader: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },

  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'space-between',
  },
  infoLabel: { fontSize: typography.size.sm, color: colors.textSecondary },
  infoValue: { fontSize: typography.size.sm, color: colors.text, fontWeight: typography.weight.medium, flex: 1, textAlign: 'right' },

  optionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryDark + '33' },
  chipText: { fontSize: typography.size.sm, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: typography.weight.bold },
  optionHint: { fontSize: typography.size.xs, color: colors.textMuted },

  actionGroup: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  actionBtnDanger: {},
  actionBtnIcon: { fontSize: 22 },
  actionBtnText: { flex: 1 },
  actionBtnTitle: { fontSize: typography.size.md, color: colors.text, fontWeight: typography.weight.medium },
  actionBtnSub: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
});
