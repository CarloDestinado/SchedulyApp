import React, { useState, useMemo } from 'react';
import {
  View, Text, Switch, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Modal, TouchableWithoutFeedback, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, ScheduleEvent } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { usePrefs } from '@/context/PrefsContext';
import { ThemedText } from '@/components/themed-text';


export default function ProfileScreen() {
  const { user, isRegistered, events, circles, logout, updateProfile, updateEmail, restoreEvent, removeEvent } = useAuth();
  const { colors, darkMode, setDarkMode } = useAppTheme();
  const router = useRouter();
  const { s, isSmallDevice, pad } = useResponsive();
  const { prefs, setPref } = usePrefs();

  const [archiveModalVisible, setArchiveModalVisible] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [selectedArchived, setSelectedArchived] = useState<ScheduleEvent | null>(null);
  const [confirmAction, setConfirmAction] = useState<'delete' | 'restore' | null>(null);
  const [confirmEventId, setConfirmEventId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => ({
    total: events.filter(e => !e.archived).length,
    circles: circles.length,
  }), [events, circles]);

  const archivedEvents = useMemo(() => events.filter(e => e.archived).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)), [events]);

  const handleLogout = () => { logout(); setTimeout(() => router.replace('/login'), 0); };

  const openEdit = () => {
    setEditName(user?.name ?? '');
    setEditEmail(user?.email ?? '');
    setEditBio(user?.bio ?? '');
    setEditPassword('');
    setEditingEmail(false);
    setEditVisible(true);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const nameChanged = editName.trim() !== user?.name;
    const bioChanged = editBio !== (user?.bio ?? '');

    if (nameChanged || bioChanged) {
      const ok = await updateProfile({ name: editName.trim(), bio: editBio.trim() });
      if (!ok) Alert.alert('Error', 'Failed to save profile.');
    }

    if (editingEmail && editEmail !== user?.email && editPassword) {
      const result = await updateEmail(editEmail.trim(), editPassword);
      if (!result.success) {
        setSaving(false);
        Alert.alert('Email Update Failed', result.error ?? 'Unknown error');
        return;
      }
      Alert.alert('Email Update', 'Confirmation email sent. Verify before the change takes effect.');
    }

    setSaving(false);
    setEditVisible(false);
  };

  const ac = colors.accent;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { padding: pad(16, 20), paddingBottom: s(48), paddingTop: s(32) }]} showsVerticalScrollIndicator={false}>

        {/* Hero banner */}
        <View style={[styles.heroBanner, { backgroundColor: colors.surface, borderColor: ac + '30', borderRadius: s(18), padding: s(28), marginBottom: s(16), borderWidth: 1 }]}>
          <View style={styles.heroBg} />
          <View style={[styles.avatarRing, { borderColor: ac + '60', backgroundColor: ac + '20', width: s(80), height: s(80), borderRadius: s(24), borderWidth: 2, marginBottom: s(14) }]}>
            <Ionicons name="person" size={s(36)} color={ac} />
          </View>
          <ThemedText style={[styles.heroName, { color: colors.text, fontSize: isSmallDevice ? 20 : s(22) }]}>{user?.name ?? 'Guest'}</ThemedText>
          {user?.email ? (
            <ThemedText style={[styles.heroEmail, { color: colors.muted, fontSize: s(12), marginTop: s(4) }]}>{user.email}</ThemedText>
          ) : null}
          {user?.bio ? (
            <ThemedText style={[styles.heroBio, { color: colors.muted, fontSize: s(12), marginTop: s(6) }]}>{user.bio}</ThemedText>
          ) : null}
          <View style={[styles.heroBadge, isRegistered ? styles.badgeReg : styles.badgeGuest, { borderRadius: s(20), paddingHorizontal: s(12), paddingVertical: s(5), gap: s(5), marginTop: s(10) }]}>
            <Ionicons name={isRegistered ? 'checkmark-circle' : 'time-outline'} size={s(12)} color={isRegistered ? colors.success : colors.warning} />
            <ThemedText style={[styles.heroBadgeText, { color: isRegistered ? colors.success : colors.warning }]}>
              {isRegistered ? 'Registered Account' : 'Guest Session'}
            </ThemedText>
          </View>
        </View>

        {/* Edit Profile button */}
        <TouchableOpacity
          style={[styles.editProfileBtn, { backgroundColor: colors.surface, borderColor: ac + '40', borderRadius: s(14), padding: s(14), marginBottom: s(20), gap: s(10), borderWidth: 1 }]}
          onPress={openEdit}
          activeOpacity={0.8}
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
        >
          <View style={[styles.editProfileIcon, { backgroundColor: ac + '20', width: s(34), height: s(34), borderRadius: s(10) }]}>
            <Ionicons name="create-outline" size={s(17)} color={ac} />
          </View>
          <Text style={{ color: colors.text, fontSize: s(14), fontWeight: '600', flex: 1 }}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} />
        </TouchableOpacity>

        {/* Stats cards */}
        <View style={{ flexDirection: 'row', gap: s(10), marginBottom: s(20) }}>
          {[
            { icon: 'calendar-outline' as const, label: 'Total Events', value: stats.total, color: '#60A5FA', onPress: undefined },

            { icon: 'people-outline' as const, label: 'Circles', value: stats.circles, color: '#A78BFA', onPress: undefined },
          ].map((stat) => (
            <TouchableOpacity key={stat.label} onPress={stat.onPress} disabled={!stat.onPress} activeOpacity={0.7} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(14), padding: s(14), flex: 1, borderWidth: 1 }]}>
              <View style={[styles.statIconWrap, { backgroundColor: stat.color + '20', width: s(32), height: s(32), borderRadius: s(10), marginBottom: s(8) }]}>
                <Ionicons name={stat.icon} size={s(16)} color={stat.color} />
              </View>
              <ThemedText style={[styles.statValue, { color: colors.text, fontSize: s(20) }]}>{stat.value}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.muted, fontSize: s(10) }]}>{stat.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>



        {/* Archived Events */}
        <TouchableOpacity activeOpacity={0.7} onPress={() => setArchiveModalVisible(true)} style={{ marginBottom: s(16) }}>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(16), borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: s(14), gap: s(12) }}>
              <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: ac + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="archive-outline" size={s(16)} color={ac} />
              </View>
              <Text style={{ flex: 1, color: colors.text, fontSize: s(14), fontWeight: '600' }}>Archived</Text>
              <View style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: s(10), paddingVertical: s(3), borderRadius: s(8) }}>
                <Text style={{ color: colors.muted, fontSize: s(12), fontWeight: '700' }}>{archivedEvents.length}</Text>
              </View>
              <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Appearance */}
        <SectionLabel label="Appearance" color={colors.faint} />
        <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(16), marginBottom: s(8), borderWidth: 1 }]}>
          <SettingRow icon="moon-outline" label="Dark Mode" accent={ac}
            labelColor={colors.text}
            right={<Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ true: ac, false: colors.border }} thumbColor="#fff" />}
          />
        </View>

        {/* AI Assistant */}
        <SectionLabel label="AI Assistant" color={colors.faint} />
        <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(16), marginBottom: s(8), borderWidth: 1 }]}>
          <SettingRow icon="sparkles" label="Use Smart AI Assistance" accent={ac}
            labelColor={colors.text}
            right={<Switch value={prefs.useGroq} onValueChange={(v) => setPref('useGroq', v)} trackColor={{ true: ac, false: colors.border }} thumbColor="#fff" />}
          />
          <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: s(14) }]} />
          <SettingRow icon="bulb-outline" label="Dashboard Suggestions" accent={ac}
            labelColor={colors.text}
            right={<Switch value={prefs.notifyAI} onValueChange={(v) => setPref('notifyAI', v)} trackColor={{ true: ac, false: colors.border }} thumbColor="#fff" />}
          />
        </View>

        {/* Sign out */}
        <SectionLabel label="Account" color={colors.faint} />
        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(16), padding: s(16), marginBottom: s(8), gap: s(12), borderWidth: 1 }]} onPress={handleLogout} activeOpacity={0.8} accessibilityLabel="Sign out of your account" accessibilityRole="button">
          <View style={[styles.logoutIcon, { backgroundColor: colors.danger + '18', width: s(34), height: s(34), borderRadius: s(10) }]}>
            <Ionicons name="log-out-outline" size={s(18)} color={colors.danger} />
          </View>
          <Text style={[styles.logoutText, { color: colors.danger, fontSize: s(14) }]}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} />
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.muted, fontSize: s(12), marginTop: s(16) }]}>Scheduly v1.0.0 - Prototype</Text>

        {/* ── Edit Profile Modal ── */}
        <Modal visible={editVisible} transparent animationType="fade">
          <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => !saving && setEditVisible(false)}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, width: '88%', maxWidth: 400, padding: s(24) }}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), marginBottom: s(22) }}>
                    <View style={{ width: s(44), height: s(44), borderRadius: s(14), backgroundColor: ac + '20', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="person-outline" size={s(22)} color={ac} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700' }}>Edit Profile</Text>
                  </View>

                  {/* Name */}
                  <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: s(6) }}>Name</Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), padding: s(14), fontSize: s(14), marginBottom: s(16) }]}
                    placeholder="Your name"
                    placeholderTextColor={colors.muted}
                  />

                  {/* Email */}
                  <TouchableOpacity onPress={() => setEditingEmail(!editingEmail)} style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(12) }}>
                    <Ionicons name={editingEmail ? 'checkmark-circle' : 'add-circle-outline'} size={s(18)} color={editingEmail ? colors.success : ac} />
                    <Text style={{ color: ac, fontSize: s(13), fontWeight: '600' }}>{editingEmail ? 'Editing email' : 'Change email'}</Text>
                  </TouchableOpacity>
                  {editingEmail && (
                    <>
                      <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: s(6) }}>New Email</Text>
                      <TextInput
                        value={editEmail}
                        onChangeText={setEditEmail}
                        style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), padding: s(14), fontSize: s(14), marginBottom: s(12) }]}
                        placeholder="new@email.com"
                        placeholderTextColor={colors.muted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                      <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: s(6) }}>Current Password</Text>
                      <TextInput
                        value={editPassword}
                        onChangeText={setEditPassword}
                        style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), padding: s(14), fontSize: s(14), marginBottom: s(16) }]}
                        placeholder="Required to change email"
                        placeholderTextColor={colors.muted}
                        secureTextEntry
                        autoCapitalize="none"
                      />
                    </>
                  )}

                  {/* Bio */}
                  <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: s(6) }}>Bio</Text>
                  <TextInput
                    value={editBio}
                    onChangeText={setEditBio}
                    style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), padding: s(14), fontSize: s(14), marginBottom: s(22), minHeight: s(72), textAlignVertical: 'top' }]}
                    placeholder="Tell us about yourself..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                  />

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: s(10) }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: s(14), paddingVertical: s(14), alignItems: 'center' }}
                      onPress={() => setEditVisible(false)}
                      disabled={saving}
                    >
                      <Text style={{ color: colors.muted, fontSize: s(14), fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: ac, borderRadius: s(14), paddingVertical: s(14), alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: s(8) }}
                      onPress={handleSaveProfile}
                      disabled={saving}
                    >
                      {saving && <ActivityIndicator size="small" color="#fff" />}
                      <Text style={{ color: '#fff', fontSize: s(14), fontWeight: '700' }}>{saving ? 'Saving...' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        {/* ── Archived Event Detail Modal ── */}
        <Modal visible={selectedArchived !== null} transparent animationType="fade" onRequestClose={() => setSelectedArchived(null)}>
          <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setSelectedArchived(null)}>
            <TouchableWithoutFeedback onPress={() => {}}>
              {selectedArchived && (
              <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, width: '88%', maxWidth: 400, padding: s(24) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), marginBottom: s(22) }}>
                  <View style={{ width: s(44), height: s(44), borderRadius: s(14), backgroundColor: ac + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="archive-outline" size={s(22)} color={ac} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700', flex: 1 }}>{selectedArchived.title}</Text>
                  <TouchableOpacity onPress={() => setSelectedArchived(null)}>
                    <Ionicons name="close" size={s(22)} color={colors.muted} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: s(14) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
                    <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="calendar-outline" size={s(16)} color={colors.muted} />
                    </View>
                    <View>
                      <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600' }}>Date</Text>
                      <Text style={{ color: colors.text, fontSize: s(14), fontWeight: '600' }}>{selectedArchived.date}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
                    <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="time-outline" size={s(16)} color={colors.muted} />
                    </View>
                    <View>
                      <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600' }}>Time</Text>
                      <Text style={{ color: colors.text, fontSize: s(14), fontWeight: '600' }}>{selectedArchived.startTime} - {selectedArchived.endTime}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
                    <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="pricetag-outline" size={s(16)} color={colors.muted} />
                    </View>
                    <View>
                      <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600' }}>Status</Text>
                      <Text style={{ color: colors.muted, fontSize: s(14), fontWeight: '600' }}>Archived</Text>
                    </View>
                  </View>

                  {selectedArchived.notes ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s(12) }}>
                      <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="document-text-outline" size={s(16)} color={colors.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600' }}>Notes</Text>
                        <Text style={{ color: colors.text, fontSize: s(13), opacity: 0.85 }}>{selectedArchived.notes}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(22) }}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), backgroundColor: colors.danger + '18', borderRadius: s(14), paddingVertical: s(14) }}
                    onPress={() => setConfirmAction('delete')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={s(18)} color={colors.danger} />
                    <Text style={{ color: colors.danger, fontSize: s(15), fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), backgroundColor: ac + '20', borderRadius: s(14), paddingVertical: s(14) }}
                    onPress={() => setConfirmAction('restore')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={s(18)} color={ac} />
                    <Text style={{ color: ac, fontSize: s(15), fontWeight: '700' }}>Restore</Text>
                  </TouchableOpacity>
                </View>
              </View>
              )}
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        {/* ── Confirm Action Modal ── */}
        <Modal visible={confirmAction !== null} transparent animationType="fade" onRequestClose={() => setConfirmAction(null)}>
          <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setConfirmAction(null)}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, width: '82%', maxWidth: 360, padding: s(28), alignItems: 'center' }}>
                <View style={{ width: s(52), height: s(52), borderRadius: s(16), backgroundColor: confirmAction === 'delete' ? colors.danger + '18' : ac + '20', alignItems: 'center', justifyContent: 'center', marginBottom: s(14) }}>
                  <Ionicons name={confirmAction === 'delete' ? 'trash-outline' : 'refresh-outline'} size={s(24)} color={confirmAction === 'delete' ? colors.danger : ac} />
                </View>
                <Text style={{ color: colors.text, fontSize: s(17), fontWeight: '700', marginBottom: s(8), textAlign: 'center' }}>
                  {confirmAction === 'delete' ? 'Delete Event' : 'Restore Event'}
                </Text>
                <Text style={{ color: colors.muted, fontSize: s(13), textAlign: 'center', lineHeight: s(20), marginBottom: s(24) }}>
                  {confirmAction === 'delete'
                    ? 'This will permanently delete this archived event. This action cannot be undone.'
                    : 'This will move this event back to your active schedule.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: s(10), width: '100%' }}>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', paddingVertical: s(13), borderRadius: s(12), backgroundColor: colors.surfaceAlt }}
                    onPress={() => { setConfirmAction(null); setConfirmEventId(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: colors.text, fontSize: s(14), fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', paddingVertical: s(13), borderRadius: s(12), backgroundColor: confirmAction === 'delete' ? colors.danger : ac }}
                    onPress={() => {
                      const id = confirmEventId ?? selectedArchived!.id;
                      if (confirmAction === 'delete') removeEvent(id);
                      else restoreEvent(id);
                      setConfirmAction(null);
                      setConfirmEventId(null);
                      setSelectedArchived(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: s(14), fontWeight: '700' }}>
                      {confirmAction === 'delete' ? 'Delete' : 'Restore'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        {/* ── Archived Bottom Sheet ── */}
        <Modal visible={archiveModalVisible} transparent animationType="slide" onRequestClose={() => setArchiveModalVisible(false)}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.overlay }} activeOpacity={1} onPress={() => setArchiveModalVisible(false)} />
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: s(24), borderTopRightRadius: s(24), height: '50%' }}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingVertical: s(10) }}>
                <View style={{ width: s(36), height: s(4), borderRadius: s(2), backgroundColor: colors.muted + '50' }} />
              </View>

              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(20), paddingBottom: s(12), gap: s(10) }}>
                <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: ac + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="archive-outline" size={s(16)} color={ac} />
                </View>
                <Text style={{ color: colors.text, fontSize: s(17), fontWeight: '700', flex: 1 }}>Archived Events</Text>
                <View style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: s(10), paddingVertical: s(3), borderRadius: s(8) }}>
                  <Text style={{ color: colors.muted, fontSize: s(12), fontWeight: '700' }}>{archivedEvents.length}</Text>
                </View>
              </View>

              {/* List */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: s(20), paddingBottom: s(10) }}>
                {archivedEvents.length === 0 ? (
                  <Text style={{ color: colors.muted, fontSize: s(13), textAlign: 'center', paddingVertical: s(32) }}>No archived events.</Text>
                ) : (
                  archivedEvents.map((e) => (
                    <TouchableOpacity key={e.id} activeOpacity={0.7} onPress={() => setSelectedArchived(e)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: s(12), padding: s(14), marginBottom: s(8), gap: s(10) }}>
                      <View style={{ width: s(4), height: s(36), borderRadius: s(2), backgroundColor: e.color || colors.muted, opacity: 0.5 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: s(13), fontWeight: '600', opacity: 0.7 }}>{e.title}</Text>
                        <Text style={{ color: colors.muted, fontSize: s(11), opacity: 0.6 }}>{e.date} &middot; {e.startTime}-{e.endTime}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return <Text style={[styles.sectionLabel, { color }]}>{label}</Text>;
}

function SettingRow({ icon, label, right, accent, labelColor }: {
  icon: string; label: string; right: React.ReactNode; accent: string; labelColor: string;
}) {
  const { s } = useResponsive();
  return (
    <View style={[styles.settingRow, { paddingHorizontal: s(16), paddingVertical: s(14), gap: s(12) }]}>
      <View style={[styles.settingIconWrap, { backgroundColor: accent + '20', width: s(34), height: s(34), borderRadius: s(10) }]}>
        <Ionicons name={icon as any} size={s(17)} color={accent} />
      </View>
      <Text style={[styles.settingLabel, { color: labelColor, fontSize: s(14) }]}>{label}</Text>
      <View style={{ marginLeft: 'auto' }}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080B14' },
  scroll: { padding: 20, paddingBottom: 48 },
  heroBanner: { alignItems: 'center', borderRadius: 18, padding: 28, backgroundColor: '#0F172A', borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  heroBg: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: '#2DD4BF', opacity: 0.07 },
  avatarRing: { width: 80, height: 80, borderRadius: 24, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  heroName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroEmail: {},
  heroBio: { fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 16 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  nameInput: { borderBottomWidth: 2, paddingVertical: 2, paddingHorizontal: 4, fontWeight: '800', textAlign: 'center', minWidth: 120 },
  badgeReg: { backgroundColor: '#10B98120' },
  badgeGuest: { backgroundColor: '#F59E0B20' },
  heroBadgeText: { fontSize: 12, fontWeight: '600' },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center' },
  editProfileIcon: { justifyContent: 'center', alignItems: 'center' },
  statCard: { alignItems: 'center' },
  statIconWrap: { justifyContent: 'center', alignItems: 'center' },
  statValue: { fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  eventRow: { flexDirection: 'row', alignItems: 'center' },
  eventDot: { borderRadius: 5 },
  sectionLabel: { color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 8, paddingLeft: 4 },
  group: { backgroundColor: '#0F172A', borderRadius: 16, borderWidth: 1, borderColor: '#243149', marginBottom: 8, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  settingIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { color: '#CBD5E1', fontSize: 14, flex: 1 },
  divider: { height: 1, backgroundColor: '#131C30' },
  editInput: { borderWidth: 1 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0F172A', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#243149', marginBottom: 8 },
  logoutIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center' },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600', flex: 1 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  version: { color: '#1E293B', textAlign: 'center', fontSize: 12, marginTop: 16 },
});
