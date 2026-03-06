import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryProvider } from "@/providers/QueryProvider";
import { SocketProvider } from "@/providers/SocketProvider";
import { useAuthStore } from "@/stores/auth.store";
import { colors } from "@/theme/colors";


function SplashGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { accessToken, isHydrated } = useAuthStore();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [complianceComplete, setComplianceComplete] = useState(false);
  const [complianceRoute, setComplianceRoute] = useState<string | null>(null);

  const rootSegment = segments[0] as string | undefined;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem("onboarding_complete"),
      AsyncStorage.getItem("age_confirmed"),
      AsyncStorage.getItem("terms_accepted_version"),
      AsyncStorage.getItem("consent_recorded"),
    ]).then(([onboarding, age, terms, consent]) => {
      setOnboardingComplete(onboarding === "true");

      if (!age) {
        setComplianceRoute("/(auth)/age-gate");
        setComplianceComplete(false);
      } else if (!terms) {
        setComplianceRoute("/(auth)/terms");
        setComplianceComplete(false);
      } else if (!consent) {
        setComplianceRoute("/(auth)/consent");
        setComplianceComplete(false);
      } else {
        setComplianceComplete(true);
        setComplianceRoute(null);
      }

      setOnboardingChecked(true);
    });
  }, [rootSegment]);

  useEffect(() => {
    if (!isHydrated || !onboardingChecked) return;

    const inAuth = rootSegment === "(auth)";

    if (!onboardingComplete && !accessToken && !inAuth) {
      router.replace("/(auth)/onboarding");
    } else if (!accessToken && !inAuth) {
      router.replace("/(auth)/splash");
    } else if (accessToken && inAuth && complianceComplete) {
      router.replace("/(app)/(tabs)");
    } else if (accessToken && !complianceComplete && complianceRoute && !inAuth) {
      router.replace(complianceRoute as any);
    }
  }, [accessToken, isHydrated, rootSegment, onboardingChecked, onboardingComplete, complianceComplete, complianceRoute]);

  return <>{children}</>;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    hydrate();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <QueryProvider>
      <SocketProvider>
        <SplashGate>
          <StatusBar style="dark" />
          <Slot />
        </SplashGate>
      </SocketProvider>
    </QueryProvider>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
