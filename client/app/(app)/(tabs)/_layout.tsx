import { Tabs } from "expo-router";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { useConversationsStore } from "@/stores/conversations.store";

export default function TabsLayout() {
  const unreadCounts = useConversationsStore((s) => s.unreadCounts);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const chatEditMode = useConversationsStore((s) => s.chatEditMode);
  const setChatEditMode = useConversationsStore((s) => s.setChatEditMode);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          height: 88,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.primary,
        },
        headerStyle: { backgroundColor: colors.primary },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: "#FFFFFF" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={26}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={26}
              color={color}
            />
          ),
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => setChatEditMode(!chatEditMode)}
              style={s.headerBtn}
            >
              <Text style={s.headerBtnText}>{chatEditMode ? "Done" : "Edit"}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={26}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  headerBtn: {
    marginLeft: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
  },
});
