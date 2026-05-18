import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/providers/auth-context";

// ─── Custom Tab Bar ──────────────────────────────────────────────────────────

type TabBarIconConfig = {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  activeColor: string;
  inactiveColor: string;
  label: string;
};

type TabRouteName = 'index' | 'chat' | 'location' | 'my-profile';

const TAB_CONFIG: Record<TabRouteName, TabBarIconConfig> = {
  index: {
    name: 'home-variant',
    activeColor: '#ff2d78',
    inactiveColor: '#999999',
    label: 'Home',
  },
  chat: {
    name: 'chat',
    activeColor: '#ff2d78',
    inactiveColor: '#999999',
    label: 'Chat',
  },
  location: {
    name: 'radar',
    activeColor: '#ff2d78',
    inactiveColor: '#999999',
    label: 'Radar',
  },
  'my-profile': {
    name: 'account-circle',
    activeColor: '#ff2d78',
    inactiveColor: '#999999',
    label: 'Perfil',
  },
};

function TabBarIcon({
  icon,
  focused,
}: {
  icon: TabBarIconConfig;
  focused: boolean;
}) {
  const scaleRef = React.useRef(new Animated.Value(focused ? 1 : 0.85)).current;
  const opacityRef = React.useRef(
    new Animated.Value(focused ? 1 : 0.6),
  ).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleRef, {
        toValue: focused ? 1.15 : 0.85,
        tension: 130,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacityRef, {
        toValue: focused ? 1 : 0.6,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, scaleRef, opacityRef]);

  return (
    <Animated.View
      style={[
        styles.tabIconContainer,
        {
          opacity: opacityRef,
          transform: [{ scale: scaleRef }],
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon.name}
        size={28}
        color={focused ? icon.activeColor : icon.inactiveColor}
      />
    </Animated.View>
  );
}

function CustomTabBar({
  state,
  descriptors,
  navigation,
}: {
  state: any;
  descriptors: any;
  navigation: any;
}) {
  useColorScheme();

  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBar}>
        {state.routes.map((route: any) => {
          const icon = TAB_CONFIG[route.name as TabRouteName];

          if (!icon) {
            return null;
          }

          const isFocused = state.routes[state.index]?.name === route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <HapticTab
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.tabItem, isFocused && styles.tabItemActive]}
            >
              <TabBarIcon icon={icon} focused={isFocused} />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? "#ff2d78" : "#999999",
                    opacity: isFocused ? 1 : 0.6,
                  },
                ]}
              >
                {icon.label}
              </Text>
            </HapticTab>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect href="/auth" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: "Location",
        }}
      />
      <Tabs.Screen
        name="my-profile"
        options={{
          title: "Mi Perfil",
        }}
      />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBarContainer: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    paddingTop: 12,
    backgroundColor: "transparent",
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: 72,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(20px)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  tabItemActive: {
    backgroundColor: "rgba(255, 45, 120, 0.08)",
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
