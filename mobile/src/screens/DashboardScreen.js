import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { useApp } from '../context/AppContext';
import { fetchMetrics, fetchPing } from '../services/api';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import ArcWidget from '../components/ArcWidget';
import BarWidget from '../components/BarWidget';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function usageColor(pct) {
  if (pct >= 90) return colors.error;
  if (pct >= 75) return colors.warning;
  return colors.success;
}

export default function DashboardScreen() {
  const { sessionId, dbConfig, preferences, reconnect } = useApp();

  const [metrics, setMetrics]     = useState(null);
  const [ping,    setPing]        = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetchError, setFetchError]  = useState(null);

  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!sessionId) return;
    if (!silent) setLoading(true);
    setFetchError(null);
    try {
      const [m, p] = await Promise.all([
        fetchMetrics(sessionId, dbConfig),
        fetchPing(),
      ]);
      setMetrics(m);
      setPing(p);
      setLastUpdated(new Date());
    } catch (err) {
      if (err?.response?.status === 401) {
        // Session expired — reconnect silently and retry once
        try {
          const newId = await reconnect();
          const [m, p] = await Promise.all([
            fetchMetrics(newId, dbConfig),
            fetchPing(),
          ]);
          setMetrics(m);
          setPing(p);
          setLastUpdated(new Date());
        } catch (reconnErr) {
          setFetchError(reconnErr?.response?.data?.error || reconnErr.message);
        }
      } else {
        setFetchError(err?.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, dbConfig, reconnect]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh
  useEffect(() => {
    const interval = (preferences.refreshInterval || 30) * 1000;
    timerRef.current = setInterval(() => load(true), interval);
    return () => clearInterval(timerRef.current);
  }, [load, preferences.refreshInterval]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  if (loading && !metrics) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching metrics…</Text>
      </View>
    );
  }

  if (fetchError && !metrics) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{fetchError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const m = metrics;
  const tibia = m?.tibia;
  const sys   = m?.system;
  const mem   = m?.memory;
  const disk  = m?.disk;
  const load_ = m?.load;

  const serverStatus = tibia?.serverStatus === 'running' ? 'online' : 'offline';
  const port7171OK   = tibia?.port7171 === 'open';
  const port7172OK   = tibia?.port7172 === 'open';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Status Banner */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerTitle}>{sys?.hostname || 'Server'}</Text>
          <Text style={styles.bannerSub}>{sys?.os || ''}</Text>
        </View>
        <StatusBadge status={serverStatus} />
      </View>

      {lastUpdated && (
        <Text style={styles.lastUpdated}>
          Updated {lastUpdated.toLocaleTimeString()} · auto-refresh {preferences.refreshInterval}s
        </Text>
      )}

      {fetchError && (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>⚠️ {fetchError}</Text>
        </View>
      )}

      {/* Battery-style overview widgets */}
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>Overview</Text>
      </View>
      <ArcWidget cpu={m?.cpu} memory={mem} disk={disk} ping={ping} />
      <View style={{ height: spacing.sm }} />
      <BarWidget cpu={m?.cpu} memory={mem} disk={disk} ping={ping} />
      <View style={{ height: spacing.sm }} />

      {/* Top stats row */}
      <View style={styles.row}>
        <MetricCard
          style={styles.cardHalf}
          icon="🎮"
          label="Tibia Server"
          value={tibia?.serverStatus === 'running' ? 'Running' : 'Stopped'}
          subValue={tibia?.process ? `PID ${tibia.process.pid}` : null}
          status={tibia?.serverStatus === 'running' ? 'ok' : 'error'}
        />
        <MetricCard
          style={styles.cardHalf}
          icon="👥"
          label="Players Online"
          value={tibia?.playerCount != null ? String(tibia.playerCount) : 'N/A'}
          subValue={tibia?.activeConnections != null
            ? `${tibia.activeConnections} connections`
            : null}
          status={tibia?.playerCount != null ? 'ok' : null}
        />
      </View>

      {/* CPU & Memory */}
      <View style={styles.row}>
        <MetricCard
          style={styles.cardHalf}
          icon="🖥️"
          label="CPU Usage"
          value={m?.cpu ? `${m.cpu.usagePercent.toFixed(1)}%` : '—'}
          subValue={m?.cpu?.temperature != null
            ? `${m.cpu.temperature}°C · ${ping?.alive ? `${ping.latencyMs?.toFixed(0)}ms` : 'N/A'}`
            : `${sys?.cpuCores || '?'} cores · ${ping?.alive ? `${ping.latencyMs?.toFixed(0)}ms` : 'N/A'}`}
          progress={m?.cpu?.usagePercent}
          barColor={usageColor(m?.cpu?.usagePercent)}
        />
        <MetricCard
          style={styles.cardHalf}
          icon="💾"
          label="Memory"
          value={mem ? `${mem.usagePercent}%` : '—'}
          subValue={mem
            ? `${formatBytes(mem.usedBytes)} / ${formatBytes(mem.totalBytes)}`
            : null}
          progress={mem?.usagePercent}
          barColor={usageColor(mem?.usagePercent)}
        />
      </View>

      {/* Disk & Ping */}
      <View style={styles.row}>
        <MetricCard
          style={styles.cardHalf}
          icon="💿"
          label="Disk (/)"
          value={disk ? `${disk.usagePercent}%` : '—'}
          subValue={disk
            ? `${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`
            : null}
          progress={disk?.usagePercent}
          barColor={usageColor(disk?.usagePercent)}
        />
        <MetricCard
          style={styles.cardHalf}
          icon="📡"
          label="Latency (Ping)"
          value={ping?.alive ? `${ping.latencyMs?.toFixed(1)} ms` : (ping?.alive === false ? 'Timeout' : '—')}
          subValue={ping?.alive
            ? `min ${ping.min?.toFixed(1)} / max ${ping.max?.toFixed(1)} ms`
            : null}
          status={ping?.alive ? (ping.latencyMs < 100 ? 'ok' : 'warn') : 'error'}
        />
      </View>

      {/* Uptime & Load */}
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>System</Text>
      </View>
      <View style={styles.infoCard}>
        <InfoRow icon="⏱️" label="Uptime"    value={sys?.uptimeFormatted || '—'} />
        <InfoRow icon="📊" label="Load Avg" value={
          load_
            ? `${load_['1m']} / ${load_['5m']} / ${load_['15m']}  (1m / 5m / 15m)`
            : '—'
        } />
        <InfoRow icon="🔧" label="Kernel"   value={sys?.kernel || '—'} />
        <InfoRow icon="🖥️" label="CPU"      value={sys?.cpuModel || '—'} />
      </View>

      {/* Ports */}
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>Network Ports</Text>
      </View>
      <View style={styles.infoCard}>
        <InfoRow
          icon={port7171OK ? '✅' : '❌'}
          label="Port 7171 (Game)"
          value={tibia?.port7171 || '—'}
          valueColor={port7171OK ? colors.success : colors.error}
        />
        <InfoRow
          icon={port7172OK ? '✅' : '❌'}
          label="Port 7172 (Login)"
          value={tibia?.port7172 || '—'}
          valueColor={port7172OK ? colors.success : colors.error}
        />
        <InfoRow
          icon="🔌"
          label="Active Connections"
          value={String(tibia?.activeConnections ?? '—')}
        />
        {m?.network && (
          <InfoRow
            icon="🌐"
            label={`Network (${m.network.iface})`}
            value={`↓ ${formatBytes(m.network.rx)}  ↑ ${formatBytes(m.network.tx)}`}
          />
        )}
      </View>

      {/* Process info */}
      {tibia?.process && (
        <>
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>Tibia Process</Text>
          </View>
          <View style={styles.infoCard}>
            <InfoRow icon="🔖" label="Binary"    value={tibia.process.name} />
            <InfoRow icon="🆔" label="PID"       value={String(tibia.process.pid)} />
            <InfoRow icon="⏱️" label="Up since"  value={formatUptime(tibia.process.uptime)} />
            <InfoRow icon="🖥️" label="CPU"       value={`${tibia.process.cpu}%`} />
            <InfoRow icon="💾" label="Memory"    value={`${tibia.process.mem}%`} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function InfoRow({ icon, label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatUptime(secs) {
  const s = parseInt(secs, 10);
  if (isNaN(s)) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xxl },

  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md },
  errorIcon: { fontSize: 48, marginBottom: spacing.md },
  errorText: { color: colors.error, textAlign: 'center', marginBottom: spacing.lg },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.md },
  retryText: { color: colors.background, fontWeight: typography.weight.bold },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerLeft: { flex: 1 },
  bannerTitle: { fontSize: typography.size.lg, color: colors.text, fontWeight: typography.weight.bold },
  bannerSub: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },

  lastUpdated: { fontSize: typography.size.xs, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },

  inlineError: { backgroundColor: colors.errorDim, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  inlineErrorText: { color: colors.error, fontSize: typography.size.sm },

  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  cardHalf: { flex: 1 },

  sectionLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  sectionLabelText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: { fontSize: 14, marginRight: spacing.sm, width: 22 },
  infoLabel: { flex: 1, fontSize: typography.size.sm, color: colors.textSecondary },
  infoValue: { fontSize: typography.size.sm, color: colors.text, fontWeight: typography.weight.medium, textAlign: 'right', flex: 1 },
});
