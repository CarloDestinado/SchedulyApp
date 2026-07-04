import { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Tabs, Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';

const LOCK_MESSAGES: Record<string, string> = {
  circles: 'Please Log In or Register an account to create group circles and sync with friends.',
  chat: 'Please Log In or Register an account to chat with other users.',
  assistant: 'Please Log In or Register an account to access the AI Assistant.',
  profile: 'Please Log In or Register an account to manage your profile.',
};

export default function TabLayout() {
  const { isRegistered, isAuthenticated, isGuestExpired, logout } = useAuth();
  const { colors } = useAppTheme();
  const { s, isSmallDevice } = useResponsive();
  const router = useRouter();
  const [lockedTab, setLockedTab] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (isRegistered || !isAuthenticated) return;
    if (isGuestExpired()) { setExpired(true); return; }
    const interval = setInterval(() => {
      if (isGuestExpired()) setExpired(true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [isRegistered, isAuthenticated, isGuestExpired]);

  if (!isAuthenticated) return <Redirect href="/login" />;

  const goTo = (path: string) => setTimeout(() => router.replace(path as any), 0);

  // Shared listener factory — intercepts tab press for guests
  const guestLock = (tabName: string) => ({
    tabPress: (e: any) => {
      if (!isRegistered) {
        e.preventDefault();
        setLockedTab(tabName);
      }
    },
  });

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: isSmallDevice ? 56 : s(68),
            paddingBottom: isSmallDevice ? 10 : s(12),
            paddingTop: isSmallDevice ? 4 : s(6),
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: isSmallDevice ? 10 : s(11), fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="circles"
          options={{
            title: 'Circles',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
          listeners={guestLock('circles')}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
          }}
          listeners={guestLock('chat')}
        />
        <Tabs.Screen
          name="assistant"
          options={{
            title: 'Assistant',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />,
          }}
          listeners={guestLock('assistant')}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          }}
          listeners={guestLock('profile')}
        />
        <Tabs.Screen
          name="circle-detail"
          options={{ href: null }}
        />
      </Tabs>

      {/* Guest: Feature lock modal (shared for all locked tabs) */}
      <Modal visible={lockedTab !== null} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.overlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setLockedTab(null)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modalIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="lock-closed" size={24} color={colors.accent} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Feature Locked</Text>
            <Text style={[styles.modalBody, { color: colors.muted }]}>
              {lockedTab ? LOCK_MESSAGES[lockedTab] : ''}
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: colors.accentStrong }]}
              onPress={() => { setLockedTab(null); goTo('/register'); }}
              accessibilityLabel="Register for an account"
              accessibilityRole="button"
            >
              <Text style={[styles.btnText, { color: colors.onAccent }]}>Register</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: colors.accent }]}
              onPress={() => { setLockedTab(null); goTo('/login'); }}
              accessibilityLabel="Log in to your account"
              accessibilityRole="button"
            >
              <Text style={[styles.btnSecondaryText, { color: colors.accent }]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLockedTab(null)} accessibilityLabel="Close dialog" accessibilityRole="button">
              <Text style={[styles.dismiss, { color: colors.muted }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Guest: 24-hour expiry overlay — un-dismissible */}
      <Modal visible={expired} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modalIcon, styles.modalIconDanger]}>
              <Ionicons name="time-outline" size={24} color="#F87171" />
            </View>
            <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Guest Trial Expired</Text>
            <Text style={[styles.modalBody, { color: colors.muted }]}>
              Please register an account to continue scheduling.
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: colors.accentStrong }]}
              onPress={() => { logout(); goTo('/register'); }}
            >
              <Text style={[styles.btnText, { color: colors.onAccent }]}>Register Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: colors.accent }]}
              onPress={() => { logout(); goTo('/login'); }}
            >
              <Text style={[styles.btnSecondaryText, { color: colors.accent }]}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modal: {
    backgroundColor: '#0F172A', borderRadius: 18, padding: 24,
    width: '100%', maxWidth: 380, alignItems: 'center',
    borderWidth: 1, borderColor: '#243149',
  },
  modalIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#134E4A', justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  modalIconDanger: { backgroundColor: '#7F1D1D40' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9', marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btnPrimary: {
    borderRadius: 12,
    paddingVertical: 13, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  btnText: { fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 12, width: '100%', alignItems: 'center', marginBottom: 14,
  },
  btnSecondaryText: { fontWeight: '600', fontSize: 15 },
  dismiss: { fontSize: 13 },
});
