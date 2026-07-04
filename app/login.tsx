import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui";

export default function LoginScreen() {
  const { loginAsGuest, loginAsRegistered } = useAuth();
  const { colors } = useAppTheme();
  const { s, isSmallDevice, pad } = useResponsive();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);

    const result = await loginAsRegistered(email, password);
    setLoading(false);

    if (result.success) {
      setTimeout(() => router.replace("/(tabs)"), 0);
    } else {
      setError(result.error || "Login failed. Please try again.");
    }
  };

  const handleGuest = () => {
    loginAsGuest();
    setTimeout(() => router.replace("/(tabs)"), 0);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.container, { paddingHorizontal: pad(20, 24) }]}
        >
          {/* Hero */}
          <View style={[styles.hero, { marginBottom: isSmallDevice ? s(24) : s(32) }]}>
            <View
              style={[
                styles.logoRing,
                {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent + "50",
                  width: isSmallDevice ? s(80) : s(94),
                  height: isSmallDevice ? s(80) : s(94),
                  borderRadius: isSmallDevice ? s(24) : s(28),
                  marginBottom: s(14),
                },
              ]}
            >
              <Image
                source={require("../assets/images/scheduly logo no bg.png")}
                style={[styles.logoImage, { width: s(60), height: s(60) }]}
                resizeMode="contain"
              />
            </View>
            <ThemedText type="title" style={{ fontSize: isSmallDevice ? s(28) : s(34), textAlign: 'center' }}>
              Scheduly
            </ThemedText>
            <ThemedText style={{ color: colors.muted, fontSize: s(13), marginTop: s(4), textAlign: 'center' }}>
              Find the Perfect Time, Every Single Time.
            </ThemedText>
          </View>

        {/* Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(18), padding: pad(18, 22), borderWidth: 1, marginBottom: s(24) },
          ]}
        >
          {error ? (
            <View style={[styles.errorBox, { borderRadius: s(10), padding: s(10), marginBottom: s(14) }]}>
              <Ionicons name="alert-circle-outline" size={s(15)} color="#F87171" />
                <ThemedText style={[styles.errorText, { fontSize: s(13) }]}>{error}</ThemedText>
            </View>
          ) : null}

          <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>
            Email
          </ThemedText>
          <View
            style={[
              styles.inputWrap,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                borderRadius: s(12),
                paddingHorizontal: pad(12, 14),
                marginBottom: s(16),
              },
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={s(18)}
              color={colors.accent}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(14) }]}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>
            Password
          </ThemedText>
          <View
            style={[
              styles.inputWrap,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                borderRadius: s(12),
                paddingHorizontal: pad(12, 14),
                marginBottom: s(16),
              },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={s(18)}
              color={colors.accent}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { flex: 1, color: colors.text, fontSize: s(15), paddingVertical: s(14) }]}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPass}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPass((v) => !v)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={s(18)}
                color={colors.muted}
              />
            </TouchableOpacity>
          </View>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            icon="arrow-forward"
            iconPosition="right"
            style={{ marginBottom: s(16) }}
            accessibilityLabel="Sign in to your account"
          />

          <TouchableOpacity
            onPress={() => router.push("/register")}
            style={[styles.linkRow, { gap: s(4) }]}
            disabled={loading}
          >
            <ThemedText style={{ color: colors.muted, fontSize: s(14) }}>
              No account yet?
            </ThemedText>
            <ThemedText style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>
              Register
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={[styles.dividerRow, { marginBottom: s(20) }]}>
          <View
            style={[styles.dividerLine, { backgroundColor: colors.border }]}
          />
          <ThemedText style={{ color: colors.muted, fontSize: s(12), marginHorizontal: s(12) }}>
            or continue as
          </ThemedText>
          <View
            style={[styles.dividerLine, { backgroundColor: colors.border }]}
          />
        </View>

        {/* Guest */}
        <Button
          title="Try as Guest"
          onPress={handleGuest}
          variant="ghost"
          icon="person-outline"
          style={{ marginBottom: s(10) }}
          disabled={loading}
          accessibilityLabel="Continue as guest user"
        />
        <ThemedText style={{ color: colors.muted, fontSize: s(12), textAlign: 'center' }}>
          5 events max · 24-hour session
        </ThemedText>
      </KeyboardAvoidingView>

      {/* Loading Modal */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={[styles.loadingOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.accentStrong} />
            <ThemedText style={[styles.loadingText, { color: colors.text }]}>Signing in...</ThemedText>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080B14" },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  hero: { alignItems: "center", marginBottom: 32 },
  logoRing: {
    width: 94,
    height: 94,
    borderRadius: 28,
    backgroundColor: "#134E4A",
    borderWidth: 1.5,
    borderColor: "#2DD4BF50",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  logoImage: { width: 60, height: 60 },
  logoText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#F1F5F9",
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 13, color: "#64748B", marginTop: 4, letterSpacing: 0.3 },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#243149",
    marginBottom: 24,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#7F1D1D40",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EF444430",
  },
  errorText: { color: "#F87171", fontSize: 13 },
  fieldLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#243149",
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#F1F5F9", fontSize: 15, paddingVertical: 14 },
  eyeBtn: { padding: 4 },
  linkRow: { flexDirection: "row", justifyContent: "center" },
  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#243149" },
  dividerText: { color: "#475569", marginHorizontal: 12, fontSize: 12 },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#475569",
  },
  loadingText: { color: "#E2E8F0", fontSize: 15, fontWeight: "600" },
});
