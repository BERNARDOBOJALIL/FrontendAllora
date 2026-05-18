import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs } from "expo-router";
import React from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HapticTab } from "@/components/haptic-tab";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabBarIconConfig = {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  activeColor: string;
  inactiveColor: string;
  label: string;
};

// ─── Animated Icon ───────────────────────────────────────────────────────────

function TabBarIcon({
  icon,
  focused,
}: {
  icon: TabBarIconConfig;
  focused: boolean;
}) {
  const scaleRef = React.useRef(
    new Animated.Value(focused ? 1 : 0.9)
  ).current;

  const opacityRef = React.useRef(
    new Animated.Value(focused ? 1 : 0.7)
  ).current;

  const translateY = React.useRef(
    new Animated.Value(focused ? -2 : 0)
  ).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleRef, {
        toValue: focused ? 1.18 : 0.92,
        tension: 120,
        friction: 10,
        useNativeDriver: true,
      }),

      Animated.timing(opacityRef, {
        toValue: focused ? 1 : 0.7,
        duration: 220,
        useNativeDriver: true,
      }),

      Animated.spring(translateY, {
        toValue: focused ? -4 : 0,
        tension: 100,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, opacityRef, scaleRef, translateY]);

  return (
    <Animated.View
      style={[
        styles.iconWrapper,
        {
          opacity: opacityRef,
          transform: [
            { scale: scaleRef },
            { translateY },
          ],
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon.name}
        size={28}
        color={
          focused
            ? icon.activeColor
            : icon.inactiveColor
        }
      />
    </Animated.View>
  );
}

// ─── Custom Tab Bar ──────────────────────────────────────────────────────────

function CustomTabBar({
  state,
  navigation,
}: {
  state: any;
  descriptors: any;
  navigation: any;
}) {
  const tabIcons: TabBarIconConfig[] = [
    {
      name: "home-variant",
      activeColor: "#7c3aed",
      inactiveColor: "#6b7280",
      label: "Home",
    },
    {
      name: "compass",
      activeColor: "#06b6d4",
      inactiveColor: "#6b7280",
      label: "Explore",
    },
    {
      name: "radar",
      activeColor: "#10b981",
      inactiveColor: "#6b7280",
      label: "Radar",
    },
  ];

  return (
    <View style={styles.tabBarContainer}>
      <LinearGradient
        colors={[
          "rgba(233,213,255,0.96)",
          "rgba(186,230,253,0.96)",
          "rgba(209,250,229,0.96)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tabBar}
      >
        {state.routes.map(
          (route: any, index: number) => {
            if (index >= tabIcons.length) return null;

            const isFocused =
              state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (
                !isFocused &&
                !event.defaultPrevented
              ) {
                navigation.navigate(
                  route.name,
                  route.params
                );
              }
            };

            return (
              <HapticTab
                key={route.key}
                onPress={onPress}
                style={[
                  styles.tabItem,
                  isFocused &&
                    styles.tabItemActive,
                ]}
              >
                {/* Glow */}
                {isFocused && (
                  <View
                    style={[
                      styles.glow,
                      {
                        backgroundColor:
                          tabIcons[index]
                            .activeColor,
                      },
                    ]}
                  />
                )}

                <TabBarIcon
                  icon={tabIcons[index]}
                  focused={isFocused}
                />

                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isFocused
                        ? tabIcons[index]
                            .activeColor
                        : "#6b7280",
                      opacity: isFocused
                        ? 1
                        : 0.75,
                    },
                  ]}
                >
                  {tabIcons[index].label}
                </Text>
              </HapticTab>
            );
          }
        )}
      </LinearGradient>
    </View>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <CustomTabBar {...props} />
      )}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
        }}
      />

      <Tabs.Screen
        name="location"
        options={{
          title: "Location",
        }}
      />
    </Tabs>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
    backgroundColor: "transparent",
  },

  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",

    height: 82,

    borderRadius: 32,

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",

    overflow: "hidden",

    shadowColor: "#c084fc",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 10,
    },

    elevation: 12,
  },

  tabItem: {
    flex: 1,

    alignItems: "center",
    justifyContent: "center",

    paddingVertical: 10,
    marginHorizontal: 6,

    borderRadius: 24,

    overflow: "hidden",
  },

  tabItemActive: {
    backgroundColor:
      "rgba(255,255,255,0.32)",

    shadowColor: "#ffffff",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
  },

  glow: {
    position: "absolute",

    width: 72,
    height: 72,

    borderRadius: 999,

    opacity: 0.12,

    transform: [
      {
        scale: 1.3,
      },
    ],
  },

  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },

  tabLabel: {
    marginTop: 4,

    fontSize: 11,
    fontWeight: "700",

    letterSpacing: 0.4,
  },
});