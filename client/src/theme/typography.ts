import { TextStyle } from "react-native";

export const typography = {
  h1: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    lineHeight: 34,
    letterSpacing: -0.3,
  } as TextStyle,
  h2: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
    letterSpacing: -0.2,
  } as TextStyle,
  h3: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 24,
    letterSpacing: -0.1,
  } as TextStyle,
  body: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
  } as TextStyle,
  bodySmall: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  } as TextStyle,
  caption: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    letterSpacing: 0.1,
  } as TextStyle,
  button: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 22,
  } as TextStyle,
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
    letterSpacing: 0.2,
  } as TextStyle,
} as const;
