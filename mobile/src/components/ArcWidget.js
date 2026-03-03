import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

const ARC_SIZE = 72;
const STROKE   = 7;

/**
 * Circular arc progress ring — pure React Native, no SVG needed.
 *
 * Uses the two-semicircle clipping technique:
 *   - Right clip reveals the first 0–180° of the arc
 *   - Left clip reveals the remaining 180–360° when percent > 50
 *
 * Progress starts at 12 o'clock and goes clockwise.
 */
function CircleProgress({ percent = 0, color, size = ARC_SIZE }) {
  const half    = size / 2;
  const p       = Math.min(100, Math.max(0, percent));
  const degrees = (p / 100) * 360;

  // Right half: reveals 0 → min(degrees,180)°
  // Rotation formula: degrees_shown - 180  (range: -180 → 0)
  const rightRot = Math.min(degrees, 180) - 180;

  // Left half: reveals 180 → degrees° (only needed past 50 %)
  // Rotation formula: degrees - 360  (range: -180 → 0)
  const leftRot  = degrees - 360;

  return (
    <View style={{ width: size, height: size }}>
      {/* Background track ring */}
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: half, borderWidth: STROKE,
        borderColor: colors.border,
      }} />

      {/* Right semicircle clip */}
      <View style={{
        position: 'absolute', top: 0, right: 0,
        width: half, height: size, overflow: 'hidden',
      }}>
        <View style={{
          position: 'absolute', top: 0, left: -half,
          width: size, height: size,
          borderRadius: half, borderWidth: STROKE,
          borderColor: color,
          transform: [{ rotate: `${rightRot}deg` }],
        }} />
      </View>

      {/* Left semicircle clip — only rendered when past 50 % */}
      {degrees > 180 && (
        <View style={{
          position: 'absolute', top: 0, left: 0,
          width: half, height: size, overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', top: 0, left: 0,
            width: size, height: size,
            borderRadius: half, borderWidth: STROKE,
            borderColor: color,
            transform: [{ rotate: `${leftRot}deg` }],
          }} />
        </View>
      )}
    </View>
  );
}

function ArcTile({ icon, label, value, percent, color }) {
  return (
    <View style={styles.tile}>
      <View style={{ width: ARC_SIZE, height: ARC_SIZE }}>
        <CircleProgress percent={percent} color={color} />
        {/* Icon centred inside the ring */}
        <View style={[
          StyleSheet.absoluteFillObject,
          { alignItems: 'center', justifyContent: 'center' },
        ]}>
          <Text style={styles.arcIcon}>{icon}</Text>
        </View>
      </View>
      <Text style={[styles.tileValue, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
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
 * ArcWidget — Samsung-inspired circular arc overview.
 *
 * Props:
 *   cpu     — metrics.cpu object
 *   memory  — metrics.memory object
 *   disk    — metrics.disk object
 *   ping    — fetchPing() result { alive, latencyMs, min, max }
 */
export default function ArcWidget({ cpu, memory, disk, ping }) {
  const cpuPct  = cpu?.usagePercent    ?? 0;
  const memPct  = memory?.usagePercent ?? 0;
  const diskPct = disk?.usagePercent   ?? 0;

  // Map ping latency to 0–100 % using 200 ms as the "full" mark
  const pingPct = ping?.alive ? Math.min(100, ((ping.latencyMs ?? 0) / 200) * 100) : 0;
  const pColor  = pingColor(ping);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <ArcTile
          icon="🖥️"
          label="CPU"
          value={cpu ? `${cpuPct.toFixed(0)}%` : '—'}
          percent={cpuPct}
          color={usageColor(cpuPct)}
        />
        <ArcTile
          icon="💾"
          label="RAM"
          value={memory ? `${memPct}%` : '—'}
          percent={memPct}
          color={usageColor(memPct)}
        />
        <ArcTile
          icon="💿"
          label="Disk"
          value={disk ? `${diskPct}%` : '—'}
          percent={diskPct}
          color={usageColor(diskPct)}
        />
        <ArcTile
          icon="📡"
          label="Latency"
          value={ping?.alive ? `${ping.latencyMs?.toFixed(0)}ms` : 'N/A'}
          percent={pingPct}
          color={pColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  tile: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  arcIcon: {
    fontSize: 20,
  },
  tileValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  tileLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
