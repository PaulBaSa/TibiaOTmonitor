import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

/**
 * A single horizontal-bar row — icon · label · value + bar.
 */
function BarRow({ icon, label, value, percent, color }) {
  const p = Math.min(100, Math.max(0, percent || 0));

  return (
    <View style={styles.row}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.value, { color }]}>{value ?? '—'}</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${p}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

function usageColor(pct) {
  if (pct >= 90) return colors.error;
  if (pct >= 75) return colors.warning;
  return colors.success;
}

function pingColor(ping) {
  if (!ping?.alive) return colors.error;
  const ms = ping.latencyMs;
  if (ms < 50)  return colors.success;
  if (ms < 100) return colors.warning;
  return colors.error;
}

/**
 * BarWidget — Samsung-inspired compact horizontal-bar overview.
 *
 * Props:
 *   cpu     — metrics.cpu object
 *   memory  — metrics.memory object
 *   disk    — metrics.disk object
 *   ping    — fetchPing() result { alive, latencyMs, min, max }
 */
export default function BarWidget({ cpu, memory, disk, ping }) {
  // Map ping latency to 0–100 % using 200 ms as the "full" mark
  const pingPct = ping?.alive ? Math.min(100, ((ping.latencyMs ?? 0) / 200) * 100) : 0;
  const pColor  = pingColor(ping);

  const pingLabel = ping?.alive
    ? `${ping.latencyMs?.toFixed(1)} ms`
    : 'Timeout';

  const pingSubLabel = ping?.alive && ping.min != null
    ? `  ↓${ping.min.toFixed(0)} ↑${ping.max.toFixed(0)} ms`
    : '';

  return (
    <View style={styles.card}>
      <BarRow
        icon="🖥️"
        label="CPU"
        value={cpu ? `${cpu.usagePercent.toFixed(1)}%` : '—'}
        percent={cpu?.usagePercent}
        color={usageColor(cpu?.usagePercent ?? 0)}
      />
      <View style={styles.divider} />
      <BarRow
        icon="💾"
        label="RAM"
        value={memory ? `${memory.usagePercent}%` : '—'}
        percent={memory?.usagePercent}
        color={usageColor(memory?.usagePercent ?? 0)}
      />
      <View style={styles.divider} />
      <BarRow
        icon="💿"
        label="Disk"
        value={disk ? `${disk.usagePercent}%` : '—'}
        percent={disk?.usagePercent}
        color={usageColor(disk?.usagePercent ?? 0)}
      />
      <View style={styles.divider} />
      <BarRow
        icon="📡"
        label={`Latency${pingSubLabel}`}
        value={pingLabel}
        percent={pingPct}
        color={pColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  barBg: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: -spacing.md,
  },
});
