import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors, typography } from '../theme';
import SetupScreen    from '../screens/SetupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import LogsScreen     from '../screens/LogsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack  = createStackNavigator();
const Tabs   = createBottomTabNavigator();

const TAB_SCREENS = [
  {
    name:      'Dashboard',
    component: DashboardScreen,
    icon:      '📊',
    title:     'Dashboard',
  },
  {
    name:      'Logs',
    component: LogsScreen,
    icon:      '📋',
    title:     'Logs',
  },
  {
    name:      'Settings',
    component: SettingsScreen,
    icon:      '⚙️',
    title:     'Settings',
  },
];

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: typography.size.xs,
          fontWeight: typography.weight.medium,
        },
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          color: colors.primary,
          fontWeight: typography.weight.bold,
          letterSpacing: 0.5,
        },
        tabBarIcon: ({ color, size }) => {
          const screen = TAB_SCREENS.find((s) => s.name === route.name);
          return <Text style={{ fontSize: size * 0.9 }}>{screen?.icon}</Text>;
        },
      })}
    >
      {TAB_SCREENS.map((s) => (
        <Tabs.Screen
          key={s.name}
          name={s.name}
          component={s.component}
          options={{ title: s.title, headerTitle: `⚔️  ${s.title}` }}
        />
      ))}
    </Tabs.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary:    colors.primary,
          background: colors.background,
          card:       colors.surface,
          text:       colors.text,
          border:     colors.border,
          notification: colors.error,
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Setup"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.primary, fontWeight: typography.weight.bold },
          headerTintColor: colors.primary,
          cardStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="Setup"
          component={SetupScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
