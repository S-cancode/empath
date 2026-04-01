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

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  showArrow?: boolean;
}

function SettingsRow({ icon, label, onPress, color, showArrow = true }: SettingsRowProps) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.settingsIconWrap, color ? { backgroundColor: color + "15" } : {}]}>
        <Ionicons name={icon} size={20} color={color || colors.text} />
      </View>
      <Text style={[styles.settingsLabel, color ? { color } : {}]}>{label}</Text>
      {showArrow && (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
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

  const handleResetOnboarding = async () => {
    await AsyncStorage.multiRemove([
      "onboarding_complete",
      "age_confirmed",
      "terms_accepted_version",
      "consent_recorded",
    ]);
    await logout();
    router.replace("/(auth)/onboarding");
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
                  onPress: async (value) => {
                    if (value?.trim().toUpperCase() !== "DELETE") {
                      Alert.alert("Cancelled", 'You must type "DELETE" to confirm.');
                      return;
                    }
                    try {
                      await deleteAccount();
                      await AsyncStorage.multiRemove([
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
    Linking.openURL("mailto:complaints@empath.app?subject=Complaint");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppBackground />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <Avatar alias={user?.alias ?? "?"} size={72} />
          <Text style={styles.alias}>{user?.alias ?? "Anonymous"}</Text>
          <View style={styles.idRow}>
            <Ionicons name="finger-print-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.userId}>Anonymous ID</Text>
          </View>
        </View>

        {/* Plan card */}
        <TierCard tier={user?.tier ?? "free"} matchStatus={matchStatus} />

        {/* Account section */}
        <SectionHeader title="Account" />
        <View style={styles.settingsCard}>
          <SettingsRow
            icon="archive-outline"
            label="Archived Conversations"
            onPress={() => router.push("/(app)/archived")}
          />
        </View>

        {/* Legal & Privacy section */}
        <SectionHeader title="Legal & Privacy" />
        <View style={styles.settingsCard}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Notice"
            onPress={() => router.push("/(auth)/privacy-notice")}
          />
          <View style={styles.settingsSep} />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => router.push("/(auth)/terms")}
          />
          <View style={styles.settingsSep} />
          <SettingsRow
            icon="mail-outline"
            label="Make a Complaint"
            onPress={handleComplaints}
          />
        </View>

        {/* Danger zone */}
        <SectionHeader title="Data & Account" />
        <View style={styles.settingsCard}>
          <SettingsRow
            icon="hand-left-outline"
            label="Withdraw Data Consent"
            onPress={handleWithdrawConsent}
            color={colors.warning}
            showArrow={false}
          />
          <View style={styles.settingsSep} />
          <SettingsRow
            icon="trash-outline"
            label="Delete My Account"
            onPress={handleDeleteAccount}
            color={colors.error}
            showArrow={false}
          />
        </View>

        {/* Log out */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.6}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* Dev tools — hide in production */}
        {__DEV__ && (
          <>
            <SectionHeader title="Developer" />
            <View style={styles.settingsCard}>
              <SettingsRow
                icon="refresh-outline"
                label="Reset Onboarding"
                onPress={handleResetOnboarding}
                showArrow={false}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  profileCard: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  alias: {
    ...typography.h2,
    color: colors.text,
    marginTop: 14,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  userId: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 28,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: colors.text,
  },
  settingsSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 66,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
    paddingVertical: 14,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.error,
  },
});
