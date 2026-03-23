import React from "react";
import { View, Text, StyleSheet, Alert, Linking, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/stores/auth.store";
import { useMatchStatus } from "@/hooks/queries/useMatchStatus";
import { TierCard } from "@/components/profile/TierCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { withdrawConsent, deleteAccount } from "@/api/compliance.api";

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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileSection}>
          <Avatar alias={user?.alias ?? "?"} size={64} />
          <Text style={styles.alias}>{user?.alias ?? "Anonymous"}</Text>
          <Text style={styles.userId}>ID: {user?.id.slice(0, 8) ?? "..."}</Text>
        </View>

        <TierCard tier={user?.tier ?? "free"} matchStatus={matchStatus} />

        <View style={styles.actions}>
          <Button
            title="View Archived"
            variant="outline"
            onPress={() => router.push("/(app)/archived")}
          />
          <Button
            title="Privacy Notice"
            variant="outline"
            onPress={() => router.push("/(auth)/privacy-notice")}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Terms of Service"
            variant="outline"
            onPress={() => router.push("/(auth)/terms")}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Complaints"
            variant="outline"
            onPress={handleComplaints}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Withdraw Data Consent"
            variant="secondary"
            onPress={handleWithdrawConsent}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Delete My Account"
            variant="danger"
            onPress={handleDeleteAccount}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Log Out"
            variant="outline"
            onPress={handleLogout}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Reset Onboarding (Dev)"
            variant="outline"
            onPress={handleResetOnboarding}
            style={{ marginTop: 12 }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 28,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
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
  userId: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  actions: {
    padding: 16,
    marginTop: 16,
  },
});
