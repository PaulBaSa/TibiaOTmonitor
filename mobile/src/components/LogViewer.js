import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme';

const LOG_LINE_PATTERNS = [
  { regex: /error|exception|critical|fatal/i,   color: colors.logError },
  { regex: /warn(?:ing)?/i,                      color: colors.logWarn  },
  { regex: /info/i,                              color: colors.logInfo  },
  { regex: /debug|trace/i,                       color: colors.logDebug },
];

function lineColor(line) {
  for (const p of LOG_LINE_PATTERNS) {
    if (p.regex.test(line)) return p.color;
  }
  return colors.logDefault;
}

/**
 * Props:
 *   lines        string[]  — array of log lines
 *   autoScroll   boolean   — whether to auto-scroll to bottom
 *   maxLines     number    — max lines to display (trims oldest)
 */
export default function LogViewer({ lines = [], autoScroll = true, maxLines = 500 }) {
  const scrollRef = useRef(null);
  const visible = lines.slice(-maxLines);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: false });
    }
  }, [lines, autoScroll]);

  if (visible.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No log output yet…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator
    >
      {visible.map((line, i) => (
        <Text key={i} style={[styles.line, { color: lineColor(line) }]} selectable>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.sm,
  },
  line: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs,
    lineHeight: 18,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.size.md,
  },
});
