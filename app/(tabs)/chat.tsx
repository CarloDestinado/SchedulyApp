import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity,
  TextInput, StyleSheet, SafeAreaView, Platform, ScrollView,
  Keyboard, Modal, RefreshControl, LayoutAnimation,
  UIManager, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { ThemedText } from '@/components/themed-text';
import * as supabaseDb from '@/lib/supabaseDb';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ActiveConv = { id: string; type: 'dm' | 'circle' };

type ListItem<T> =
  | { type: 'date'; title: string; id: string }
  | { type: 'msg'; data: T & { showSender: boolean }; id: string };

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function processMessages<T extends { createdAt: string; userId: string; userName: string; id: string }>(
  messages: T[],
  myUserId: string,
): ListItem<T>[] {
  if (messages.length === 0) return [];
  const items: ListItem<T>[] = [];
  let lastUserId = '';
  let lastDateStr = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateStr = new Date(msg.createdAt).toDateString();

    if (dateStr !== lastDateStr) {
      items.push({ type: 'date', title: formatDateHeader(msg.createdAt), id: `date-${dateStr}` });
      lastUserId = '';
      lastDateStr = dateStr;
    }

    const showSender = msg.userId !== lastUserId;
    if (msg.userId !== myUserId) lastUserId = msg.userId;
    else lastUserId = '';

    items.push({ type: 'msg', data: { ...msg, showSender }, id: msg.id });
  }

  return items;
}

