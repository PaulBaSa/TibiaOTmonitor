import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { useApp } from '../context/AppContext';
import { checkBackendHealth, connectSSH } from '../services/api';
import { setBaseURL } from '../services/api';

export default function SetupScreen({ navigation }) {
  const {
    backendURL, setBackendURL,
    sshConfig,  setSshConfig,
    dbConfig,   setDbConfig,
    saveConnectionConfig,
    loadSavedConfig,
    establishConnection,
  } = useApp();

  const [form, setForm] = useState({
    backendURL: '',
    host:       '',
    port:       '22',
    username:   '',
    password:   '',
    privateKey: '',
    dbName:     '',
    dbUser:     '',
    dbPass:     '',
  });

  const [showDbSection, setShowDbSection] = useState(false);
  const [showKeySection, setShowKeySection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  useEffect(() => {
    loadSavedConfig().then(({ backendURL: bURL, sshConfig: ssh }) => {
      if (bURL || ssh) {
        setForm((f) => ({
          ...f,
          backendURL: bURL || '',
          host:       ssh?.host       || '',
          port:       String(ssh?.port || 22),
          username:   ssh?.username   || '',
          password:   ssh?.password   || '',
          privateKey: ssh?.privateKey || '',
        }));
      }
    });
  }, []);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleConnect = async () => {
    if (!form.backendURL) return Alert.alert('Error', 'Backend URL is required');
    if (!form.host)       return Alert.alert('Error', 'SSH host is required');
    if (!form.username)   return Alert.alert('Error', 'SSH username is required');
    if (!form.password && !form.privateKey)
      return Alert.alert('Error', 'SSH password or private key is required');

    setLoading(true);
    try {
      // 1. Verify backend is reachable
      setStep('Reaching backend…');
      const bURL = form.backendURL.trim().replace(/\/$/, '');
      setBaseURL(bURL);
      await checkBackendHealth();

      // 2. Establish SSH connection
      setStep('Connecting via SSH…');
      const sshPayload = {
        host:       form.host.trim(),
        port:       parseInt(form.port, 10) || 22,
        username:   form.username.trim(),
        password:   form.password || undefined,
        privateKey: form.privateKey || undefined,
      };
      const { sessionId } = await connectSSH(sshPayload);

      // 3. Persist credentials
      setStep('Saving config…');
      const db = (form.dbName && form.dbUser)
        ? { dbName: form.dbName, dbUser: form.dbUser, dbPass: form.dbPass }
        : {};
      await saveConnectionConfig(bURL, sshPayload, db);

      // 4. Update context
      setBackendURL(bURL);
      setSshConfig(sshPayload);
      if (db.dbName) setDbConfig(db);
      establishConnection(sessionId, bURL);

      navigation.replace('Main');
    } catch (err) {
      Alert.alert('Connection Failed', err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>⚔️</Text>
          <Text style={styles.title}>Tibia OT Monitor</Text>
          <Text style={styles.subtitle}>Configure your server connection</Text>
        </View>

        {/* Backend Section */}
        <SectionHeader title="Backend Server" />
        <FieldGroup>
          <Field
            label="Backend URL"
            placeholder="http://192.168.1.100:3000"
            value={form.backendURL}
            onChangeText={(v) => update('backendURL', v)}
            autoCapitalize="none"
            keyboardType="url"
          />
        </FieldGroup>

        {/* SSH Section */}
        <SectionHeader title="SSH Connection" />
        <FieldGroup>
          <Field
            label="Host / IP"
            placeholder="your-server.com or 203.0.113.5"
            value={form.host}
            onChangeText={(v) => update('host', v)}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Field
            label="Port"
            placeholder="22"
            value={form.port}
            onChangeText={(v) => update('port', v)}
            keyboardType="number-pad"
          />
          <Field
            label="Username"
            placeholder="ubuntu"
            value={form.username}
            onChangeText={(v) => update('username', v)}
            autoCapitalize="none"
          />

          {/* Toggle between password and key auth */}
          <View style={styles.toggleRow}>
            <Toggle
              label="Password"
              active={!showKeySection}
              onPress={() => setShowKeySection(false)}
            />
            <Toggle
              label="Private Key"
              active={showKeySection}
              onPress={() => setShowKeySection(true)}
            />
          </View>

          {!showKeySection ? (
            <Field
              label="Password"
              placeholder="••••••••"
              value={form.password}
              onChangeText={(v) => update('password', v)}
              secureTextEntry
            />
          ) : (
            <Field
              label="Private Key (PEM)"
              placeholder="-----BEGIN RSA PRIVATE KEY-----..."
              value={form.privateKey}
              onChangeText={(v) => update('privateKey', v)}
              multiline
              numberOfLines={4}
              style={{ height: 100, textAlignVertical: 'top' }}
              autoCapitalize="none"
            />
          )}
        </FieldGroup>

        {/* Optional DB Section */}
        <TouchableOpacity
          style={styles.optionalHeader}
          onPress={() => setShowDbSection((v) => !v)}
        >
          <Text style={styles.optionalLabel}>
            {showDbSection ? '▼' : '▶'} Database (Optional — for player count)
          </Text>
        </TouchableOpacity>

        {showDbSection && (
          <FieldGroup>
            <Field
              label="Database Name"
              placeholder="tibia"
              value={form.dbName}
              onChangeText={(v) => update('dbName', v)}
              autoCapitalize="none"
            />
            <Field
              label="DB Username"
              placeholder="root"
              value={form.dbUser}
              onChangeText={(v) => update('dbUser', v)}
              autoCapitalize="none"
            />
            <Field
              label="DB Password"
              placeholder="••••••••"
              value={form.dbPass}
              onChangeText={(v) => update('dbPass', v)}
              secureTextEntry
            />
          </FieldGroup>
        )}

        {/* Connect Button */}
        <TouchableOpacity
          style={[styles.connectBtn, loading && styles.connectBtnDisabled]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.background} size="small" />
              <Text style={styles.connectBtnText}>{step}</Text>
            </View>
          ) : (
            <Text style={styles.connectBtnText}>Connect</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function FieldGroup({ children }) {
  return <View style={styles.fieldGroup}>{children}</View>;
}

function Field({ label, ...inputProps }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, inputProps.style]}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...inputProps}
      />
    </View>
  );
}

function Toggle({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.toggle, active && styles.toggleActive]}
      onPress={onPress}
    >
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    marginTop: spacing.xl,
  },
  logo: {
    fontSize: 52,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxl,
    color: colors.primary,
    fontWeight: typography.weight.bold,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  fieldGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  fieldWrap: {
    paddingVertical: spacing.xs,
  },
  fieldLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: typography.weight.medium,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.size.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggle: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDark + '33',
  },
  toggleText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.primary,
    fontWeight: typography.weight.bold,
  },
  optionalHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  optionalLabel: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  connectBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  connectBtnDisabled: {
    opacity: 0.7,
  },
  connectBtnText: {
    color: colors.background,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.5,
    marginLeft: spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
