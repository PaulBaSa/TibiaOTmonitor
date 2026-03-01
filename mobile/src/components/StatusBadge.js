import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

/**
 * A small pill badge for showing status.
 * status: 'online' | 'offline' | 'warning' | 'unknown'
 */
export default function StatusBadge({ status, label }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.dot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.label, { color: cfg.text }]}>
        {label ?? cfg.label}
      </Text>
    </View>
  );
}

const STATUS_CONFIG = {
  online: {
    label: 'Online',
    bg: colors.successDim,
    dot: colors.success,
    text: colors.success,
  },
  offline: {
    label: 'Offline',
    bg: colors.errorDim,
    dot: colors.error,
    text: colors.error,
  },
  warning: {
    label: 'Warning',
    bg: colors.warningDim,
    dot: colors.warning,
    text: colors.warning,
  },
  unknown: {
    label: 'Unknown',
    bg: colors.surface,
    dot: colors.textMuted,
    text: colors.textMuted,
  },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
  },
});
