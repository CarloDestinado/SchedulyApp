import { useAuth } from "@/context/AuthContext";
import { useAppTheme } from "@/context/ThemeContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

export default function RegisterScreen() {
  const { register } = useAuth();
  const { colors } = useAppTheme();
  const { s, isSmallDevice, pad } = useResponsive();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError("");
    setLoading(true);

    const result = await register(name.trim(), email.trim(), password);

    if (result.success) {
      setTimeout(() => router.replace("/(tabs)"), 300);
    } else {
      setLoading(false);
      setError(result.error || "Registration failed. Please try again.");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.container, { paddingHorizontal: pad(20, 24) }]}
        >
          {/* Back */}
          <TouchableOpacity
            style={[styles.backBtn, { gap: s(6), marginBottom: s(24) }]}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Ionicons name="arrow-back" size={s(20)} color={colors.accent} />
            <ThemedText style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>Back</ThemedText>
          </TouchableOpacity>

          {/* Hero */}
          <View style={[styles.hero, { marginBottom: isSmallDevice ? s(24) : s(28) }]}>
            <View
              style={[
                styles.logoRing,
                {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent + "50",
                  width: s(64),
                  height: s(64),
                  borderRadius: s(20),
                  marginBottom: s(12),
                },
              ]}
            >
              <Ionicons name="person-add" size={s(28)} color={colors.accent} />
            </View>
            <ThemedText type="title" style={{ fontSize: isSmallDevice ? s(22) : s(26), textAlign: 'center' }}>
              Create Account
            </ThemedText>
            <ThemedText style={{ color: colors.muted, fontSize: s(13), marginTop: s(4), textAlign: 'center' }}>
              Join Scheduly and take control of your time
            </ThemedText>
          </View>

          {/* Card */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(18), padding: pad(18, 22), borderWidth: 1 },
            ]}
          >
            {error ? (
              <View style={[styles.errorBox, { borderRadius: s(10), padding: s(10), marginBottom: s(14) }]}>
                <Ionicons name="alert-circle-outline" size={s(15)} color="#F87171" />
                <ThemedText style={[styles.errorText, { fontSize: s(13) }]}>{error}</ThemedText>
              </View>
            ) : null}

            {[
              {
                label: "Full Name",
                icon: "person-outline",
                value: name,
                setter: setName,
                placeholder: "John Doe",
                secure: false,
                keyboard: "default",
              },
              {
                label: "Email",
                icon: "mail-outline",
                value: email,
                setter: setEmail,
                placeholder: "you@example.com",
                secure: false,
                keyboard: "email-address",
              },
            ].map((f) => (
              <View key={f.label}>
                <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>
                  {f.label}
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
                    name={f.icon as any}
                    size={s(18)}
                    color={colors.accent}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(14) }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.muted}
                    autoCapitalize={f.label === "Email" ? "none" : "words"}
                    keyboardType={f.keyboard as any}
                    value={f.value}
                    onChangeText={f.setter}
                    editable={!loading}
                  />
                </View>
              </View>
            ))}

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
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPass((v) => !v)}
                style={styles.eyeBtn}
                disabled={loading}
              >
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={s(18)}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={loading}
              icon="arrow-forward"
              iconPosition="right"
              style={{ marginBottom: s(16) }}
              accessibilityLabel="Create your account"
            />

            <TouchableOpacity
              onPress={() => router.push("/login")}
              style={[styles.linkRow, { gap: s(4) }]}
              disabled={loading}
            >
              <ThemedText style={{ color: colors.muted, fontSize: s(14) }}>
                Already have an account?
              </ThemedText>
              <ThemedText style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>
                Sign In
              </ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

      {/* Loading Modal */}
      <Modal
        visible={loading}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.accentStrong} />
            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>Creating Account</ThemedText>
            <ThemedText style={[styles.modalMessage, { color: colors.muted }]}>
              Creating your account on Supabase...
            </ThemedText>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080B14" },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  backText: { color: "#818CF8", fontSize: 14, fontWeight: "600" },
  hero: { alignItems: "center", marginBottom: 28 },
  logoRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#134E4A",
    borderWidth: 1.5,
    borderColor: "#2DD4BF50",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  logoText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#F1F5F9",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#243149",
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
  // Loading Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: 280,
    borderWidth: 1,
    borderColor: "#475569",
  },
  modalTitle: {
    color: "#F1F5F9",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  modalMessage: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
});
