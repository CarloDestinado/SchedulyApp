import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, StyleSheet, SafeAreaView, Share, ScrollView, Platform,
  Pressable, TouchableWithoutFeedback, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth, Circle } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { usePrefs } from '@/context/PrefsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { ThemedText } from '@/components/themed-text';
import * as supabaseDb from '@/lib/supabaseDb';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#2DD4BF', '#60A5FA', '#F59E0B', '#A78BFA', '#F43F5E', '#22C55E'];
// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(existingCodes: Set<string> = new Set()): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 1000; i++) {
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!existingCodes.has(code)) return code;
  }
  return 'XXXXXX';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CirclesScreen() {
  const { user, userId, circles, addCircle, updateCircle, removeCircle, joinCircleByCode, refreshCircles, fetchCircleEvents, deleteCircleEvent } = useAuth();
  const { colors } = useAppTheme();
  const myName = user?.name ?? 'You';
  const { prefs } = usePrefs();
  const compact = !!prefs.compactLayout;
  const { s, isSmallDevice, pad } = useResponsive();
  const router = useRouter();

  const isCurrentMember = (member: string) => member === myName || member === 'You';

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newColor, setNewColor] = useState('#2DD4BF');
  const [createError, setCreateError] = useState('');

  // Join modal
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  // Leave modal
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);

  // Detail modal
  const [detailCircle, setDetailCircle] = useState<Circle | null>(null);
  const [addMemberName, setAddMemberName] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirm add member modal
  const [confirmAddVisible, setConfirmAddVisible] = useState(false);
  const [pendingMember, setPendingMember] = useState<{ name: string; userId?: string; circle: Circle } | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'deleteCircle' | 'removeMember' | 'deleteEvent';
    circle?: Circle;
    member?: string;
    circleId?: string;
    eventId?: string;
  } | null>(null);

  useEffect(() => {
    setAddMemberName('');
  }, [detailCircle]);

  useEffect(() => {
    if (detailCircle) {
      fetchCircleEvents(detailCircle.id);
    }
  }, [detailCircle, fetchCircleEvents]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const val = addMemberName.trim();
    if (val.length < 2) return;
    searchTimer.current = setTimeout(async () => {
      await supabaseDb.searchUsers(val);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [addMemberName]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCircles();
    setRefreshing(false);
  }, [refreshCircles]);

  const myCircles = circles.filter(c => c.members.some(isCurrentMember));

  // ── Create ──────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setNewName('');
    setNewCode(generateCode(new Set(circles.map(c => c.inviteCode))));
    setNewColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    setCreateError('');
    setCreateVisible(true);
  };

  const handleCreate = () => {
    if (!newName.trim()) { setCreateError('Please enter a circle name.'); return; }
    const code = newCode.trim().toUpperCase();
    const existingCodes = new Set(circles.map(c => c.inviteCode));
    if (existingCodes.has(code)) {
      setCreateError('Invite code already in use. Generating a new one.');
      setNewCode(generateCode(existingCodes));
      return;
    }
    addCircle({
      name: newName.trim(),
      inviteCode: code,
      members: [myName],
      color: newColor,
      isOwner: true,
      canEdit: false,
      memberIds: userId ? { [myName]: userId } : {},
    });
    setCreateVisible(false);
  };

  // ── Join ────────────────────────────────────────────────────────────────────
  const openJoin = () => {
    setJoinCode('');
    setJoinError('');
    setJoinVisible(true);
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setJoinError('Please enter an invite code.'); return; }
    if (code.length < 6) { setJoinError('Code must be 6 characters.'); return; }

    const result = await joinCircleByCode(code);
    if (result.success) {
      setJoinVisible(false);
    } else {
      setJoinError(result.error || 'An error occurred.');
    }
  };

  // ── Share ───────────────────────────────────────────────────────────────────
  const handleShare = async (circle: Circle) => {
    try {
      await Share.share({
        message: `Join my Group-Sync circle on Scheduly! Use my invite code: ${circle.inviteCode}`,
        title: `Join ${circle.name} on Scheduly`,
      });
    } catch {}
  };

  const handleAddMember = (circle: Circle, memberName: string, memberUserId?: string) => {
    const name = memberName.trim();
    if (!name) return;
    if (circle.members.includes(name)) return;

    const memberIds = { ...(circle.memberIds || {}) };
    if (memberUserId) memberIds[name] = memberUserId;

    updateCircle(circle.id, { members: [...circle.members, name], memberIds });
    setDetailCircle(prev => prev ? { ...prev, members: [...prev.members, name], memberIds } : null);

    if (memberUserId) {
      const newCircle: Circle = {
        id: circle.id,
        name: circle.name,
        inviteCode: circle.inviteCode,
        members: [...circle.members, name],
        color: circle.color,
        isOwner: false,
        canEdit: false,
        memberIds,
      };
      supabaseDb.saveCircleToUser(memberUserId, newCircle)
        .catch(err => console.error("Error saving circle to user:", err));
    }

    setAddMemberName('');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: pad(16, 20), paddingTop: s(20), paddingBottom: s(12) }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: isSmallDevice ? 22 : s(26) }]}>Circles</Text>
          <Text style={[styles.headerSub, { color: colors.muted, fontSize: s(13) }]}>{myCircles.length} group{myCircles.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={[styles.headerBtns, { gap: s(10) }]}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border, width: s(40), height: s(40), borderRadius: s(12) }]} onPress={openJoin}>
            <Ionicons name="enter-outline" size={s(20)} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnPrimary, { backgroundColor: colors.accentStrong, borderColor: colors.accent + '40', width: s(40), height: s(40), borderRadius: s(12) }]} onPress={openCreate}>
            <Ionicons name="add" size={s(22)} color={colors.onAccent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Circle list */}
      <FlatList
        data={myCircles}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingHorizontal: pad(12, 16), paddingBottom: s(40) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: compact ? s(10) : s(14), borderRadius: s(16), marginBottom: s(12) }]} activeOpacity={0.75} onPress={() => router.push(`/circle-detail?id=${item.id}`)}>
            <View style={[styles.cardAccent, { backgroundColor: item.color }]} />
            <View style={[styles.avatarWrap, { backgroundColor: item.color + '20', width: compact ? s(40) : s(46), height: compact ? s(40) : s(46), borderRadius: compact ? s(12) : s(14), marginRight: compact ? s(10) : s(14) }]}>
              <Ionicons name="people" size={compact ? s(18) : s(22)} color={item.color} />
            </View>
            <View style={styles.cardBody}>
              <View style={[styles.cardNameRow, { marginBottom: s(6) }]}>
                <Text style={[styles.cardName, { color: colors.text, fontSize: compact ? s(14) : s(15) }]}>{item.name}</Text>
                {item.isOwner && (
                  <View style={[styles.ownerBadge, { borderRadius: s(6), paddingHorizontal: s(7), paddingVertical: s(2) }]}>
                    <Text style={[styles.ownerBadgeText, { fontSize: s(10) }]}>Owner</Text>
                  </View>
                )}
              </View>
              <View style={[styles.cardMeta, { gap: s(8) }]}>
                <View style={[styles.metaChip, { backgroundColor: colors.surfaceAlt, borderRadius: s(8), paddingHorizontal: s(8), paddingVertical: s(3) }]}>
                  <Ionicons name="person-outline" size={s(11)} color={colors.muted} />
                  <Text style={[styles.metaText, { color: colors.muted, fontSize: compact ? s(10) : s(11) }]}>{item.members.length} member{item.members.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={[styles.metaChip, { backgroundColor: colors.surfaceAlt, borderRadius: s(8), paddingHorizontal: s(8), paddingVertical: s(3) }]}>
                  <Ionicons name="key-outline" size={s(11)} color={colors.muted} />
                  <Text style={[styles.metaText, { color: colors.muted, fontSize: compact ? s(10) : s(11) }]}>{item.inviteCode}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '35', width: compact ? s(32) : s(36), height: compact ? s(32) : s(36), borderRadius: compact ? s(8) : s(10) }]} onPress={() => handleShare(item)}>
              <Ionicons name="share-outline" size={compact ? s(15) : s(17)} color={colors.accent} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={[styles.emptyWrap, { paddingTop: isSmallDevice ? s(40) : s(60), gap: s(10) }]}>
            <View style={[styles.emptyIcon, { width: s(60), height: s(60), borderRadius: s(18), borderWidth: 1 }]}>
              <Ionicons name="people-outline" size={s(28)} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.muted }]}>No circles yet</Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>Create one or join with an invite code</Text>
          </View>
        }
      />

      {/* ── Create Circle Modal ── */}
      <Modal visible={createVisible} transparent animationType="fade">
        <Pressable
          style={[styles.overlay, { backgroundColor: colors.overlay }]}
          onPress={() => setCreateVisible(false)}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, borderRadius: s(22), width: '90%', maxWidth: 400, maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: pad(18, 24), paddingBottom: s(36) }} showsVerticalScrollIndicator={false}>
              <ThemedText style={[styles.sheetTitle, { color: colors.text, fontSize: s(20) }]}>Create a Circle</ThemedText>
              <View style={[styles.sheetAccent, { backgroundColor: newColor }]} />
              <ThemedText style={[styles.sheetSub, { color: colors.muted, fontSize: s(13), marginBottom: s(22) }]}>Name your group and share the invite code</ThemedText>

              <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Circle Name</ThemedText>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(14), borderLeftWidth: 3, borderLeftColor: newColor }]}>
                <Ionicons name="people-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(13) }]}
                  placeholder="e.g. Design Team"
                  placeholderTextColor={colors.muted}
                  value={newName}
                  onChangeText={v => { setNewName(v); setCreateError(''); }}
                />
              </View>

              {createError ? (
                <View style={[styles.errorBox, { borderRadius: s(10), padding: s(10), marginBottom: s(14) }]}>
                  <Ionicons name="alert-circle-outline" size={s(14)} color="#F87171" />
                  <ThemedText style={[styles.errorText, { fontSize: s(13) }]}>{createError}</ThemedText>
                </View>
              ) : null}

              {/* Color picker */}
              <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Color</ThemedText>
              <View style={styles.colorRow}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      newColor === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setNewColor(c)}
                  />
                ))}
              </View>

              <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Invite Code</ThemedText>
              <View style={[styles.codeBox, { backgroundColor: colors.surfaceAlt, borderColor: newColor + '40', borderRadius: s(12), padding: pad(12, 16), marginBottom: s(20) }]}>
                <Text style={[styles.codeValue, { color: newColor, fontSize: isSmallDevice ? 20 : s(24), letterSpacing: isSmallDevice ? 4 : s(6) }]}>{newCode}</Text>
                <TouchableOpacity style={[styles.refreshBtn, { gap: s(5) }]} onPress={() => setNewCode(generateCode(new Set(circles.map(c => c.inviteCode))))}>
                  <Ionicons name="refresh-outline" size={s(16)} color={newColor} />
                  <Text style={[styles.refreshText, { color: newColor, fontSize: s(12) }]}>New code</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: newColor, borderRadius: s(12), paddingVertical: s(15), marginBottom: s(12) }]} onPress={handleCreate} activeOpacity={0.85} accessibilityLabel={`Create circle named ${newName || 'untitled'}`} accessibilityRole="button">
                <ThemedText style={[styles.btnText, { color: '#fff', fontSize: s(16) }]}>Create Circle</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCreateVisible(false)} accessibilityLabel="Cancel creating circle" accessibilityRole="button">
                <ThemedText style={[styles.cancelText, { color: colors.muted, fontSize: s(14) }]}>Cancel</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Join Circle Modal ── */}
      <Modal visible={joinVisible} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.overlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setJoinVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, padding: pad(18, 24), paddingBottom: s(36), borderRadius: s(22), width: '90%', maxWidth: 400 }]}>
            <ThemedText style={[styles.sheetTitle, { color: colors.text, fontSize: s(20) }]}>Join a Circle</ThemedText>
            <ThemedText style={[styles.sheetSub, { color: colors.muted, fontSize: s(13), marginBottom: s(22) }]}>Enter the 6-character invite code</ThemedText>

            <TextInput
              style={[styles.codeInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.accent + '35', color: colors.accent, borderRadius: s(14), marginBottom: s(14), fontSize: isSmallDevice ? 22 : s(28), letterSpacing: isSmallDevice ? 6 : s(10), paddingVertical: s(18) }]}
              placeholder="• • • • • •"
              placeholderTextColor={colors.faint}
              value={joinCode}
              onChangeText={v => { setJoinCode(v.toUpperCase()); setJoinError(''); }}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {joinError ? (
              <View style={[styles.errorBox, { borderRadius: s(10), padding: s(10), marginBottom: s(14) }]}>
                <Ionicons name="alert-circle-outline" size={s(14)} color="#F87171" />
                <ThemedText style={[styles.errorText, { fontSize: s(13) }]}>{joinError}</ThemedText>
              </View>
            ) : null}

            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.accentStrong, borderRadius: s(12), paddingVertical: s(15), marginBottom: s(12) }]} onPress={handleJoin} activeOpacity={0.85} accessibilityLabel="Join circle with entered invite code" accessibilityRole="button">
              <ThemedText style={[styles.btnText, { color: colors.onAccent, fontSize: s(16) }]}>Join Circle</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinVisible(false)} accessibilityLabel="Cancel joining circle" accessibilityRole="button">
              <ThemedText style={[styles.cancelText, { color: colors.muted, fontSize: s(14) }]}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Leave Circle Modal ── */}
      <Modal visible={leaveModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.overlayCenter, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setLeaveModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.successSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(20), padding: s(24), width: isSmallDevice ? '80%' : '70%', maxWidth: s(260) }]}>
            <View style={[styles.successIcon, { backgroundColor: colors.accentSoft, width: s(64), height: s(64), borderRadius: s(16), marginBottom: s(14), borderWidth: 1 }]}>
              <Ionicons name="checkmark-circle" size={s(52)} color={colors.accent} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text, fontSize: isSmallDevice ? 20 : s(24) }]}>Left Circle</Text>
            <Text style={[styles.successSub, { color: colors.muted, fontSize: s(15), marginBottom: s(18) }]}>{`You've successfully left the circle.`}</Text>
            <TouchableOpacity 
              style={[styles.btnPrimary, { backgroundColor: colors.accent, borderRadius: s(12), paddingVertical: s(15), marginBottom: s(12) }]} 
              onPress={() => setLeaveModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnText, { color: colors.onAccent, fontSize: s(16) }]}>Done</Text>
            </TouchableOpacity>
          </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Confirm Add Member Modal ── */}
      <Modal visible={confirmAddVisible} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.overlayCenter, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setConfirmAddVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.successSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(20), padding: s(24), width: isSmallDevice ? '80%' : '70%', maxWidth: s(260) }]}>
            <View style={[styles.successIcon, { backgroundColor: colors.accentSoft, width: s(64), height: s(64), borderRadius: s(16), marginBottom: s(14), borderWidth: 1 }]}>
              <Ionicons name="person-add" size={s(52)} color={colors.accent} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text, fontSize: isSmallDevice ? 20 : s(24) }]}>Add Member</Text>
            <Text style={[styles.successSub, { color: colors.muted, fontSize: s(15), marginBottom: s(18) }]}>
              Add {pendingMember?.name} to &ldquo;{pendingMember?.circle?.name}&rdquo;?
            </Text>
            <View style={{ flexDirection: 'row', gap: s(12), width: '100%' }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1, backgroundColor: colors.accentStrong, borderRadius: s(12), paddingVertical: s(15) }]}
                onPress={() => {
                    if (pendingMember) {
                    handleAddMember(pendingMember.circle, pendingMember.name, pendingMember.userId);
                    setAddMemberName('');
                  }
                  setConfirmAddVisible(false);
                  setPendingMember(null);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.btnText, { color: colors.onAccent, fontSize: s(16) }]}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.leaveBtn, { flex: 1, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1 }]}
                onPress={() => {
                  setConfirmAddVisible(false);
                  setPendingMember(null);
                }}
              >
                <Text style={[styles.leaveBtnText, { color: colors.danger, fontSize: s(15) }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Confirm Delete Modal ── */}
      <Modal visible={confirmDelete !== null} transparent animationType="fade">
        <TouchableOpacity style={[styles.overlayCenter, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setConfirmDelete(null)}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.successSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(20), padding: s(24), width: isSmallDevice ? '80%' : '70%', maxWidth: s(260) }]}>
              <View style={[styles.successIcon, { backgroundColor: colors.danger + '20', width: s(64), height: s(64), borderRadius: s(16), marginBottom: s(14), borderWidth: 1, borderColor: colors.danger + '30' }]}>
                <Ionicons name={confirmDelete?.type === 'deleteCircle' ? 'trash-outline' : confirmDelete?.type === 'deleteEvent' ? 'calendar-outline' : 'person-remove-outline'} size={s(32)} color={colors.danger} />
              </View>
              <Text style={[styles.successTitle, { color: colors.text, fontSize: isSmallDevice ? 20 : s(24) }]}>
                {confirmDelete?.type === 'deleteCircle' ? 'Delete Circle' : confirmDelete?.type === 'deleteEvent' ? 'Delete Event' : 'Remove Member'}
              </Text>
              <Text style={[styles.successSub, { color: colors.muted, fontSize: s(15), marginBottom: s(18) }]}>
                {confirmDelete?.type === 'deleteCircle' ? `Delete "${confirmDelete.circle?.name}"? This cannot be undone.` : confirmDelete?.type === 'deleteEvent' ? 'Delete this event?' : `Remove ${confirmDelete?.member} from "${confirmDelete?.circle?.name}"?`}
              </Text>
              <View style={{ flexDirection: 'row', gap: s(12), width: '100%' }}>
                <TouchableOpacity
                  style={[styles.leaveBtn, { flex: 1, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1 }]}
                  onPress={() => {
                    if (!confirmDelete) return;
                    if (confirmDelete.type === 'deleteCircle') {
                      removeCircle(confirmDelete.circle!.id);
                      setDetailCircle(null);
                    } else if (confirmDelete.type === 'removeMember') {
                      const c = confirmDelete.circle!;
                      const m = confirmDelete.member!;
                      const updatedMembers = c.members.filter(mm => mm !== m);
                      const memberIds = { ...(c.memberIds || {}) };
                      const removedUserId = memberIds[m];
                      delete memberIds[m];
                      updateCircle(c.id, { members: updatedMembers, memberIds });
                      setDetailCircle(prev => prev ? { ...prev, members: updatedMembers, memberIds } : null);
                      if (removedUserId) {
                        supabaseDb.deleteCircle(removedUserId, c.id)
                          .catch(err => console.error("Error deleting circle from removed user:", err));
                      }
                    } else if (confirmDelete.type === 'deleteEvent') {
                      deleteCircleEvent(confirmDelete.circleId!, confirmDelete.eventId!);
                    }
                    setConfirmDelete(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={s(15)} color={colors.danger} />
                  <Text style={[styles.leaveBtnText, { color: colors.danger, fontSize: s(15) }]}>
                    {confirmDelete?.type === 'removeMember' ? 'Remove' : 'Delete'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.leaveBtn, { flex: 1, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1 }]}
                  onPress={() => setConfirmDelete(null)}
                >
                  <Text style={[styles.leaveBtnText, { color: colors.muted, fontSize: s(15) }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080B14', paddingTop: Platform.OS === 'android' ? 32 : 0 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
  },
  headerTitle: { color: '#F1F5F9', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: '#475569', fontSize: 13, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#243149',
    justifyContent: 'center', alignItems: 'center',
  },
  iconBtnPrimary: { backgroundColor: '#0F766E', borderColor: '#2DD4BF40' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0F172A', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#243149', overflow: 'hidden', padding: 14,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  avatarWrap: {
    width: 46, height: 46, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardName: { color: '#F1F5F9', fontSize: 15, fontWeight: '700' },
  ownerBadge: {
    backgroundColor: '#6366F120', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: '#6366F140',
  },
  ownerBadgeText: { color: '#818CF8', fontSize: 10, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', gap: 8 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#131C30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { color: '#64748B', fontSize: 11 },
  shareBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#6366F110', borderWidth: 1, borderColor: '#6366F130',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: '#6366F115', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#6366F130',
  },
  emptyTitle: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
  emptySub: { color: '#64748B', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: '#0F172A', borderRadius: 22,
    padding: 24, paddingBottom: 36,
    borderWidth: 1, borderColor: '#243149',
  },
  sheetAccent: { height: 3, width: 36, borderRadius: 2, marginTop: 4, marginBottom: 14 },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: '#F1F5F9' },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#1E2D4A', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#F1F5F9', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  sheetSub: { color: '#475569', fontSize: 13, marginBottom: 22 },
  fieldLabel: { color: '#64748B', fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111827', borderRadius: 12,
    borderWidth: 1, borderColor: '#243149', marginBottom: 14, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#F1F5F9', fontSize: 15, paddingVertical: 13 },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#6366F130', marginBottom: 20,
  },
  codeValue: { color: '#818CF8', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  refreshText: { color: '#818CF8', fontSize: 12 },
  codeInput: {
    backgroundColor: '#131C30', color: '#818CF8', borderRadius: 14,
    borderWidth: 1, borderColor: '#6366F130', marginBottom: 14,
    textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 10,
    paddingVertical: 18,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7F1D1D40', borderRadius: 10, padding: 10, marginBottom: 14,
    borderWidth: 1, borderColor: '#EF444430',
  },
  errorText: { color: '#F87171', fontSize: 13 },
  btnPrimary: {
    backgroundColor: '#0F766E', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelText: { color: '#475569', textAlign: 'center', fontSize: 14, paddingVertical: 4 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  detailAvatar: {
    width: 52, height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  detailName: { color: '#F1F5F9', fontSize: 18, fontWeight: '700' },
  detailSub: { color: '#475569', fontSize: 13, marginTop: 2 },
  shareInlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#6366F110', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#6366F130',
  },
  shareInlineText: { color: '#818CF8', fontSize: 13, fontWeight: '600' },
  membersList: { maxHeight: 200, marginBottom: 16 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#131C30',
  },
  memberAvatar: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  memberInitial: { fontSize: 14, fontWeight: '700' },
  memberName: { color: '#CBD5E1', fontSize: 14, flex: 1 },
  removeMemberBtn: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#EF444415', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#EF444430',
  },
  addMemberBtn: {
    minWidth: 56, height: 36, borderRadius: 10,
    backgroundColor: '#2DD4BF', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 12, marginLeft: 8,
  },
  addMemberBtnText: { color: '#06201F', fontSize: 14, fontWeight: '700' },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EF444415', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#EF444430', marginBottom: 12,
  },
  leaveBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  successSheet: {
    backgroundColor: '#0F172A', borderRadius: 20,
    padding: 24, alignItems: 'center', width: '70%', maxWidth: 260,
    borderWidth: 1, borderColor: '#243149',
  },
  successIcon: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#134E4A30', justifyContent: 'center', alignItems: 'center',
    marginBottom: 14, borderWidth: 1, borderColor: '#2DD4BF40',
  },
  successTitle: { color: '#F1F5F9', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  successSub: { color: '#475569', fontSize: 15, textAlign: 'center', marginBottom: 18, lineHeight: 20 },
  searchResults: {
    marginTop: 6, maxHeight: 160, overflow: 'hidden',
    borderWidth: 1,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1,
  },
  editPermBtn: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#6366F115',
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#131C30',
  },
});
