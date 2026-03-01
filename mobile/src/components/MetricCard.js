import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

/**
 * A card that displays a single metric with optional progress bar.
 *
 * Props:
 *   icon       string  — emoji icon
 *   label      string  — metric label
 *   value      string  — formatted value to display
 *   subValue   string  — secondary info (optional)
 *   progress   number  — 0–100, shows a progress bar when provided
 *   barColor   string  — color for the progress bar
 *   status     'ok'|'warn'|'error'|null
 */
export default function MetricCard({
  icon,
  label,
  value,
  subValue,
  progress,
  barColor,
  status,
  style,
}) {
  const barFill = barColor || statusToColor(status) || colors.primary;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>

      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value ?? '—'}
      </Text>

      {subValue != null && (
        <Text style={styles.subValue} numberOfLines={1}>
          {subValue}
        </Text>
      )}

      {progress != null && (
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: barFill },
            ]}
          />
        </View>
      )}
    </View>
  );
}

function statusToColor(status) {
  if (status === 'ok')    return colors.success;
  if (status === 'warn')  return colors.warning;
  if (status === 'error') return colors.error;
  return null;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  icon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: typography.weight.medium,
  },
  value: {
    fontSize: typography.size.xl,
    color: colors.text,
    fontWeight: typography.weight.bold,
    marginBottom: 2,
  },
  subValue: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  barBg: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
});
