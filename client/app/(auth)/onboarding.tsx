import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  type ViewToken,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/theme/colors";
import { AppBackground } from "@/components/ui/AppBackground";

const { width } = Dimensions.get("window");

interface OnboardingSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
}

const slides: OnboardingSlide[] = [
  {
    id: "1",
    icon: "heart-circle-outline",
    iconColor: "#E57373",
    title: "You're not alone",
    subtitle:
      "Empath connects you with someone who truly understands what you're going through — anonymously and safely.",
  },
  {
    id: "2",
    icon: "chatbubbles-outline",
    iconColor: colors.primary,
    title: "Share what's on your mind",
    subtitle:
      "Tell us what's weighing on you in your own words. We'll find someone matched to your experience — not just a category.",
  },
  {
    id: "3",
    icon: "shield-checkmark-outline",
    iconColor: "#66BB6A",
    title: "Safe and private",
    subtitle:
      "Everything is anonymous. Your messages are encrypted, and your identity is never shared. You're in control.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleGetStarted();
    }
  };

  const handleGetStarted = async () => {
    await AsyncStorage.setItem("onboarding_complete", "true");
    router.replace("/(auth)/splash");
  };

  const isLast = currentIndex === slides.length - 1;

  return (
    <View style={styles.container}>
      <AppBackground />
      <Image
        source={require("../../assets/empath-logo-text.jpg")}
        style={styles.logo}
        resizeMode="contain"
      />
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={[styles.iconCircle, { backgroundColor: item.iconColor + "18" }]}>
              <Ionicons name={item.icon} size={64} color={item.iconColor} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.7}
        >
          <Text style={styles.nextButtonText}>
            {isLast ? "Get started" : "Next"}
          </Text>
          {!isLast && (
            <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
          )}
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleGetStarted}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logo: {
    width: 200,
    height: 62,
    alignSelf: "center",
    marginTop: 60,
    marginBottom: 8,
  },
  slide: {
    width,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    textAlign: "center",
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 50,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: "100%",
  },
  nextButtonText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: colors.textInverse,
  },
  skipButton: {
    paddingVertical: 14,
  },
  skipText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: colors.textTertiary,
  },
});
