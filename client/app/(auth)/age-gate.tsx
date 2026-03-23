import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { Button } from "@/components/ui/Button";
import { AppBackground } from "@/components/ui/AppBackground";
import { confirmAge } from "@/api/compliance.api";

export default function AgeGateScreen() {
  const router = useRouter();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [rejected, setRejected] = useState(false);

  const isValid =
    day.length > 0 &&
    month.length > 0 &&
    year.length === 4 &&
    !isNaN(Number(day)) &&
    !isNaN(Number(month)) &&
    !isNaN(Number(year));

  const handleConfirm = async () => {
    if (!isValid) return;

    const d = Number(day);
    const m = Number(month);
    const y = Number(year);

    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear()) {
      Alert.alert("Invalid Date", "Please enter a valid date of birth.");
      return;
    }

    const dateOfBirth = new Date(y, m - 1, d).toISOString();

    setLoading(true);
    try {
      const result = await confirmAge(dateOfBirth);
      if (result.confirmed) {
        await AsyncStorage.setItem("age_confirmed", "true");
        router.replace("/(auth)/terms");
      } else {
        setRejected(true);
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (rejected) {
    return (
      <View style={styles.container}>
        <AppBackground />
        <View style={styles.content}>
          <Text style={styles.title}>Unable to Continue</Text>
          <Text style={styles.body}>
            You must be 18 or older to use Empath. This service involves
            conversations about life challenges and is not suitable for
            under-18s.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBackground />
      <View style={styles.content}>
        <Text style={styles.title}>Confirm Your Age</Text>
        <Text style={styles.body}>
          You must be 18 or older to use Empath. Please enter your date of
          birth.
        </Text>

        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Day</Text>
            <TextInput
              style={styles.input}
              placeholder="DD"
              placeholderTextColor={colors.textTertiary}
              value={day}
              onChangeText={(t) => setDay(t.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Month</Text>
            <TextInput
              style={styles.input}
              placeholder="MM"
              placeholderTextColor={colors.textTertiary}
              value={month}
              onChangeText={(t) => setMonth(t.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={styles.inputGroupWide}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY"
              placeholderTextColor={colors.textTertiary}
              value={year}
              onChangeText={(t) => setYear(t.replace(/[^0-9]/g, "").slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
        </View>

        <Button
          title="Continue"
          onPress={handleConfirm}
          loading={loading}
          disabled={!isValid}
          style={{ marginTop: 24 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 32,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  inputGroup: {
    flex: 1,
  },
  inputGroupWide: {
    flex: 1.5,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: 6,
    textAlign: "center",
  },
  input: {
    ...typography.h3,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
