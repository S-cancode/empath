import React from "react";
import { View, Text, StyleSheet, Alert, Linking, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/stores/auth.store";
import { useMatchStatus } from "@/hooks/queries/useMatchStatus";
import { TierCard } from "@/components/profile/TierCard";
import { Avatar } from "@/components/ui/Avatar";
import { AppBackground } from "@/components/ui/AppBackground";
import { withdrawConsent, deleteAccount } from "@/api/compliance.api";

function SettingsRow({
  icon,
  iconColor,
  label,
  onPress,
  destructive,
  showChevron = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  showChevron?: boolean;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={[s.iconBox, { backgroundColor: iconColor + "15" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[s.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
      {showChevron && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );
}

function SectionSeparator() {
  return <View style={s.rowSep} />;
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: matchStatus } = useMatchStatus();

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/splash");
  };

  const handleWithdrawConsent = () => {
    Alert.alert(
      "Withdraw Consent",
      "This will disable the matching feature. You will no longer be able to find new matches. You can re-enable this by going through the consent process again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: async () => {
            try {
              await withdrawConsent();
              await AsyncStorage.setItem("consent_recorded", "declined");
              Alert.alert(
                "Consent Withdrawn",
                "Matching is no longer available. Any previously retained prompt data has been deleted."
              );
            } catch {
              Alert.alert("Error", "Something went wrong. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data, including your profile, conversation history, and consent records. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.prompt(
              "Confirm Deletion",
              'Type "DELETE" to permanently delete your account.',
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async (value?: string) => {
                    if (value?.trim().toUpperCase() !== "DELETE") {
                      Alert.alert("Cancelled", 'You must type "DELETE" to confirm.');
                      return;
                    }
                    try {
                      await deleteAccount();
                      await AsyncStorage.multiRemove([
                        "name_chosen",
                        "age_confirmed",
                        "terms_accepted_version",
                        "consent_recorded",
                        "onboarding_complete",
                      ]);
                      await logout();
                      Alert.alert("Account Deleted", "Your account has been deleted.");
                      router.replace("/(auth)/onboarding");
                    } catch {
                      Alert.alert("Error", "Something went wrong. Please try again.");
                    }
                  },
                },
              ],
              "plain-text",
              ""
            );
          },
        },
      ]
    );
  };

  const handleComplaints = () => {
    Linking.openURL("mailto:help@empathapp.co.uk?subject=Complaint");
  };

  return (
    <SafeAreaView style={s.container} edges={[]}>
      <AppBackground />
      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Profile Header */}
        <View style={s.profileSection}>
          <Avatar alias={user?.alias || "?"} size={64} />
          <Text style={s.alias}>{user?.alias || "Anonymous"}</Text>
        </View>

        <TierCard tier={user?.tier ?? "free"} matchStatus={matchStatus} />

        {/* Account */}
        <Text style={s.sectionHeader}>ACCOUNT</Text>
        <View style={s.section}>
          <SettingsRow icon="archive-outline" iconColor={colors.primary} label="View Archived" onPress={() => router.push("/(app)/archived")} />
          <SectionSeparator />
          <SettingsRow icon="ban-outline" iconColor="#E57373" label="Blocked Users" onPress={() => router.push("/(app)/blocked")} />
          <SectionSeparator />
          <SettingsRow icon="language-outline" iconColor="#7CB342" label="Translation" onPress={() => router.push("/(app)/translation-settings")} />
        </View>

        {/* Legal & Privacy */}
        <Text style={s.sectionHeader}>LEGAL & PRIVACY</Text>
        <View style={s.section}>
          <TouchableOpacity style={s.row} activeOpacity={0.6} onPress={() => {}}>
            <View style={[s.iconBox, { backgroundColor: colors.textTertiary + "15" }]}>
              <Ionicons name="finger-print-outline" size={20} color={colors.textTertiary} />
            </View>
            <Text style={s.rowLabel}>Your ID</Text>
            <Text style={s.rowValue}>{user?.id.slice(0, 8) ?? "..."}</Text>
          </TouchableOpacity>
          <SectionSeparator />
          <SettingsRow icon="shield-checkmark-outline" iconColor="#4ECDC4" label="Privacy Notice" onPress={() => router.push("/(app)/privacy-notice")} />
          <SectionSeparator />
          <SettingsRow icon="document-text-outline" iconColor="#6B7280" label="Terms of Service" onPress={() => router.push("/(app)/terms")} />
          <SectionSeparator />
          <SettingsRow icon="mail-outline" iconColor="#FF8E53" label="Complaints" onPress={handleComplaints} />
        </View>

        {/* Data & Account */}
        <Text style={s.sectionHeader}>DATA & ACCOUNT</Text>
        <View style={s.section}>
          <SettingsRow icon="hand-left-outline" iconColor={colors.warning} label="Withdraw Consent" onPress={handleWithdrawConsent} showChevron={false} />
          <SectionSeparator />
          <SettingsRow icon="trash-outline" iconColor={colors.error} label="Delete Account" onPress={handleDeleteAccount} destructive showChevron={false} />
          <SectionSeparator />
          <SettingsRow icon="log-out-outline" iconColor={colors.error} label="Log Out" onPress={handleLogout} destructive showChevron={false} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 28,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  alias: {
    ...typography.h2,
    color: colors.text,
    marginTop: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.textTertiary,
    letterSpacing: 0.5,
    marginLeft: 32,
    marginBottom: 6,
    marginTop: 24,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.text,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.textTertiary,
    marginRight: 4,
  },
  rowSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: 62,
  },
});