export default function ChatScreen() {
  const { colors } = useAppTheme();
  const { s, isSmallDevice, pad } = useResponsive();
  const {
    user, userId, circles, chatMessages,
    conversations, conversationMessages, fetchChatMessages,
    fetchConversations, fetchConversationMessages, sendChatMessage,
    getOrCreateDMConversation, sendConversationMessage,
    deleteConversationMessage, deleteCircleChatMessage,
    leaveConversation, removeCircle, toggleReaction,
    applyConvMsgPayload,
  } = useAuth();

  const myName = user?.name ?? 'You';

  // ── State ──────────────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeConv, setActiveConv] = useState<ActiveConv | null>(null);
  const [convInput, setConvInput] = useState('');
  const convSubRef = useRef<(() => void) | null>(null);
  const typingSubRef = useRef<(() => void) | null>(null);

  // Keyboard avoidance
  const [kbHeight, setKbHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll-to-bottom FAB
  const flatListRef = useRef<FlatList>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);

  const onScroll = (e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const visibleHeight = e.nativeEvent.layoutMeasurementHeight;
    const contentH = e.nativeEvent.contentSizeHeight;
    const bottomDist = contentH - offsetY - visibleHeight;
    setShowScrollFab(bottomDist > 200);
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const fetchCircleMsgs = circles.map(c => fetchChatMessages(c.id));
    await Promise.all([fetchConversations(), ...fetchCircleMsgs]);
    setRefreshing(false);
  }, [fetchConversations, fetchChatMessages, circles]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const [membersVisible, setMembersVisible] = useState(false);
  const [dmInfoVisible, setDmInfoVisible] = useState(false);

  // ── Reactions ──────────────────────────────────────────────────────────────
  const REACTION_EMOJIS = ['❤️', '👍', '😂', '🎉', '🔥', '💯'];
  const [reactingToMessage, setReactingToMessage] = useState<{ id: string; isOwn: boolean; pageY: number } | null>(null);
  const convAreaRef = useRef<View>(null);
  const convScreenY = useRef(0);

  // Measure conversation area screen Y on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      convAreaRef.current?.measureInWindow?.((_x, y) => { convScreenY.current = y ?? 0; });
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // ── Delete message ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'dm' | 'circle'; text: string } | null>(null);

  // ── Leave/Delete conversation confirmation ──────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<'leaveCircle' | 'deleteConv' | null>(null);

  const myCircles = circles.filter(c => c.members.some(m => m === myName || m === 'You'));

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const val = searchText.trim();
    if (val.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const results = await supabaseDb.searchUsers(val);
      if (val === searchText.trim()) setSearchResults(results);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchText]);

  // ── Load conversations ─────────────────────────────────────────────────────
  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Typing broadcast ──────────────────────────────────────────────────────
  const broadcastTyping = useCallback(() => {
    if (!activeConv) return;
    const channelName = activeConv.type === 'dm' ? `conv-${activeConv.id}` : `circle-${activeConv.id}`;
    supabaseDb.broadcastTyping(channelName, myName);
  }, [activeConv, myName]);

  const onConvInputChange = useCallback((text: string) => {
    setConvInput(text);
    if (!text.trim()) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    broadcastTyping();
    typingTimer.current = setTimeout(() => {}, 2000);
  }, [broadcastTyping]);

  // ── Open DM conversation ───────────────────────────────────────────────────
  const openDM = useCallback(async (convId: string) => {
    setActiveConv({ id: convId, type: 'dm' });
    setTypingUsers([]);
    if (convSubRef.current) convSubRef.current();
    if (typingSubRef.current) typingSubRef.current();
    convSubRef.current = supabaseDb.onConversationMessagesChange(
      [convId],
      (payload) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
          applyConvMsgPayload(convId, payload);
        }
      },
    );
    typingSubRef.current = supabaseDb.onTypingChange(
      `conv-${convId}`,
      (users) => setTypingUsers(users.filter(u => u !== myName)),
    );
    await fetchConversationMessages(convId);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
  }, [fetchConversationMessages, myName, applyConvMsgPayload]);

  const startDM = useCallback(async (otherUserId: string) => {
    const convId = await getOrCreateDMConversation(otherUserId);
    if (convId) { openDM(convId); await fetchConversations(); }
  }, [getOrCreateDMConversation, openDM, fetchConversations]);

  // ── Open circle chat ───────────────────────────────────────────────────────
  const openCircleChat = useCallback(async (circleId: string) => {
    setActiveConv({ id: circleId, type: 'circle' });
    setTypingUsers([]);
    if (convSubRef.current) convSubRef.current();
    if (typingSubRef.current) typingSubRef.current();
    convSubRef.current = supabaseDb.onMessagesChange(
      [circleId],
      () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); },
    );
    typingSubRef.current = supabaseDb.onTypingChange(
      `circle-${circleId}`,
      (users) => setTypingUsers(users.filter(u => u !== myName)),
    );
    await fetchChatMessages(circleId);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
  }, [fetchChatMessages, myName]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSendDM = useCallback(() => {
    if (!activeConv || activeConv.type !== 'dm' || !convInput.trim()) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    sendConversationMessage(activeConv.id, convInput.trim());
    setConvInput('');
    setTimeout(() => scrollToBottom(), 150);
  }, [activeConv, convInput, sendConversationMessage]);

  const handleSendCircle = useCallback(() => {
    if (!activeConv || activeConv.type !== 'circle' || !convInput.trim()) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    sendChatMessage(activeConv.id, convInput.trim());
    setConvInput('');
    setTimeout(() => scrollToBottom(), 150);
  }, [activeConv, convInput, sendChatMessage]);

  const handleSend = activeConv?.type === 'dm' ? handleSendDM : handleSendCircle;

  // ── Polling ─────────────────────────────────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeConv) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => {
      fetchConversations();
      if (activeConv.type === 'dm') {
        fetchConversationMessages(activeConv.id);
      } else {
        fetchChatMessages(activeConv.id);
      }
    }, 3000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [activeConv, fetchConversationMessages, fetchChatMessages, fetchConversations]);

  // ── Cleanup subscriptions ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (convSubRef.current) convSubRef.current();
      if (typingSubRef.current) typingSubRef.current();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Messages for active conversation ───────────────────────────────────────
  const activeDMMessages = useMemo(
    () => (activeConv?.type === 'dm' ? conversationMessages[activeConv.id] : []) ?? [],
    [activeConv?.id, activeConv?.type, conversationMessages],
  );
  const activeCircleMessages = useMemo(
    () => (activeConv?.type === 'circle' ? chatMessages[activeConv.id] : []) ?? [],
    [activeConv?.id, activeConv?.type, chatMessages],
  );

  // ── Auto-scroll to newest when conversation opens or messages load ─────────
  useEffect(() => {
    if (!activeConv) return;
    const maxMsgs = activeConv.type === 'dm' ? activeDMMessages.length : activeCircleMessages.length;
    if (maxMsgs === 0) return;
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConv?.id, activeDMMessages.length, activeCircleMessages.length]);

  const activeCircle = activeConv?.type === 'circle'
    ? circles.find(c => c.id === activeConv.id) ?? null
    : null;

  const convPreview = activeConv?.type === 'dm'
    ? conversations.find(c => c.id === activeConv.id) ?? null
    : null;

  // ── Process messages into flat list items ─────────────────────────────────
  const circleItems = useMemo(
    () => processMessages(activeCircleMessages, userId ?? ''),
    [activeCircleMessages, userId],
  );
  const dmItems = useMemo(
    () => processMessages(activeDMMessages, userId ?? ''),
    [activeDMMessages, userId],
  );

  // ── Last message preview for circles ───────────────────────────────────────
  const circleLastMsg = useCallback((circleId: string): string => {
    const msgs = chatMessages[circleId];
    if (!msgs || msgs.length === 0) return '';
    const last = msgs[msgs.length - 1];
    return last.userName === myName ? `You: ${last.text}` : `${last.userName}: ${last.text}`;
  }, [chatMessages, myName]);

  const circleLastTime = useCallback((circleId: string): string => {
    const msgs = chatMessages[circleId];
    if (!msgs || msgs.length === 0) return '';
    return msgs[msgs.length - 1].createdAt;
  }, [chatMessages]);

  const sortedDMs = useMemo(
    () => [...conversations].sort((a, b) => {
      const aMsgs = conversationMessages[a.id];
      const bMsgs = conversationMessages[b.id];
      const aTime = aMsgs?.length ? aMsgs[aMsgs.length - 1].createdAt : (a.lastMessageAt || '');
      const bTime = bMsgs?.length ? bMsgs[bMsgs.length - 1].createdAt : (b.lastMessageAt || '');
      return bTime.localeCompare(aTime);
    }),
    [conversations, conversationMessages],
  );

  const sortedCircles = useMemo(
    () => [...myCircles].sort((a, b) => (circleLastTime(b.id) || '').localeCompare(circleLastTime(a.id) || '')),
    [myCircles, circleLastTime],
  );

  const goBack = () => {
    setActiveConv(null);
    setTypingUsers([]);
    if (convSubRef.current) convSubRef.current();
    convSubRef.current = null;
    if (typingSubRef.current) typingSubRef.current();
    typingSubRef.current = null;
  };

  // ── Pull to refresh conversation messages ──────────────────────────────────
  const onConvRefresh = useCallback(async () => {
    if (!activeConv) return;
    setListRefreshing(true);
    if (activeConv.type === 'dm') {
      await fetchConversationMessages(activeConv.id);
    } else {
      await fetchChatMessages(activeConv.id);
    }
    setListRefreshing(false);
  }, [activeConv, fetchConversationMessages, fetchChatMessages]);

  // ── Render: conversation list ──────────────────────────────────────────────
  const renderConversationList = () => (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), marginBottom: s(14) }]}>
        <Ionicons name="search" size={s(16)} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text, fontSize: s(14) }]}
          placeholder="Search users to message..."
          placeholderTextColor={colors.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchText(''); setSearchResults([]); }}>
            <Ionicons name="close-circle" size={s(16)} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {searchResults.length > 0 && (
        <View style={[styles.searchResults, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(10) }]}>
          <Text style={[styles.searchLabel, { color: colors.muted, fontSize: s(11) }]}>Users</Text>
          {searchResults.map(u => (
            <TouchableOpacity
              key={u.id}
              style={[styles.searchRow, { borderBottomColor: colors.border }]}
              onPress={() => { setSearchText(''); setSearchResults([]); startDM(u.id); }}
            >
              <View style={[styles.userAvatar, { backgroundColor: colors.accent + '20' }]}>
                <Text style={[styles.userInitial, { color: colors.accent, fontSize: s(14) }]}>{u.name[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.text, fontSize: s(14) }]}>{u.name}{u.id === userId ? ' (You)' : ''}</Text>
                <Text style={[styles.userEmail, { color: colors.muted, fontSize: s(11) }]}>{u.email}</Text>
              </View>
              <Ionicons name="chatbubble-outline" size={s(16)} color={colors.accent} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        {sortedCircles.length > 0 && (
          <View style={{ marginBottom: s(20) }}>
            <Text style={[styles.sectionLabel, { color: colors.muted, fontSize: s(11) }]}>Circle Chats</Text>
            {sortedCircles.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.convRow, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(12) }]}
                onPress={() => openCircleChat(c.id)}
              >
                <View style={[styles.convAvatar, { backgroundColor: c.color + '20', borderRadius: s(10) }]}>
                  <Ionicons name="people" size={s(18)} color={c.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.convName, { color: colors.text, fontSize: s(14) }]}>{c.name}</Text>
                  <Text style={[styles.convPreview, { color: colors.muted, fontSize: s(12) }]} numberOfLines={1}>
                    {circleLastMsg(c.id) || 'No messages yet'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {sortedDMs.length > 0 && (
          <View style={{ marginBottom: s(20) }}>
            <Text style={[styles.sectionLabel, { color: colors.muted, fontSize: s(11) }]}>Direct Messages</Text>
            {sortedDMs.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.convRow, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(12) }]}
                onPress={() => openDM(c.id)}
              >
                <View style={[styles.convAvatar, { backgroundColor: colors.accent + '20', borderRadius: s(10) }]}>
                  <Text style={[styles.userInitial, { color: colors.accent, fontSize: s(16) }]}>{c.otherUserName[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.convName, { color: colors.text, fontSize: s(14) }]}>{c.otherUserName}</Text>
                  <Text style={[styles.convPreview, { color: colors.muted, fontSize: s(12) }]} numberOfLines={1}>
                    {c.lastMessage || 'Start chatting'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={s(16)} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {myCircles.length === 0 && conversations.length === 0 && searchResults.length === 0 && (
          <View style={[styles.emptyWrap, { paddingTop: s(60) }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '30' }]}>
              <Ionicons name="chatbubbles-outline" size={s(28)} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.muted, fontSize: s(16) }]}>No conversations yet</Text>
            <Text style={[styles.emptySub, { color: colors.muted, fontSize: s(13) }]}>Search for a user above to start a chat</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  // ── Handle reaction toggle ─────────────────────────────────────────────────
  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!activeConv) return;
    await toggleReaction(messageId, emoji, activeConv.type === 'circle');
  }, [activeConv, toggleReaction]);

  // ── Render: reaction pills ─────────────────────────────────────────────────
  const renderReactions = (msg: any) => {
    const reactions = msg.reactions ?? [];
    // Group by emoji
    const grouped: Record<string, { count: number; users: string[] }> = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [] };
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.userId);
    }
    const emojis = Object.keys(grouped);
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(4), marginTop: s(6) }}>
        {emojis.map((emoji) => {
          const myReaction = msg.userReaction === emoji;
          return (
            <TouchableOpacity
              key={emoji}
              onPress={() => handleToggleReaction(msg.id, emoji)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: s(2),
                paddingHorizontal: s(6), paddingVertical: s(2),
                borderRadius: s(10),
                backgroundColor: myReaction ? colors.accent + '25' : colors.surfaceAlt,
                borderWidth: 1,
                borderColor: myReaction ? colors.accent + '40' : 'transparent',
              }}
              activeOpacity={0.6}
              accessibilityLabel={`${emoji} ${grouped[emoji].count}`}
            >
              <Text style={{ fontSize: s(12) }}>{emoji}</Text>
              <Text style={{ color: colors.muted, fontSize: s(10), fontWeight: '600', fontFamily: 'Inter_600SemiBold' }}>{grouped[emoji].count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ── Render: grouped message bubble ─────────────────────────────────────────
  const renderGroupedMessage = (
    msg: any,
    showSender: boolean,
    isMe: boolean,
    circleColor?: string,
  ) => {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={(e) => handleMessageLongPress(msg, isMe, e)}
        delayLongPress={500}
        accessibilityLabel="Press and hold to react"
      >
        <View style={[
          styles.msgBubble,
          {
            alignSelf: isMe ? 'flex-end' : 'flex-start',
            backgroundColor: isMe
              ? (activeConv?.type === 'circle' ? (circleColor ?? colors.accentStrong) : colors.accentStrong)
              : colors.surfaceAlt,
            borderTopLeftRadius: isMe ? s(14) : s(4),
            borderTopRightRadius: isMe ? s(4) : s(14),
            borderBottomLeftRadius: s(14),
            borderBottomRightRadius: s(14),
            marginTop: showSender ? s(8) : s(2),
          },
        ]}>
          {!isMe && showSender && (
            <Text style={[styles.msgSender, {
              color: activeConv?.type === 'circle' ? (circleColor ?? colors.accent) : colors.accent,
              fontSize: s(13),
            }]}>
              {msg.userName}
            </Text>
          )}
          <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.text, fontSize: s(16) }]}>{msg.text}</Text>
          <Text style={[styles.msgTime, { color: isMe ? '#ffffff99' : colors.muted, fontSize: s(12) }]}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {renderReactions(msg)}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Long-press on message body opens reaction picker ──────────────────────
  const handleMessageLongPress = (msg: any, isMe: boolean, evt: any) => {
    const pageY = evt?.nativeEvent?.pageY ?? 0;
    setReactingToMessage({ id: msg.id, isOwn: isMe, pageY });
  };

  // ── Render: date separator ─────────────────────────────────────────────────
  const renderDateSeparator = (title: string) => (
    <View style={{ alignItems: 'center', marginVertical: s(12) }}>
      <View style={{ paddingHorizontal: s(12), paddingVertical: s(4), borderRadius: s(10), backgroundColor: colors.surfaceAlt }}>
        <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '600', fontFamily: 'Inter_600SemiBold' }}>{title}</Text>
      </View>
    </View>
  );

  // ── Render: typing indicator ───────────────────────────────────────────────
  const typingText = typingUsers.length > 0
    ? typingUsers.length === 1
      ? `${typingUsers[0]} is typing...`
      : `${typingUsers.join(', ')} are typing...`
    : null;

  // ── Delete confirmation ────────────────────────────────────────────────────
  const confirmDelete = () => {
    if (!deleteTarget) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (deleteTarget.type === 'dm') {
      deleteConversationMessage(deleteTarget.id);
    } else {
      deleteCircleChatMessage(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  // ── Render: active conversation ────────────────────────────────────────────
  const renderConversation = () => {
    const isCircle = activeConv?.type === 'circle';
    const inputBottomPad = Platform.OS === 'android' ? Math.max(0, kbHeight - 55) : 0;
    const currentItems = isCircle ? circleItems : dmItems;
    const circleColor = activeCircle?.color ?? colors.accent;

    const renderListItem = ({ item }: { item: ListItem<any> }) => {
      if (item.type === 'date') {
        return renderDateSeparator(item.title);
      }
      const msg = item.data;
      const isMe = msg.userId === userId;
      return renderGroupedMessage(msg, msg.showSender, isMe, circleColor);
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.convHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={goBack}>
            <Ionicons name="arrow-back" size={s(22)} color={colors.accent} />
          </TouchableOpacity>
          {isCircle ? (
            <>
              <View style={[styles.convAvatarSmall, { backgroundColor: (activeCircle?.color ?? colors.accent) + '20', borderRadius: s(8), marginLeft: s(10) }]}>
                <Ionicons name="people" size={s(16)} color={activeCircle?.color ?? colors.accent} />
              </View>
              <Text style={[styles.convHeaderName, { color: colors.text, fontSize: s(16), marginLeft: s(8) }]}>{activeCircle?.name ?? 'Circle'}</Text>
              <TouchableOpacity onPress={() => setMembersVisible(true)} style={[styles.iconBtnSmall, { backgroundColor: colors.surfaceAlt, borderRadius: s(8), width: s(32), height: s(32) }]} accessibilityLabel="View circle members" accessibilityRole="button">
                <Ionicons name="information-circle-outline" size={s(18)} color={colors.muted} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.convAvatarSmall, { backgroundColor: colors.accent + '20', borderRadius: s(8), marginLeft: s(10) }]}>
                <Text style={[styles.userInitial, { color: colors.accent, fontSize: s(14) }]}>{convPreview?.otherUserName[0].toUpperCase() ?? '?'}</Text>
              </View>
              <Text style={[styles.convHeaderName, { color: colors.text, fontSize: s(16), marginLeft: s(8) }]}>{convPreview?.otherUserName ?? 'Chat'}</Text>
              <TouchableOpacity
                onPress={() => setDmInfoVisible(true)}
                style={[styles.iconBtnSmall, { backgroundColor: colors.surfaceAlt, borderRadius: s(8), width: s(32), height: s(32) }]}
                accessibilityLabel="View conversation info"
                accessibilityRole="button"
              >
                <Ionicons name="information-circle-outline" size={s(18)} color={colors.muted} />
              </TouchableOpacity>
            </>
          )}
        </View>

        <View ref={convAreaRef} style={{ flex: 1, position: 'relative' }}>
          <FlatList
            ref={flatListRef}
            data={currentItems}
            keyExtractor={(item: ListItem<any>) => item.id}
            contentContainerStyle={{ padding: s(12), paddingBottom: s(60) }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={renderListItem}
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshing={listRefreshing}
            onRefresh={onConvRefresh}
            onContentSizeChange={() => {
              if (currentItems.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
            ListFooterComponent={
              typingText ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), paddingLeft: s(4), paddingBottom: s(8) }}>
                  <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: colors.muted }} />
                  <Text style={{ color: colors.muted, fontSize: s(12), fontStyle: 'italic', fontFamily: 'Inter_400Regular' }}>{typingText}</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={[styles.emptyWrap, { paddingTop: s(40) }]}>
                <Text style={[styles.emptySub, { color: colors.muted, fontSize: s(13) }]}>No messages yet. Say hello!</Text>
              </View>
            }
          />

          {showScrollFab && (
            <TouchableOpacity
              style={[styles.scrollFab, { backgroundColor: colors.accent }]}
              onPress={scrollToBottom}
              activeOpacity={0.8}
              accessibilityLabel="Scroll to bottom"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-down" size={s(20)} color={colors.onAccent} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, marginBottom: inputBottomPad }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text, borderRadius: s(12), fontSize: s(14) }]}
            placeholder={'Type a message...'}
            placeholderTextColor={colors.muted}
            value={convInput}
            onChangeText={onConvInputChange}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: convInput.trim() ? (isCircle ? (activeCircle?.color ?? colors.accentStrong) : colors.accentStrong) : colors.surfaceAlt, borderRadius: s(10), width: s(38), height: s(38) }]}
            onPress={handleSend}
            disabled={!convInput.trim()}
            accessibilityLabel="Send message"
            accessibilityRole="button"
            accessibilityState={{ disabled: !convInput.trim() }}
          >
            <Ionicons name="send" size={s(16)} color={convInput.trim() ? colors.onAccent : colors.muted} />
          </TouchableOpacity>
        </View>

        <Modal visible={membersVisible} transparent animationType="fade" onRequestClose={() => setMembersVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMembersVisible(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: s(16), width: '85%', maxWidth: 340, maxHeight: '70%' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(16) }}>
                <View style={[styles.convAvatarSmall, { backgroundColor: (activeCircle?.color ?? colors.accent) + '20', borderRadius: s(10), width: s(36), height: s(36) }]}>
                  <Ionicons name="people" size={s(18)} color={activeCircle?.color ?? colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: s(16), fontWeight: '700', fontFamily: 'Inter_700Bold' }}>{activeCircle?.name ?? 'Circle'}</Text>
                  <Text style={{ color: colors.muted, fontSize: s(12) }}>{activeCircle?.members.length ?? 0} member{(activeCircle?.members.length ?? 0) !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {activeCircle?.members.map((member, i) => (
                  <View key={i} style={[styles.memberRow, { borderBottomColor: colors.border, paddingVertical: s(10), gap: s(12) }]}>
                    <View style={[styles.memberAvatar, { backgroundColor: (activeCircle?.color ?? colors.accent) + '20', width: s(34), height: s(34), borderRadius: s(10) }]}>
                      <Text style={[styles.memberInitial, { color: activeCircle?.color ?? colors.accent, fontSize: s(14) }]}>{member[0].toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.memberName, { color: colors.text, fontSize: s(14) }]}>{member}{member === myName ? ' (You)' : ''}</Text>
                  </View>
                ))}
              </ScrollView>
              {isCircle && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), marginTop: s(16), paddingVertical: s(12), borderRadius: s(12), backgroundColor: colors.danger + '15' }}
                  onPress={() => { setMembersVisible(false); setConfirmAction('leaveCircle'); }}
                  activeOpacity={0.7}
                  accessibilityLabel="Leave this circle"
                  accessibilityRole="button"
                >
                  <Ionicons name="exit-outline" size={s(18)} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontSize: s(14), fontWeight: '700', fontFamily: 'Inter_700Bold' }}>Leave Circle</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── DM Info Modal ── */}
        <Modal visible={dmInfoVisible} transparent animationType="fade" onRequestClose={() => setDmInfoVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDmInfoVisible(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: s(16), width: '85%', maxWidth: 340 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginBottom: s(16) }}>
                <View style={[styles.convAvatarSmall, { backgroundColor: colors.accent + '20', borderRadius: s(10), width: s(36), height: s(36) }]}>
                  <Ionicons name="person" size={s(18)} color={colors.accent} />
                </View>
                <Text style={{ color: colors.text, fontSize: s(16), fontWeight: '700', flex: 1, fontFamily: 'Inter_700Bold' }}>{convPreview?.otherUserName ?? 'Chat'}</Text>
              </View>
              <View style={[styles.memberRow, { borderBottomColor: colors.border, paddingVertical: s(10), gap: s(12) }]}>
                <View style={[styles.memberAvatar, { backgroundColor: colors.accent + '20', width: s(34), height: s(34), borderRadius: s(10) }]}>
                  <Text style={[styles.memberInitial, { color: colors.accent, fontSize: s(14) }]}>{myName[0].toUpperCase()}</Text>
                </View>
                <Text style={[styles.memberName, { color: colors.text, fontSize: s(14) }]}>{myName} (You)</Text>
              </View>
              <View style={[styles.memberRow, { borderBottomColor: colors.border, paddingVertical: s(10), gap: s(12) }]}>
                <View style={[styles.memberAvatar, { backgroundColor: colors.accent + '20', width: s(34), height: s(34), borderRadius: s(10) }]}>
                  <Text style={[styles.memberInitial, { color: colors.accent, fontSize: s(14) }]}>{convPreview?.otherUserName[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={[styles.memberName, { color: colors.text, fontSize: s(14) }]}>{convPreview?.otherUserName ?? 'Unknown'}</Text>
              </View>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), marginTop: s(16), paddingVertical: s(12), borderRadius: s(12), backgroundColor: colors.danger + '15' }}
                onPress={() => { setDmInfoVisible(false); setConfirmAction('deleteConv'); }}
                activeOpacity={0.7}
                accessibilityLabel="Delete this conversation"
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={s(18)} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: s(14), fontWeight: '700', fontFamily: 'Inter_700Bold' }}>Delete Conversation</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Delete Message Confirmation ── */}
        <Modal visible={deleteTarget !== null} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDeleteTarget(null)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: s(20), width: '82%', maxWidth: 320, padding: s(24), alignItems: 'center' }]}>
              <View style={{ width: s(52), height: s(52), borderRadius: s(16), backgroundColor: colors.danger + '18', justifyContent: 'center', alignItems: 'center', marginBottom: s(14) }}>
                <Ionicons name="trash-outline" size={s(24)} color={colors.danger} />
              </View>
              <Text style={{ color: colors.text, fontSize: s(17), fontWeight: '700', marginBottom: s(8), textAlign: 'center', fontFamily: 'Inter_700Bold' }}>Delete Message?</Text>
              <Text style={{ color: colors.muted, fontSize: s(13), textAlign: 'center', lineHeight: s(20), marginBottom: s(22), fontFamily: 'Inter_400Regular' }} numberOfLines={2}>
                &ldquo;{deleteTarget?.text}&rdquo;
              </Text>
              <View style={{ flexDirection: 'row', gap: s(10), width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', paddingVertical: s(13), borderRadius: s(12), backgroundColor: colors.surfaceAlt }}
                  onPress={() => setDeleteTarget(null)}
                  activeOpacity={0.7}
                  accessibilityLabel="Cancel delete"
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.text, fontSize: s(14), fontWeight: '600', fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', paddingVertical: s(13), borderRadius: s(12), backgroundColor: colors.danger }}
                  onPress={confirmDelete}
                  activeOpacity={0.7}
                  accessibilityLabel="Confirm delete message"
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#fff', fontSize: s(14), fontWeight: '700', fontFamily: 'Inter_700Bold' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Reaction Picker ── */}
        {reactingToMessage && (
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setReactingToMessage(null)}
            accessibilityLabel="Close reaction picker"
          >
            <View style={{
              position: 'absolute',
              top: Math.max(s(4), reactingToMessage.pageY - convScreenY.current - s(45)),
              left: 0, right: 0,
              alignItems: 'center',
            }}>
              <View
                style={{
                  flexDirection: 'row', gap: s(4), paddingVertical: s(8), paddingHorizontal: s(12),
                  backgroundColor: colors.surface, borderRadius: s(16),
                  borderWidth: 1, borderColor: colors.border,
                  elevation: 8,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3, shadowRadius: 8,
                }}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => {
                      handleToggleReaction(reactingToMessage.id, emoji);
                      setReactingToMessage(null);
                    }}
                    style={{
                      width: s(36), height: s(36), borderRadius: s(18),
                      justifyContent: 'center', alignItems: 'center',
                    }}
                    activeOpacity={0.6}
                    accessibilityLabel={`React with ${emoji}`}
                  >
                    <Text style={{ fontSize: s(22) }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                {reactingToMessage.isOwn && (
                  <TouchableOpacity
                    onPress={() => {
                      const msgId = reactingToMessage.id;
                      setReactingToMessage(null);
                      // Find message text for the delete modal
                      const allMsgs = isCircle ? activeCircleMessages : activeDMMessages;
                      const found = allMsgs.find((m: any) => m.id === msgId);
                      setDeleteTarget({ id: msgId, type: isCircle ? 'circle' : 'dm', text: found?.text ?? '' });
                    }}
                    style={{
                      width: s(36), height: s(36), borderRadius: s(18),
                      justifyContent: 'center', alignItems: 'center',
                    }}
                    activeOpacity={0.6}
                    accessibilityLabel="Delete this message"
                  >
                    <Ionicons name="trash-outline" size={s(18)} color={colors.danger} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setReactingToMessage(null)}
                  style={{
                    width: s(36), height: s(36), borderRadius: s(18),
                    justifyContent: 'center', alignItems: 'center',
                  }}
                  activeOpacity={0.6}
                  accessibilityLabel="Close reaction picker"
                >
                  <Ionicons name="close" size={s(18)} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Leave/Delete Conversation Confirmation ── */}
        <Modal visible={confirmAction !== null} transparent animationType="fade" onRequestClose={() => setConfirmAction(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setConfirmAction(null)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: s(20), width: '82%', maxWidth: 320, padding: s(24), alignItems: 'center' }]}>
              <View style={{ width: s(52), height: s(52), borderRadius: s(16), backgroundColor: colors.danger + '18', justifyContent: 'center', alignItems: 'center', marginBottom: s(14) }}>
                <Ionicons name="trash-outline" size={s(24)} color={colors.danger} />
              </View>
              <Text style={{ color: colors.text, fontSize: s(17), fontWeight: '700', marginBottom: s(8), textAlign: 'center', fontFamily: 'Inter_700Bold' }}>
                {confirmAction === 'leaveCircle' ? 'Leave Circle?' : 'Delete Conversation?'}
              </Text>
              <Text style={{ color: colors.muted, fontSize: s(13), textAlign: 'center', lineHeight: s(20), marginBottom: s(22), fontFamily: 'Inter_400Regular' }}>
                {confirmAction === 'leaveCircle'
                  ? `Remove "${activeCircle?.name}" and its messages?`
                  : `Remove "${convPreview?.otherUserName}" from your DMs?`}
              </Text>
              <View style={{ flexDirection: 'row', gap: s(10), width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', paddingVertical: s(13), borderRadius: s(12), backgroundColor: colors.surfaceAlt }}
                  onPress={() => setConfirmAction(null)}
                  activeOpacity={0.7}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.text, fontSize: s(14), fontWeight: '600', fontFamily: 'Inter_600SemiBold' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', paddingVertical: s(13), borderRadius: s(12), backgroundColor: colors.danger }}
                  onPress={() => {
                    if (confirmAction === 'leaveCircle' && activeConv) {
                      removeCircle(activeConv.id);
                      setActiveConv(null);
                    } else if (confirmAction === 'deleteConv' && activeConv) {
                      leaveConversation(activeConv.id);
                      goBack();
                    }
                    setConfirmAction(null);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Confirm"
                  accessibilityRole="button"
                >
                  <Text style={{ color: '#fff', fontSize: s(14), fontWeight: '700', fontFamily: 'Inter_700Bold' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: pad(16, 20), paddingTop: s(16), paddingBottom: s(8) }]}>
        {activeConv ? (
          <ThemedText style={[styles.headerTitle, { color: colors.text, fontSize: isSmallDevice ? 22 : s(26) }]}>
            {activeConv.type === 'circle' ? (activeCircle?.name ?? 'Circle') : (convPreview?.otherUserName ?? 'Chat')}
          </ThemedText>
        ) : (
          <>
            <ThemedText style={[styles.headerTitle, { color: colors.text, fontSize: isSmallDevice ? 22 : s(26) }]}>Chat</ThemedText>
            <ThemedText style={[styles.headerSub, { color: colors.muted, fontSize: s(13) }]}>
              {conversations.length + myCircles.length} conversation{conversations.length + myCircles.length !== 1 ? 's' : ''}
            </ThemedText>
          </>
        )}
      </View>

      <View style={{ flex: 1, paddingHorizontal: pad(12, 16) }}>
        {activeConv ? renderConversation() : renderConversationList()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080B14', paddingTop: Platform.OS === 'android' ? 32 : 0 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { color: '#F1F5F9', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'Inter_800ExtraBold' },
  headerSub: { color: '#475569', fontSize: 13, marginTop: 2, fontFamily: 'Inter_400Regular' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#243149', gap: 8,
  },
  searchInput: { flex: 1, color: '#F1F5F9', fontSize: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular' },
  searchResults: {
    backgroundColor: '#0F172A', borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: '#243149', marginBottom: 12,
  },
  searchLabel: { color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase', paddingHorizontal: 6, fontFamily: 'Inter_700Bold' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: '#131C30',
  },
  userAvatar: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  userInitial: { fontWeight: '700', fontFamily: 'Inter_700Bold' },
  userName: { color: '#F1F5F9', fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  userEmail: { color: '#475569', fontSize: 11, fontFamily: 'Inter_400Regular' },
  sectionLabel: {
    color: '#475569', fontSize: 11, fontWeight: '700',
    letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase',
    fontFamily: 'Inter_700Bold',
  },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0F172A', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#243149', marginBottom: 8,
  },
  convAvatar: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  convName: { color: '#F1F5F9', fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  convPreview: { color: '#64748B', fontSize: 12, marginTop: 2, fontFamily: 'Inter_400Regular' },
  convHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#243149', marginBottom: 4,
  },
  convAvatarSmall: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  convHeaderName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', flex: 1, fontFamily: 'Inter_700Bold' },
  msgBubble: {
    maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8,
  },
  msgSender: { fontWeight: '600', marginBottom: 2, fontFamily: 'Inter_600SemiBold' },
  msgText: { lineHeight: 22, fontFamily: 'Inter_400Regular' },
  msgTime: { marginTop: 2, fontFamily: 'Inter_400Regular' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#243149',
  },
  chatInput: {
    flex: 1, maxHeight: 100, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  sendBtn: { justifyContent: 'center', alignItems: 'center', width: 38, height: 38, borderRadius: 10 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, marginBottom: 4,
  },
  emptyTitle: { color: '#94A3B8', fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  emptySub: { color: '#64748B', fontSize: 13, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  iconBtnSmall: { justifyContent: 'center', alignItems: 'center' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#0F172A', padding: 20,
    borderRadius: 16,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#131C30',
  },
  memberAvatar: {
    justifyContent: 'center', alignItems: 'center',
  },
  memberInitial: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  memberName: { color: '#CBD5E1', fontSize: 14, flex: 1, fontFamily: 'Inter_400Regular' },
  scrollFab: {
    position: 'absolute', bottom: 16, right: 16,
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
});
