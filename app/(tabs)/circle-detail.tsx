import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  TextInput, StyleSheet, SafeAreaView, Share, ScrollView, Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import { useAuth, Circle, CircleEvent } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { usePrefs } from '@/context/PrefsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as supabaseDb from '@/lib/supabaseDb';

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export default function CircleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, userId, circles, updateCircle, removeCircle, circleEvents, fetchCircleEvents, addCircleEvent, updateCircleEvent, deleteCircleEvent, toggleMemberEdit } = useAuth();
  const { colors } = useAppTheme();
  const myName = user?.name ?? 'You';
  const { prefs } = usePrefs();
  const compact = !!prefs.compactLayout;
  const { s, isSmallDevice, pad } = useResponsive();

  const circle = useMemo(() => circles.find(c => c.id === id) ?? null, [circles, id]);

  // Add member search
  const [addMemberName, setAddMemberName] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirm add member modal
  const [confirmAddVisible, setConfirmAddVisible] = useState(false);
  const [pendingMember, setPendingMember] = useState<{ name: string; userId?: string; circle: Circle } | null>(null);

  // Circle events form
  const [circleEventFormVisible, setCircleEventFormVisible] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventFormError, setEventFormError] = useState('');

  // Member edit status
  const [memberEditStatus, setMemberEditStatus] = useState<Record<string, boolean>>({});

  // Pickers
  const [circleTimePickerTarget, setCircleTimePickerTarget] = useState<'start' | 'end' | null>(null);
  const [circleDatePickerVisible, setCircleDatePickerVisible] = useState(false);

  // Event detail modal
  const [selectedEvent, setSelectedEvent] = useState<CircleEvent | null>(null);
  const [eventDetailVisible, setEventDetailVisible] = useState(false);

  // Event comments
  const [commentEventId, setCommentEventId] = useState<string | null>(null);
  const [comments, setComments] = useState<supabaseDb.EventComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [togglingLike, setTogglingLike] = useState<string | null>(null);

  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'removeMember' | 'deleteCircle' | 'deleteEvent';
    member?: string;
    circleId?: string;
    eventId?: string;
    memberIds?: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    setAddMemberName('');
    setAddMemberError('');
    setSearchResults([]);
  }, [id]);

  useEffect(() => {
    if (circle) {
      fetchCircleEvents(circle.id);
    }
  }, [circle, fetchCircleEvents]);

  useEffect(() => {
    if (circle && circle.isOwner) {
      const loadStatus = async () => {
        const status: Record<string, boolean> = {};
        for (const [, uid] of Object.entries(circle.memberIds || {})) {
          status[uid] = await supabaseDb.getMemberEditStatus(circle.id, uid);
        }
        setMemberEditStatus(status);
      };
      loadStatus();
    } else {
      setMemberEditStatus({});
    }
  }, [circle]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const val = addMemberName.trim();
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await supabaseDb.searchUsers(val);
      if (val === addMemberName.trim()) {
        setSearchResults(results);
      }
      setSearching(false);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [addMemberName]);

  if (!circle) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: s(16) }}>Circle not found</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/circles')} style={{ marginTop: s(16) }}>
            <Text style={{ color: colors.accent, fontSize: s(14) }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Handlers ──

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my Group-Sync circle on Scheduly! Use my invite code: ${circle.inviteCode}`,
        title: `Join ${circle.name} on Scheduly`,
      });
    } catch {}
  };

  const handleRemoveMember = (member: string) => {
    if (member === myName || !circle) return;
    setConfirmDelete({
      type: 'removeMember',
      member,
      circleId: circle.id,
      memberIds: circle.memberIds || {},
    });
  };

  const handleAddMember = (memberName: string, memberUserId?: string) => {
    if (!circle) return;
    const name = memberName.trim();
    if (!name) { setAddMemberError('Please enter a name.'); return; }
    if (circle.members.includes(name)) { setAddMemberError('Member already exists.'); return; }

    const memberIds = { ...(circle.memberIds || {}) };
    if (memberUserId) memberIds[name] = memberUserId;

    updateCircle(circle.id, { members: [...circle.members, name], memberIds });

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
    setAddMemberError('');
  };

  const handleLeave = () => {
    if (!circle) return;
    if (circle.isOwner) {
      setConfirmDelete({ type: 'deleteCircle', circleId: circle.id });
    } else {
      removeCircle(circle.id);
      router.push('/(tabs)/circles');
    }
  };

  const canManageCircleEvents = (): boolean => {
    if (!circle) return false;
    if (circle.isOwner) return true;
    if (userId && memberEditStatus[userId]) return true;
    return false;
  };

  const openEventDetail = async (evt: CircleEvent) => {
    setSelectedEvent(evt);
    setEventDetailVisible(true);
    setCommentEventId(evt.id);
    setCommentsLoading(true);
    setCommentText('');
    setReplyingTo(null);
    setReplyText('');
    setExpandedReplies(new Set());
    const result = await supabaseDb.getEventComments(evt.id, userId ?? undefined);
    setComments(result);
    setCommentsLoading(false);
  };

  const closeEventDetail = () => {
    setEventDetailVisible(false);
    setSelectedEvent(null);
  };

  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text || !commentEventId || !userId) return;
    setSendingComment(true);
    const comment = await supabaseDb.addEventComment(commentEventId, userId, text);
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setCommentText('');
    }
    setSendingComment(false);
  };

  const handleDeleteComment = (commentId: string) => {
    setDeleteCommentId(commentId);
  };

  const confirmDeleteComment = async () => {
    if (!deleteCommentId || !userId) return;
    const ok = await supabaseDb.deleteEventComment(deleteCommentId, userId);
    if (ok) setComments((prev) => prev.filter((c) => c.id !== deleteCommentId));
    setDeleteCommentId(null);
  };

  const handleToggleLike = async (commentId: string) => {
    if (!userId) return;
    setTogglingLike(commentId);
    const result = await supabaseDb.toggleCommentLike(commentId, userId);
    if (result) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, userLiked: result.liked, likeCount: result.likeCount }
            : c,
        ),
      );
    }
    setTogglingLike(null);
  };

  const handleToggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const handleSendReply = async (parentId: string) => {
    const text = replyText.trim();
    if (!text || !commentEventId || !userId) return;
    setSendingReply(true);
    const reply = await supabaseDb.addEventComment(commentEventId, userId, text, parentId);
    if (reply) {
      setComments((prev) => [...prev, reply]);
      setReplyText('');
      setReplyingTo(null);
    }
    setSendingReply(false);
  };

  const openAddEventForm = () => {
    setEventTitle('');
    setEventDate('');
    setEventStartTime('');
    setEventEndTime('');
    setEventNotes('');
    setEditingEventId(null);
    setEventFormError('');
    setCircleEventFormVisible(true);
  };

  const openEditEventForm = (evt: CircleEvent) => {
    setEventTitle(evt.title);
    setEventDate(evt.date);
    setEventStartTime(evt.startTime);
    setEventEndTime(evt.endTime);
    setEventNotes(evt.notes || '');
    setEditingEventId(evt.id);
    setEventFormError('');
    setCircleEventFormVisible(true);
  };

  const handleSaveEvent = async () => {
    if (!eventTitle.trim()) { setEventFormError('Please enter a title.'); return; }
    if (!eventDate.trim()) { setEventFormError('Please enter a date.'); return; }
    if (!eventStartTime.trim()) { setEventFormError('Please enter a start time.'); return; }
    if (!eventEndTime.trim()) { setEventFormError('Please enter an end time.'); return; }
    if (!circle) return;
    const circleId = circle.id;
    if (editingEventId) {
      const ok = await updateCircleEvent(circleId, editingEventId, {
        title: eventTitle.trim(),
        date: eventDate.trim(),
        startTime: eventStartTime.trim(),
        endTime: eventEndTime.trim(),
        notes: eventNotes.trim() || undefined,
      });
      if (!ok) { setEventFormError('Failed to update event.'); return; }
    } else {
      const evt = await addCircleEvent(circleId, {
        title: eventTitle.trim(),
        date: eventDate.trim(),
        startTime: eventStartTime.trim(),
        endTime: eventEndTime.trim(),
        notes: eventNotes.trim() || undefined,
      });
      if (!evt) { setEventFormError('Failed to create event.'); return; }
    }
    setCircleEventFormVisible(false);
  };

  const handleDeleteEvent = (eventId: string) => {
    if (!circle) return;
    setConfirmDelete({ type: 'deleteEvent', circleId: circle.id, eventId });
  };

  // ── Render ──

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: pad(16, 20), paddingTop: s(12), paddingBottom: s(12) }]}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/circles')} style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border, width: s(36), height: s(36), borderRadius: s(10) }]}>
          <Ionicons name="chevron-back" size={s(20)} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: s(12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <Text style={[styles.headerTitle, { color: colors.text, fontSize: s(18) }]}>{circle.name}</Text>
            {circle.isOwner && (
              <View style={[styles.ownerBadge, { borderRadius: s(6), paddingHorizontal: s(7), paddingVertical: s(2) }]}>
                <Text style={[styles.ownerBadgeText, { fontSize: s(10) }]}>Owner</Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSub, { color: colors.muted, fontSize: s(12) }]}>{circle.members.length} member{circle.members.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={[styles.iconBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '35', width: s(36), height: s(36), borderRadius: s(10) }]}>
          <Ionicons name="share-outline" size={s(17)} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: pad(16, 20), paddingBottom: s(40) }} showsVerticalScrollIndicator={false}>
        {/* Invite Code */}
        <View style={[styles.codeBox, { marginBottom: s(20), backgroundColor: colors.surfaceAlt, borderColor: colors.accent + '35', borderRadius: s(12), padding: pad(12, 16) }]}>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Invite Code</Text>
            <Text style={[styles.codeValue, { color: colors.accent, fontSize: isSmallDevice ? 20 : s(24), letterSpacing: isSmallDevice ? 4 : s(6) }]}>{circle.inviteCode}</Text>
          </View>
        </View>

        {/* Add Member (Owner only) */}
        {circle.isOwner && (
          <View style={{ marginBottom: s(16) }}>
            <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Add Member</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: 0 }]}>
              <TextInput
                style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(13) }]}
                placeholder="Search name or nickname"
                placeholderTextColor={colors.muted}
                value={addMemberName}
                onChangeText={v => { setAddMemberName(v); setAddMemberError(''); }}
              />
              {searching && <Text style={{ color: colors.muted, fontSize: s(11) }}>...</Text>}
            </View>
            {searchResults.length > 0 && (
              <View style={[styles.searchResults, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(12) }]}>
                {searchResults.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.searchResultRow, { borderBottomColor: colors.border, paddingVertical: s(10), paddingHorizontal: s(12) }]}
                    onPress={() => {
                      setPendingMember({ name: u.name, userId: u.id, circle });
                      setConfirmAddVisible(true);
                    }}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: circle.color + '20', width: s(30), height: s(30), borderRadius: s(8) }]}>
                      <Text style={[styles.memberInitial, { color: circle.color, fontSize: s(13) }]}>{u.name[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text, fontSize: s(14) }]}>{u.name}</Text>
                      <Text style={{ color: colors.muted, fontSize: s(11) }}>{u.email}</Text>
                    </View>
                    <Ionicons name="add-circle" size={s(20)} color={colors.accent} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {addMemberError ? (
              <View style={[styles.errorBox, { borderRadius: s(10), padding: s(10), marginTop: s(8) }]}>
                <Ionicons name="alert-circle-outline" size={s(14)} color="#F87171" />
                <Text style={[styles.errorText, { fontSize: s(13) }]}>{addMemberError}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Members */}
        <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Members</Text>
        <View style={{ marginBottom: s(16) }}>
          {circle.members.map((member, i) => {
            const memberUid = circle.memberIds?.[member];
            const canEdit = memberUid ? memberEditStatus[memberUid] : false;
            return (
              <View key={i} style={[styles.memberRow, { borderBottomColor: colors.border, paddingVertical: compact ? s(6) : s(8), gap: s(12), borderBottomWidth: 1 }]}>
                <View style={[styles.memberAvatar, { backgroundColor: circle.color + '20', width: compact ? s(30) : s(34), height: compact ? s(30) : s(34), borderRadius: compact ? s(8) : s(10) }]}>
                  <Text style={[styles.memberInitial, { color: circle.color, fontSize: compact ? s(12) : s(14) }]}>{member[0].toUpperCase()}</Text>
                </View>
                <Text style={[styles.memberName, { color: colors.text, fontSize: compact ? s(13) : s(14) }]}>{member}{member === myName ? ' (You)' : ''}</Text>
                {circle.isOwner && member !== myName && memberUid && (
                  <TouchableOpacity
                    style={[styles.editPermBtn, { width: s(26), height: s(26), borderRadius: s(8), marginRight: s(4) }]}
                    onPress={() =>
                      toggleMemberEdit(circle.id, memberUid, !canEdit).then((ok) => {
                        if (ok) setMemberEditStatus(prev => ({ ...prev, [memberUid]: !canEdit }));
                      })
                    }
                  >
                    <Ionicons name={canEdit ? "create" : "create-outline"} size={s(13)} color={canEdit ? colors.accent : colors.muted} />
                  </TouchableOpacity>
                )}
                {circle.isOwner && member !== myName && (
                  <TouchableOpacity
                    style={[styles.removeMemberBtn, { width: s(26), height: s(26), borderRadius: s(8), borderWidth: 1 }]}
                    onPress={() => handleRemoveMember(member)}
                  >
                    <Ionicons name="close" size={s(14)} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Circle Events */}
        <View style={{ marginBottom: s(16) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(10) }}>
            <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Circle Events</Text>
            {canManageCircleEvents() && (
              <TouchableOpacity onPress={openAddEventForm} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.accent + '35', width: s(28), height: s(28), borderRadius: s(7) }]}>
                <Ionicons name="add" size={s(16)} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
          {(circleEvents[circle.id] || []).length === 0 ? (
            <View style={[styles.emptyState, { borderRadius: s(14), padding: s(24), borderWidth: 1, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={s(28)} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: s(13), marginTop: s(8) }}>No events yet</Text>
            </View>
          ) : (
            (circleEvents[circle.id] || []).map((evt) => (
              <TouchableOpacity
                key={evt.id}
                activeOpacity={0.7}
                onPress={() => openEventDetail(evt)}
                style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(14), marginBottom: s(10), borderWidth: 1, overflow: 'hidden' }]}
              >
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  <View style={{ width: s(4), backgroundColor: circle.color }} />
                  <View style={{ flex: 1, padding: s(14), paddingRight: s(10) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.text, fontSize: s(16), fontWeight: '700', flex: 1 }} numberOfLines={2}>{evt.title}</Text>
                      <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} style={{ marginLeft: s(6), marginTop: s(3) }} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginTop: s(10) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), backgroundColor: colors.accentSoft, borderRadius: s(6), paddingHorizontal: s(8), paddingVertical: s(3) }}>
                        <Ionicons name="calendar-outline" size={s(10)} color={colors.accent} />
                        <Text style={{ color: colors.accent, fontSize: s(11), fontWeight: '600' }}>{evt.date}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), backgroundColor: colors.surfaceAlt, borderRadius: s(6), paddingHorizontal: s(8), paddingVertical: s(3) }}>
                        <Ionicons name="time-outline" size={s(10)} color={colors.muted} />
                        <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600' }}>{evt.startTime}-{evt.endTime}</Text>
                      </View>
                    </View>
                    {evt.notes ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), marginTop: s(8) }}>
                        <Ionicons name="document-text-outline" size={s(11)} color={colors.muted} />
                        <Text style={{ color: colors.muted, fontSize: s(12) }} numberOfLines={1}>{evt.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Leave / Delete */}
        <TouchableOpacity
          style={[styles.leaveBtn, { borderRadius: s(14), paddingVertical: s(14), gap: s(8), marginBottom: s(12), borderWidth: 1 }]}
          onPress={handleLeave}
          activeOpacity={0.8}
        >
          <Ionicons name={circle.isOwner ? 'trash-outline' : 'exit-outline'} size={s(17)} color={colors.danger} />
          <Text style={[styles.leaveBtnText, { color: colors.danger, fontSize: s(15) }]}>{circle.isOwner ? 'Delete Circle' : 'Leave Circle'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Confirm Add Member Modal ── */}
      <Modal visible={confirmAddVisible} transparent animationType="fade">
        <TouchableOpacity style={[styles.overlayCenter, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setConfirmAddVisible(false)}>
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
                      handleAddMember(pendingMember.name, pendingMember.userId);
                      setSearchResults([]);
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
                  onPress={() => { setConfirmAddVisible(false); setPendingMember(null); }}
                >
                  <Text style={[styles.leaveBtnText, { color: colors.danger, fontSize: s(15) }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Event Form Modal ── */}
      <Modal visible={circleEventFormVisible} transparent animationType="fade">
        <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setCircleEventFormVisible(false)}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, padding: pad(18, 24), paddingBottom: s(36), borderRadius: s(22), width: '90%', maxWidth: 400 }]}>
              <Text style={[styles.sheetTitle, { color: colors.text, fontSize: s(20) }]}>{editingEventId ? 'Edit Event' : 'New Event'}</Text>
              <Text style={[styles.sheetSub, { color: colors.muted, fontSize: s(13), marginBottom: s(22) }]}>Add an event for this circle</Text>

              <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Title</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(12) }]}>
                <Ionicons name="text-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(13) }]}
                  placeholder="Event title" placeholderTextColor={colors.muted}
                  value={eventTitle} onChangeText={v => { setEventTitle(v); setEventFormError(''); }}
                />
              </View>

              <TouchableOpacity
                style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(12) }]}
                onPress={() => setCircleDatePickerVisible(true)} activeOpacity={0.7}>
                <Ionicons name="calendar-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                <Text style={[{ color: eventDate ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{eventDate || 'Select date'}</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: s(12) }}>
                <TouchableOpacity
                  style={[styles.inputWrap, { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(12) }]}
                  onPress={() => setCircleTimePickerTarget('start')} activeOpacity={0.7}>
                  <Ionicons name="time-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                  <Text style={[{ color: eventStartTime ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{eventStartTime || 'Start'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inputWrap, { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(12) }]}
                  onPress={() => setCircleTimePickerTarget('end')} activeOpacity={0.7}>
                  <Ionicons name="time-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                  <Text style={[{ color: eventEndTime ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{eventEndTime || 'End'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Notes (optional)</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(14) }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(13) }]}
                  placeholder="Add notes..." placeholderTextColor={colors.muted}
                  value={eventNotes} onChangeText={v => setEventNotes(v)} multiline
                />
              </View>

              {eventFormError ? (
                <View style={[styles.errorBox, { borderRadius: s(10), padding: s(10), marginBottom: s(14) }]}>
                  <Ionicons name="alert-circle-outline" size={s(14)} color="#F87171" />
                  <Text style={[styles.errorText, { fontSize: s(13) }]}>{eventFormError}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.accentStrong, borderRadius: s(12), paddingVertical: s(15), marginBottom: s(12) }]} onPress={handleSaveEvent} activeOpacity={0.85}>
                <Text style={[styles.btnText, { color: colors.onAccent, fontSize: s(16) }]}>{editingEventId ? 'Update Event' : 'Add Event'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCircleEventFormVisible(false)}>
                <Text style={[styles.cancelText, { color: colors.muted, fontSize: s(14) }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Date Picker Modal ── */}
      <Modal visible={circleDatePickerVisible} transparent animationType="fade">
        <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setCircleDatePickerVisible(false)}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, width: '90%', maxWidth: 360, paddingBottom: s(20) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(20), paddingTop: s(18), paddingBottom: s(12) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="calendar-outline" size={s(18)} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700' }}>Select date</Text>
                </View>
                <TouchableOpacity onPress={() => setCircleDatePickerVisible(false)} style={{ paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </View>
              <Calendar
                markedDates={{ [eventDate || '']: { selected: true, selectedColor: colors.accentStrong } }}
                onDayPress={(day: DateData) => { setEventDate(day.dateString); setEventFormError(''); setCircleDatePickerVisible(false); }}
                theme={{
                  calendarBackground: 'transparent', backgroundColor: 'transparent',
                  selectedDayBackgroundColor: colors.accentStrong, selectedDayTextColor: colors.onAccent,
                  todayTextColor: colors.accent, todayBackgroundColor: colors.accentSoft,
                  dayTextColor: colors.text, textDisabledColor: colors.muted,
                  dotColor: colors.accent, selectedDotColor: colors.onAccent,
                  monthTextColor: colors.text, arrowColor: colors.accent,
                  textSectionTitleColor: colors.muted, textDayFontWeight: '500',
                  textMonthFontWeight: '700', textDayHeaderFontWeight: '600',
                }}
                style={{ marginHorizontal: s(8), marginBottom: s(8) }}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Time Picker Modal ── */}
      <Modal visible={circleTimePickerTarget !== null} transparent animationType="slide">
        <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay, justifyContent: 'flex-end' }]} activeOpacity={1} onPress={() => setCircleTimePickerTarget(null)}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: s(22), borderTopRightRadius: s(22), borderWidth: 1, borderColor: colors.border, maxHeight: '55%', paddingBottom: s(34) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(20), paddingTop: s(16), paddingBottom: s(12) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={s(18)} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700' }}>Choose time</Text>
                </View>
                <TouchableOpacity onPress={() => setCircleTimePickerTarget(null)} style={{ paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: s(300) }} showsVerticalScrollIndicator={false}>
                {TIME_SLOTS.map((slot) => {
                  const hour = parseInt(slot.split(':')[0], 10);
                  const period = hour < 12 ? 'AM' : 'PM';
                  const currentVal = circleTimePickerTarget === 'start' ? eventStartTime : eventEndTime;
                  const selected = currentVal === slot;
                  return (
                    <TouchableOpacity key={slot}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: s(14), paddingHorizontal: s(20), borderBottomWidth: 0.5, borderBottomColor: colors.border + '40', backgroundColor: selected ? colors.accent + '12' : 'transparent' }}
                      onPress={() => {
                        if (circleTimePickerTarget === 'start') setEventStartTime(slot);
                        else setEventEndTime(slot);
                        setEventFormError('');
                        setCircleTimePickerTarget(null);
                      }}
                      activeOpacity={0.6}
                    >
                      <Text style={{ color: selected ? colors.accent : colors.text, fontSize: s(17), fontWeight: selected ? '700' : '500', flex: 1 }}>{slot}</Text>
                      <Text style={{ color: selected ? colors.accent : colors.muted, fontSize: s(13), fontWeight: selected ? '600' : '400', marginRight: s(8) }}>{period}</Text>
                      <View style={{ width: s(22), height: s(22), borderRadius: s(11), borderWidth: 2, borderColor: selected ? colors.accent : colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: selected ? colors.accent : 'transparent' }}>
                        {selected && <Ionicons name="checkmark" size={s(14)} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Event Detail Modal ── */}
      <Modal visible={eventDetailVisible} transparent animationType="fade" onRequestClose={closeEventDetail}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' }}>
          <TouchableWithoutFeedback onPress={closeEventDetail}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          </TouchableWithoutFeedback>
          <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, height: '80%', width: '92%', maxWidth: 500, overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(24), paddingTop: s(18), paddingBottom: s(14), borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), flex: 1 }}>
                <View style={{ width: s(36), height: s(36), borderRadius: s(12), backgroundColor: (circle?.color ?? colors.accent) + '20', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="calendar-outline" size={s(20)} color={circle?.color ?? colors.accent} />
                </View>
                <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700', flex: 1 }} numberOfLines={1}>{selectedEvent?.title ?? 'Event'}</Text>
              </View>
              <TouchableOpacity onPress={closeEventDetail} style={{ paddingHorizontal: s(14), paddingVertical: s(8), borderRadius: s(10), backgroundColor: colors.surfaceAlt }}>
                <Text style={{ color: colors.accent, fontSize: s(15), fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Event Details */}
              {selectedEvent && (() => {
                const createdByName = selectedEvent.createdBy === userId
                  ? 'You'
                  : circle?.memberIds
                    ? Object.entries(circle.memberIds).find(([, uid]) => uid === selectedEvent.createdBy)?.[0] ?? selectedEvent.createdBy
                    : selectedEvent.createdBy;
                return (
                <View style={{ paddingHorizontal: s(24), paddingTop: s(18), paddingBottom: s(14) }}>
                  {/* Creator */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(14) }}>
                    <View style={{ width: s(26), height: s(26), borderRadius: s(7), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="person-outline" size={s(13)} color={colors.accent} />
                    </View>
                    <Text style={{ color: colors.muted, fontSize: s(12) }}>Created by <Text style={{ color: colors.text, fontWeight: '600' }}>{createdByName}</Text></Text>
                  </View>

                  {/* Date & Time */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(14) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), backgroundColor: colors.accentSoft, borderRadius: s(6), paddingHorizontal: s(10), paddingVertical: s(4) }}>
                      <Ionicons name="calendar-outline" size={s(11)} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontSize: s(12), fontWeight: '600' }}>{selectedEvent.date}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), backgroundColor: colors.surfaceAlt, borderRadius: s(6), paddingHorizontal: s(10), paddingVertical: s(4) }}>
                      <Ionicons name="time-outline" size={s(11)} color={colors.muted} />
                      <Text style={{ color: colors.muted, fontSize: s(12), fontWeight: '600' }}>{selectedEvent.startTime} - {selectedEvent.endTime}</Text>
                    </View>
                  </View>

                  {/* Notes */}
                  {selectedEvent.notes ? (
                    <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: s(10), padding: s(14), marginBottom: s(14), borderLeftWidth: 3, borderLeftColor: (circle?.color ?? colors.accent) + '60' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginBottom: s(6) }}>
                        <Ionicons name="document-text-outline" size={s(13)} color={colors.muted} />
                        <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600' }}>Notes</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: s(13), lineHeight: s(19) }}>{selectedEvent.notes}</Text>
                    </View>
                  ) : null}

                  {/* Action Buttons */}
                  {canManageCircleEvents() && (
                    <View style={{ flexDirection: 'row', gap: s(10), marginBottom: s(6) }}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(6), backgroundColor: colors.surfaceAlt, borderRadius: s(10), paddingVertical: s(10), borderWidth: 1, borderColor: colors.border }}
                        onPress={() => { closeEventDetail(); openEditEventForm(selectedEvent); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="pencil" size={s(14)} color={colors.muted} />
                        <Text style={{ color: colors.muted, fontSize: s(13), fontWeight: '600' }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(6), backgroundColor: colors.danger + '15', borderRadius: s(10), paddingVertical: s(10), borderWidth: 1, borderColor: colors.danger + '30' }}
                        onPress={() => { closeEventDetail(); handleDeleteEvent(selectedEvent.id); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={s(14)} color={colors.danger} />
                        <Text style={{ color: colors.danger, fontSize: s(13), fontWeight: '600' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );})()}

              {/* Comments Section */}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: s(24), paddingTop: s(14), paddingBottom: s(8) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(12) }}>
                  <Ionicons name="chatbubbles-outline" size={s(16)} color={colors.accent} />
                  <Text style={{ color: colors.text, fontSize: s(15), fontWeight: '700' }}>Comments</Text>
                </View>

                {commentsLoading ? (
                  <Text style={{ color: colors.muted, fontSize: s(14), textAlign: 'center', paddingVertical: s(30) }}>Loading comments...</Text>
                ) : comments.filter((c) => !c.parentId).length === 0 ? (
                  <Text style={{ color: colors.muted, fontSize: s(13), textAlign: 'center', paddingVertical: s(20) }}>No comments yet</Text>
                ) : (
                  comments.filter((c) => !c.parentId).map((pc) => {
                    const replies = comments.filter((r) => r.parentId === pc.id);
                    return (
                      <View key={pc.id}>
                        <View style={{ paddingVertical: s(12), borderBottomWidth: 0.5, borderBottomColor: colors.border + '40' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(4) }}>
                            <View style={{ width: s(26), height: s(26), borderRadius: s(7), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                              <Text style={{ color: colors.accent, fontSize: s(10), fontWeight: '700' }}>{pc.userName.charAt(0).toUpperCase()}</Text>
                            </View>
                            <Text style={{ color: colors.text, fontSize: s(13), fontWeight: '700' }}>{pc.userName}</Text>
                            <Text style={{ color: colors.muted, fontSize: s(10) }}>{new Date(pc.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                            {pc.userId === userId && (
                              <TouchableOpacity onPress={() => handleDeleteComment(pc.id)} style={{ marginLeft: 'auto' }}>
                                <Ionicons name="trash-outline" size={s(13)} color={colors.danger} />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={{ color: colors.text, fontSize: s(13), lineHeight: s(18), paddingLeft: s(34) }}>{pc.text}</Text>

                          {/* Action row */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14), marginTop: s(6), paddingLeft: s(34) }}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}
                              onPress={() => handleToggleLike(pc.id)}
                              disabled={togglingLike === pc.id}
                              activeOpacity={0.7}
                            >
                              <Ionicons name={pc.userLiked ? 'heart' : 'heart-outline'} size={s(13)} color={pc.userLiked ? '#EF4444' : colors.muted} />
                              <Text style={{ color: pc.userLiked ? '#EF4444' : colors.muted, fontSize: s(10), fontWeight: '600' }}>{pc.likeCount || ''}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}
                              onPress={() => {
                                if (replyingTo === pc.id) { setReplyingTo(null); return; }
                                setReplyingTo(pc.id);
                                setReplyText('');
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="chatbubble-ellipses-outline" size={s(13)} color={replyingTo === pc.id ? colors.accent : colors.muted} />
                              <Text style={{ color: replyingTo === pc.id ? colors.accent : colors.muted, fontSize: s(10), fontWeight: '600' }}>{pc.replyCount > 0 ? `${pc.replyCount}` : ''}</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Inline reply input */}
                          {replyingTo === pc.id && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginTop: s(8), paddingLeft: s(34) }}>
                              <TextInput
                                style={[{ backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: s(10), paddingVertical: s(7), fontSize: s(12), color: colors.text, flex: 1, borderWidth: 1 }]}
                                placeholder="Write a reply..."
                                placeholderTextColor={colors.muted}
                                value={replyText}
                                onChangeText={setReplyText}
                                autoFocus
                              />
                              <TouchableOpacity
                                style={{ width: s(30), height: s(30), borderRadius: s(8), backgroundColor: replyText.trim() && !sendingReply ? colors.accentStrong : colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }}
                                onPress={() => handleSendReply(pc.id)}
                                disabled={!replyText.trim() || sendingReply}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="arrow-up" size={s(13)} color={replyText.trim() && !sendingReply ? colors.onAccent : colors.muted} />
                              </TouchableOpacity>
                            </View>
                          )}

                          {/* Replies toggle + replies */}
                          {replies.length > 0 && (
                            <>
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: s(3), marginTop: s(6), paddingLeft: s(34) }}
                                onPress={() => handleToggleReplies(pc.id)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name={expandedReplies.has(pc.id) ? 'chevron-up' : 'chevron-down'} size={s(12)} color={colors.accent} />
                                <Text style={{ color: colors.accent, fontSize: s(10), fontWeight: '600' }}>{expandedReplies.has(pc.id) ? 'Hide replies' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}</Text>
                              </TouchableOpacity>

                              {expandedReplies.has(pc.id) && (
                                <View style={{ marginTop: s(4), backgroundColor: colors.surfaceAlt + '60', borderRadius: s(8), padding: s(2) }}>
                                  {replies.map((r) => (
                                    <View key={r.id} style={{ paddingHorizontal: s(14), paddingVertical: s(8), borderBottomWidth: 0.5, borderBottomColor: colors.border + '30' }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginBottom: s(3) }}>
                                        <View style={{ width: s(20), height: s(20), borderRadius: s(5), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                                          <Text style={{ color: colors.accent, fontSize: s(8), fontWeight: '700' }}>{r.userName.charAt(0).toUpperCase()}</Text>
                                        </View>
                                        <Text style={{ color: colors.text, fontSize: s(11), fontWeight: '700' }}>{r.userName}</Text>
                                        <Text style={{ color: colors.muted, fontSize: s(9) }}>{new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
                                        {r.userId === userId && (
                                          <TouchableOpacity onPress={() => handleDeleteComment(r.id)} style={{ marginLeft: 'auto' }}>
                                            <Ionicons name="trash-outline" size={s(11)} color={colors.danger} />
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                      <Text style={{ color: colors.text, fontSize: s(12), lineHeight: s(16), paddingLeft: s(26) }}>{r.text}</Text>
                                      <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: s(2), marginTop: s(3), paddingLeft: s(26) }}
                                        onPress={() => handleToggleLike(r.id)}
                                        disabled={togglingLike === r.id}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons name={r.userLiked ? 'heart' : 'heart-outline'} size={s(11)} color={r.userLiked ? '#EF4444' : colors.muted} />
                                        <Text style={{ color: r.userLiked ? '#EF4444' : colors.muted, fontSize: s(9), fontWeight: '600' }}>{r.likeCount || ''}</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Comment input spacer */}
              <View style={{ height: s(60) }} />
            </ScrollView>

            {/* Comment input */}
            {!replyingTo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12), paddingHorizontal: s(20), paddingTop: s(12), paddingBottom: s(16), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(20), paddingHorizontal: s(16), paddingVertical: s(10), fontSize: s(13), color: colors.text, flex: 1, borderWidth: 1 }]}
                  placeholder="Write a comment..."
                  placeholderTextColor={colors.muted}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={handleSendComment}
                />
                <TouchableOpacity
                  style={{ width: s(38), height: s(38), borderRadius: s(11), backgroundColor: commentText.trim() && !sendingComment ? colors.accentStrong : colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }}
                  onPress={handleSendComment}
                  disabled={!commentText.trim() || sendingComment}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-up" size={s(17)} color={commentText.trim() && !sendingComment ? colors.onAccent : colors.muted} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Delete Comment Confirmation Modal ── */}
      <Modal visible={deleteCommentId !== null} transparent animationType="fade">
        <TouchableOpacity style={[styles.overlayCenter, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setDeleteCommentId(null)}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.successSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(20), padding: s(24), width: isSmallDevice ? '80%' : '70%', maxWidth: s(260) }]}>
              <View style={[styles.successIcon, { backgroundColor: colors.danger + '20', width: s(64), height: s(64), borderRadius: s(16), marginBottom: s(14), borderWidth: 1, borderColor: colors.danger + '30' }]}>
                <Ionicons name="trash-outline" size={s(32)} color={colors.danger} />
              </View>
              <Text style={[styles.successTitle, { color: colors.text, fontSize: isSmallDevice ? 20 : s(24) }]}>Delete Comment</Text>
              <Text style={[styles.successSub, { color: colors.muted, fontSize: s(15), marginBottom: s(18) }]}>
                This cannot be undone.
              </Text>
              <View style={{ flexDirection: 'row', gap: s(12), width: '100%' }}>
                <TouchableOpacity
                  style={[styles.leaveBtn, { flex: 1, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1 }]}
                  onPress={confirmDeleteComment}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={s(15)} color={colors.danger} />
                  <Text style={[styles.leaveBtnText, { color: colors.danger, fontSize: s(15) }]}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.leaveBtn, { flex: 1, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1 }]}
                  onPress={() => setDeleteCommentId(null)}
                >
                  <Text style={[styles.leaveBtnText, { color: colors.muted, fontSize: s(15) }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Generic Delete Confirmation Modal ── */}
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
                {confirmDelete?.type === 'deleteCircle' ? 'This cannot be undone.' : confirmDelete?.type === 'deleteEvent' ? 'Delete this event?' : `Remove ${confirmDelete?.member} from the circle?`}
              </Text>
              <View style={{ flexDirection: 'row', gap: s(12), width: '100%' }}>
                <TouchableOpacity
                  style={[styles.leaveBtn, { flex: 1, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1 }]}
                  onPress={() => {
                    if (!confirmDelete) return;
                    if (confirmDelete.type === 'removeMember') {
                      const member = confirmDelete.member!;
                      const updatedMembers = circle?.members.filter(m => m !== member) ?? [];
                      const memberIds = { ...(confirmDelete.memberIds || {}) };
                      const removedUserId = memberIds[member];
                      delete memberIds[member];
                      updateCircle(confirmDelete.circleId!, { members: updatedMembers, memberIds });
                      if (removedUserId) {
                        supabaseDb.deleteCircle(removedUserId, confirmDelete.circleId!)
                          .catch(err => console.error("Error deleting circle from removed user:", err));
                      }
                    } else if (confirmDelete.type === 'deleteCircle') {
                      removeCircle(confirmDelete.circleId!);
                      router.push('/(tabs)/circles');
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
  },
  headerTitle: { color: '#F1F5F9', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#475569', fontSize: 12, marginTop: 1 },
  iconBtn: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#243149',
  },
  ownerBadge: {
    backgroundColor: '#6366F120', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: '#6366F140',
  },
  ownerBadgeText: { color: '#818CF8', fontSize: 10, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: '#0F172A', borderRadius: 22,
    padding: 24, paddingBottom: 36,
    borderWidth: 1, borderColor: '#243149',
  },
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
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#131C30',
  },
  memberAvatar: {
    justifyContent: 'center', alignItems: 'center',
  },
  memberInitial: { fontSize: 14, fontWeight: '700' },
  memberName: { color: '#CBD5E1', fontSize: 14, flex: 1 },
  removeMemberBtn: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430',
  },
  editPermBtn: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#6366F115',
  },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#EF444415', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#EF444430', marginBottom: 12,
  },
  leaveBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  eventCard: {
    overflow: 'hidden',
  },
  eventActionBtn: {
    justifyContent: 'center', alignItems: 'center',
  },
  eventChip: {
    flexDirection: 'row', alignItems: 'center',
  },
  eventNotesBox: {},
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    borderStyle: 'dashed',
  },
  searchResults: {
    marginTop: 6, maxHeight: 160, overflow: 'hidden',
    borderWidth: 1,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1,
  },
  successSheet: {
    backgroundColor: '#0F172A', borderRadius: 20, padding: 24,
    alignItems: 'center', width: '70%', maxWidth: 260,
    borderWidth: 1, borderColor: '#243149',
  },
  successIcon: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#134E4A30', justifyContent: 'center', alignItems: 'center',
    marginBottom: 14, borderWidth: 1, borderColor: '#2DD4BF40',
  },
  successTitle: { color: '#F1F5F9', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  successSub: { color: '#475569', fontSize: 15, textAlign: 'center', marginBottom: 18, lineHeight: 20 },
});
