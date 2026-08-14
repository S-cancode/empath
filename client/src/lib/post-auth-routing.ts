import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Route to the next onboarding/compliance step after a successful
 * authentication, or into the app when everything is already satisfied.
 * Order: choose-name → age gate → terms → consent → app.
 * (Server-side enforcement of these is canonical; this is UX routing.)
 */
export async function routeAfterAuth(router: { replace: (path: string) => void }): Promise<void> {
  const [nameChosen, ageConfirmed, termsVersion, consentRecorded] = await Promise.all([
    AsyncStorage.getItem("name_chosen"),
    AsyncStorage.getItem("age_confirmed"),
    AsyncStorage.getItem("terms_accepted_version"),
    AsyncStorage.getItem("consent_recorded"),
  ]);

  if (!nameChosen && !ageConfirmed) {
    // New user — go to name selection first
    router.replace("/(auth)/choose-name");
  } else if (!nameChosen && ageConfirmed) {
    // Existing user who never saw the name screen — skip it
    await AsyncStorage.setItem("name_chosen", "true");
    if (!termsVersion) {
      router.replace("/(auth)/terms");
    } else if (!consentRecorded) {
      router.replace("/(auth)/consent");
    } else {
      router.replace("/(app)/(tabs)");
    }
  } else if (!ageConfirmed) {
    router.replace("/(auth)/age-gate");
  } else if (!termsVersion) {
    router.replace("/(auth)/terms");
  } else if (!consentRecorded) {
    router.replace("/(auth)/consent");
  } else {
    router.replace("/(app)/(tabs)");
  }
}
