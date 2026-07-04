import { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  StyleSheet, Platform, FlatList, ScrollView,
  Pressable, TouchableWithoutFeedback, useWindowDimensions, Animated, LayoutAnimation,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth, ScheduleEvent } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { usePrefs } from '@/context/PrefsContext';
import { useResponsive } from '@/hooks/useResponsive';
import { ThemedText } from '@/components/themed-text';

interface DisplayEvent extends ScheduleEvent {
  circleId?: string;
  circleName?: string;
}

const EVENT_COLORS = ['#2DD4BF', '#0F766E', '#6366F1', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6'];
const BLANK = { title: '', date: '', startTime: '', endTime: '', notes: '', color: '' };
const TODAY = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function buildMarkedDates(events: ScheduleEvent[], selected: string, accent: string, muted: string): Record<string, any> {
  const marks: Record<string, any> = {};
  const dayActive: Record<string, boolean> = {};
  const dayArchived: Record<string, boolean> = {};
  for (const e of events) {
    if (e.archived) dayArchived[e.date] = true;
    else dayActive[e.date] = true;
  }
  for (const date of Object.keys(dayActive)) {
    marks[date] = { marked: true, dotColor: accent };
  }
  for (const date of Object.keys(dayArchived)) {
    if (!dayActive[date]) {
      marks[date] = { marked: true, dotColor: muted };
    }
  }
  marks[selected] = { ...(marks[selected] ?? {}), selected: true };
  return marks;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDateHeader(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `${days[date.getDay()]}, ${MONTH_NAMES[Number(m) - 1]} ${Number(d)}`;
}

function formatTime(slot: string) {
  const [h, m] = slot.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 || 12;
  return `${display}:${m.toString().padStart(2, '0')} ${period}`;
}

function getDuration(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins >= 60
    ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`
    : `${mins}m`;
}

function generateSuggestions(events: ScheduleEvent[]): { text: string; action: 'view-day' | 'add-event'; date: () => string }[] {
  const todayStr = TODAY;
  const tomorrowStr = TOMORROW;
  const next7 = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const active = events.filter(e => !e.archived);
  const todayEvents = active.filter(e => e.date === todayStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const tomorrowEvents = active.filter(e => e.date === tomorrowStr);
  const weekEvents = active.filter(e => next7.includes(e.date));

  const out: { text: string; action: 'view-day' | 'add-event'; date: () => string }[] = [];

  // 1 — Busiest day in next 7
  const dayCounts = next7.map(d => active.filter(e => e.date === d).length);
  const maxCount = Math.max(...dayCounts);
  if (maxCount > 0) {
    const busiestIdx = dayCounts.indexOf(maxCount);
    const busiestDay = new Date(next7[busiestIdx]);
    const dayName = busiestDay.toLocaleDateString('en', { weekday: 'long' });
    out.push({
      text: `Your busiest day is ${dayName} with ${maxCount} event${maxCount > 1 ? 's' : ''}.`,
      action: 'view-day',
      date: () => next7[busiestIdx],
    });
  }

  // 2 — Tomorrow is free
  if (tomorrowEvents.length === 0) {
    out.push({
      text: 'Tomorrow is wide open — plan a focus block or a break.',
      action: 'add-event',
      date: () => tomorrowStr,
    });
  } else if (tomorrowEvents.length <= 2) {
    out.push({
      text: `You have ${tomorrowEvents.length} thing${tomorrowEvents.length > 1 ? 's' : ''} tomorrow — room to add more.`,
      action: 'view-day',
      date: () => tomorrowStr,
    });
  }

  // 3 — Overlap / conflict today
  if (todayEvents.length >= 2) {
    for (let i = 0; i < todayEvents.length - 1; i++) {
      if (todayEvents[i].endTime > todayEvents[i + 1].startTime) {
        out.push({
          text: 'You have overlapping events today — check your schedule.',
          action: 'view-day',
          date: () => todayStr,
        });
        break;
      }
    }
  }

  // 4 — Long gap between events today
  if (todayEvents.length >= 2) {
    for (let i = 0; i < todayEvents.length - 1; i++) {
      const gap = todayEvents[i + 1].startTime.localeCompare(todayEvents[i].endTime);
      if (gap > 0) {
        const [eh, em] = todayEvents[i].endTime.split(':').map(Number);
        const [sh, sm] = todayEvents[i + 1].startTime.split(':').map(Number);
        const freeMins = (sh * 60 + sm) - (eh * 60 + em);
        if (freeMins >= 60) {
          out.push({
            text: `You have a ${Math.floor(freeMins / 60)}h${freeMins % 60 > 0 ? ` ${freeMins % 60}m` : ''} gap between events today — want to fill it?`,
            action: 'add-event',
            date: () => todayStr,
          });
          break;
        }
      }
    }
  }

  // 5 — Week summary
  if (weekEvents.length > 0) {
    out.push({
      text: `You have ${weekEvents.length} event${weekEvents.length > 1 ? 's' : ''} across the next 7 days.`,
      action: 'view-day',
      date: () => todayStr,
    });
  }

  // 6 — Evening events today
  const eveningEvents = todayEvents.filter(e => parseInt(e.startTime.split(':')[0]) >= 17);
  if (eveningEvents.length > 0) {
    out.push({
      text: `You have ${eveningEvents.length} evening event${eveningEvents.length > 1 ? 's' : ''} today — plan your wind-down.`,
      action: 'view-day',
      date: () => todayStr,
    });
  }

  // 7 — Longest event today
  if (todayEvents.length > 0) {
    let longest = todayEvents[0];
    let longestMins = 0;
    for (const e of todayEvents) {
      const [sh, sm] = e.startTime.split(':').map(Number);
      const [eh, em] = e.endTime.split(':').map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins > longestMins) { longestMins = mins; longest = e; }
    }
    if (longestMins >= 120) {
      out.push({
        text: `Your longest event today is "${longest.title}" (${Math.floor(longestMins / 60)}h${longestMins % 60 > 0 ? ` ${longestMins % 60}m` : ''}).`,
        action: 'view-day',
        date: () => todayStr,
      });
    }
  }

  // 8 — No events at all in the next 7 days
  if (weekEvents.length === 0) {
    out.push({
      text: 'Nothing scheduled for the next week — add something to get started.',
      action: 'add-event',
      date: () => TOMORROW,
    });
  }

  // Fallback if nothing matched
  if (out.length === 0) {
    out.push({
      text: 'Your schedule looks clear — use this time to plan ahead.',
      action: 'add-event',
      date: () => TOMORROW,
    });
  }

  return out;
}

export default function DashboardScreen() {
  const { events, addEvent, editEvent, archiveEvent, user, refreshEvents, circles, circleEvents, fetchCircleEvents } = useAuth();
  const router = useRouter();
  const { colors, darkMode } = useAppTheme();
  const { prefs } = usePrefs();
  const { s, isSmallDevice, pad } = useResponsive();
  const { width: screenWidth } = useWindowDimensions();
  const cardGap = pad(8, 12);
  const cardWidth = Math.floor((screenWidth - pad(12, 16) * 2 - cardGap) / 2);
  const [selectedDate, setSelectedDate] = useState(TODAY);

  // Create modal state
  const [createVisible, setCreateVisible] = useState(false);
  const [createForm, setCreateForm] = useState(BLANK);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<string | null>(null);

  const [banner, setBanner] = useState<{ type: 'overlap' | 'limit' | 'success' | 'saved'; msg: string } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<'createStart' | 'createEnd' | 'editStart' | 'editEnd' | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<'create' | 'edit' | null>(null);

  const allEvents: DisplayEvent[] = useMemo(() => {
    const personal = events.map((e) => ({ ...e }));
    const circleList: DisplayEvent[] = [];
    for (const c of circles) {
      const evts = circleEvents[c.id] ?? [];
      for (const ce of evts) {
        circleList.push({
          id: ce.id,
          title: ce.title,
          date: ce.date,
          startTime: ce.startTime,
          endTime: ce.endTime,
          color: c.color,
          notes: ce.notes,
          archived: false,
          circleId: ce.circleId,
          circleName: c.name,
        });
      }
    }
    return [...personal, ...circleList];
  }, [events, circles, circleEvents]);

  // Month grid: personal events only
  const dayEvents = useMemo(() => events.filter(e => !e.archived && e.date === selectedDate), [events, selectedDate]);
  const archivedForDate = useMemo(() => events.filter(e => e.archived && e.date === selectedDate).length, [events, selectedDate]);
  const markedDates = useMemo(() => buildMarkedDates(events, selectedDate, colors.accent, colors.muted), [events, selectedDate, colors.accent, colors.muted]);
  const allSuggestions = useMemo(() => generateSuggestions(allEvents.filter(e => !e.archived)), [allEvents]);
  const currentSuggestion = allSuggestions[suggestionIndex % (allSuggestions.length || 1)];

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);
  const todayFormatted = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), []);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshEvents(),
        ...circles.map((c) => fetchCircleEvents(c.id)),
      ]);
    } catch {}
    setRefreshing(false);
  }, [refreshEvents, circles, fetchCircleEvents]);

  useFocusEffect(
    useCallback(() => {
      refreshEvents();
      circles.forEach((c) => fetchCircleEvents(c.id));
    }, [refreshEvents, circles, fetchCircleEvents]),
  );

  const avatarColor = useMemo(() => {
    const colors = ['#2DD4BF','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#34D399'];
    return colors[(user?.name?.charCodeAt(0) || 0) % colors.length];
  }, [user?.name]);
  const todayCount = useMemo(() => allEvents.filter(e => !e.archived && e.date === TODAY).length, [allEvents]);
  const weekCount = useMemo(() => {
    const next7 = Array.from({ length: 7 }).map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0]; });
    return allEvents.filter(e => !e.archived && next7.includes(e.date)).length;
  }, [allEvents]);

  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
  const isMonthView = viewMode === 'month';
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggleView = useCallback((mode: 'month' | 'agenda') => {
    if (mode === viewMode) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(slideAnim, {
      toValue: mode === 'agenda' ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setViewMode(mode);
  }, [viewMode, slideAnim]);

  const groupedAgenda = useMemo(() => {
    const groups: Record<string, DisplayEvent[]> = {};
    const sorted = [...allEvents].filter(e => !e.archived).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const today = TODAY;
    for (const e of sorted) {
      if (e.date < today) continue;
      if (!groups[e.date]) groups[e.date] = [];
      groups[e.date].push(e);
    }
    return Object.entries(groups);
  }, [allEvents]);



  const showBanner = (type: 'overlap' | 'limit' | 'success' | 'saved', msg: string) => {
    setBanner({ type, msg });
    setTimeout(() => setBanner(null), 3000);
  };

  // ── Create ──
  const handleCreate = () => {
    const missing = [
      !createForm.title.trim() && 'Title',
      !createForm.date.trim() && 'Date',
      !createForm.startTime.trim() && 'Start time',
      !createForm.endTime.trim() && 'End time',
    ].filter(Boolean) as string[];
    if (missing.length) {
      setValidationMsg(`Please fill in: ${missing.join(', ')}`);
      return;
    }
    const result = addEvent({
      title: createForm.title, date: createForm.date,
      startTime: createForm.startTime, endTime: createForm.endTime,
      notes: createForm.notes,
      color: createForm.color || undefined,
    });
    if (result === 'overlap') showBanner('overlap', 'Time conflict with an existing event.');
    else { showBanner('success', 'Event added.'); setCreateForm(BLANK); setCreateVisible(false); setTimePickerTarget(null); setDatePickerTarget(null); }
  };

  // ── Open edit modal pre-filled (personal events) or navigate (circle events) ──
  const openEdit = (item: DisplayEvent) => {
    if (item.circleId) {
      router.push(`/(tabs)/circle-detail?id=${item.circleId}`);
      return;
    }
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      notes: item.notes ?? '',
      color: item.color ?? '',
    });
    setEditVisible(true);
  };

  // ── Save edit ──
  const handleEdit = () => {
    if (!editingId) return;
    const missing = [
      !editForm.title.trim() && 'Title',
      !editForm.date.trim() && 'Date',
      !editForm.startTime.trim() && 'Start time',
      !editForm.endTime.trim() && 'End time',
    ].filter(Boolean) as string[];
    if (missing.length) {
      setValidationMsg(`Please fill in: ${missing.join(', ')}`);
      return;
    }
    const result = editEvent(editingId, {
      title: editForm.title, date: editForm.date,
      startTime: editForm.startTime, endTime: editForm.endTime,
      notes: editForm.notes,
      color: editForm.color || undefined,
    });
    if (result === 'overlap') showBanner('overlap', 'Time conflict with another event.');
    else { showBanner('saved', 'Event updated.'); setEditVisible(false); setEditingId(null); setTimePickerTarget(null); setDatePickerTarget(null); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {banner && !createVisible && !editVisible && (
        <View style={[styles.banner,
          { marginHorizontal: pad(12, 16) },
          banner.type === 'success' || banner.type === 'saved'
            ? { backgroundColor: colors.success + '20', borderColor: colors.success + '45' }
            : { backgroundColor: colors.warning + '20', borderColor: colors.warning + '45' }
        ]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>{banner.msg}</Text>
        </View>
      )}

      {/* ── Greeting Header ── */}
      <View style={{ paddingHorizontal: pad(12, 16), paddingTop: s(10) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
            <View style={{ width: s(54), height: s(54), borderRadius: s(16), backgroundColor: avatarColor, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: s(24), fontWeight: '700' }}>{(user?.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={{ color: colors.muted, fontSize: s(17), fontWeight: '500' }}>{greeting}</Text>
              <Text style={{ color: colors.text, fontSize: s(22), fontWeight: '800' }}>{user?.name?.split(' ')[0] || 'Guest'}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Ionicons name="calendar-outline" size={s(18)} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: s(14), marginTop: s(3) }}>{todayFormatted}</Text>
          </View>
        </View>
      </View>

      {viewMode === 'month' ? (
        <FlatList
          key="event-grid-2col"
          data={dayEvents}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={[styles.columnWrapper, { gap: pad(8, 12), marginBottom: pad(8, 12) }]}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: pad(12, 16), paddingBottom: s(100) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListHeaderComponent={
          <>
            <View style={[styles.calendarWrap, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: pad(12, 16), marginTop: s(28), borderRadius: s(16), paddingTop: s(12) }]}>  
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: s(4) }}>
                <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: s(10), padding: s(3) }}>
                  <TouchableOpacity style={{ paddingHorizontal: s(18), paddingVertical: s(8), borderRadius: s(7), backgroundColor: isMonthView ? colors.accentStrong : 'transparent' }} onPress={() => toggleView('month')} activeOpacity={0.7}>
                    <Text style={{ color: isMonthView ? '#FFFFFF' : colors.muted, fontSize: s(14), fontWeight: '700' }}>Month</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ paddingHorizontal: s(18), paddingVertical: s(8), borderRadius: s(7), backgroundColor: isMonthView ? 'transparent' : colors.accentStrong }} onPress={() => toggleView('agenda')} activeOpacity={0.7}>
                    <Text style={{ color: isMonthView ? colors.muted : '#FFFFFF', fontSize: s(14), fontWeight: '700' }}>Agenda</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Calendar
                key={darkMode ? 'dark' : 'light'}
                current={TODAY}
                markedDates={markedDates}
                onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
                showWeekNumbers={!!prefs.showWeekNumbers}
                theme={{
                  calendarBackground: 'transparent',
                  backgroundColor: 'transparent',
                  selectedDayBackgroundColor: colors.accentStrong,
                  selectedDayTextColor: colors.onAccent,
                  todayTextColor: colors.accent,
                  todayBackgroundColor: colors.accentSoft,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.muted,
                  dotColor: colors.accent,
                  selectedDotColor: colors.onAccent,
                  monthTextColor: colors.text,
                  arrowColor: colors.accent,
                  textSectionTitleColor: colors.muted,
                  textDayFontWeight: '500',
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '600',
                }}
              />
            </View>
            {prefs.notifyAI && (
              <View style={[styles.aiCard, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: pad(12, 16), borderRadius: s(14), padding: s(16) }]}>
                <View style={styles.aiHeader}>
                  <View style={[styles.aiPill, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '30' }]}>
                    <Ionicons name="sparkles" size={18} color={colors.accent} />
                    <Text style={[styles.aiPillText, { color: colors.accent }]}>Scheduly AI</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSuggestionIndex((i) => i + 1)}>
                    <Text style={[styles.aiViewAll, { color: colors.muted }]}>Refresh</Text>
                  </TouchableOpacity>
                </View>
                {(() => {
                  const s = currentSuggestion;
                  if (!s) return <Text style={[styles.aiEmpty, { color: colors.muted }]}>No suggestions right now</Text>;
                  const handlePress = () => {
                    if (s.action === 'view-day') setSelectedDate(s.date());
                    else if (s.action === 'add-event') { setSelectedDate(s.date()); setCreateForm({ ...BLANK, date: s.date() }); setCreateVisible(true); }
                  };
                  const label = s.action === 'add-event' ? 'Add' : 'View';
                  return (
                    <TouchableOpacity key={suggestionIndex} activeOpacity={0.7} onPress={handlePress} style={[styles.aiRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.aiText, { color: colors.text, flex: 1 }]}>{s.text}</Text>
                      <View style={[styles.aiAction, { borderColor: colors.accent }]}>
                        <Text style={[styles.aiActionText, { color: colors.accent }]}>{label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            )}
            <View style={[styles.dateHeader, { paddingHorizontal: pad(16, 20), paddingVertical: s(16) }]}>
              <View>
                <Text style={[styles.dateHeaderMain, { color: colors.text, fontSize: s(16) }]}>{formatDateHeader(selectedDate)}</Text>
                <Text style={[styles.dateHeaderSub, { color: colors.muted }]}>
                  {dayEvents.length === 0 && archivedForDate === 0 ? 'Nothing scheduled'
                    : dayEvents.length === 0 ? `${archivedForDate} in archive`
                    : `${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}${archivedForDate > 0 ? ` · ${archivedForDate} in archive` : ''}`}
                </Text>
              </View>
              <View style={[styles.datePill, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '35', borderRadius: s(10), paddingHorizontal: s(10), paddingVertical: s(5) }]}>
                <Text style={[styles.datePillText, { color: colors.accent, fontSize: s(12) }]}>{selectedDate}</Text>
              </View>
            </View>
          </>
        }
        renderItem={({ item }: { item: ScheduleEvent }) => {
          const e = item as DisplayEvent;
          const color = e.color ?? colors.accent;
          return (
            <TouchableOpacity
              style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border, width: cardWidth }]}
              onPress={() => openEdit(e)}
              activeOpacity={0.7}
            >
              {/* Left accent bar */}
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: s(4), backgroundColor: color, borderTopLeftRadius: s(16), borderBottomLeftRadius: s(16) }} />

              {/* Edit button */}
              <TouchableOpacity
                style={{ position: 'absolute', top: s(8), right: s(8), zIndex: 1, width: s(22), height: s(22), borderRadius: s(6), backgroundColor: colors.surfaceAlt + 'CC', justifyContent: 'center', alignItems: 'center' }}
                onPress={() => openEdit(e)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil" size={s(10)} color={color} />
              </TouchableOpacity>

              {/* Content */}
              <View style={{ flex: 1, padding: s(12), paddingLeft: s(16), justifyContent: 'space-between' }}>
                <View style={{ gap: s(5) }}>
                  <Text style={{ color: colors.text, fontSize: s(13), fontWeight: '700', lineHeight: s(17) }} numberOfLines={2}>{e.title}</Text>
                  {e.notes ? (
                    <Text style={{ color: colors.muted, fontSize: s(10), lineHeight: s(13) }} numberOfLines={1}>{e.notes}</Text>
                  ) : null}
                  {e.circleName ? (
                    <View style={{ alignSelf: 'flex-start', backgroundColor: color + '18', borderRadius: s(4), paddingHorizontal: s(5), paddingVertical: s(1) }}>
                      <Text style={{ color, fontSize: s(8), fontWeight: '600' }}>{e.circleName}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ gap: s(4) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
                    <Ionicons name="time-outline" size={s(10)} color={color} />
                    <Text style={{ color, fontSize: s(11), fontWeight: '600' }}>{e.startTime}</Text>
                    <Text style={{ color: colors.muted, fontSize: s(9) }}>-</Text>
                    <Text style={{ color: colors.muted, fontSize: s(10) }}>{e.endTime}</Text>
                  </View>
                  <View style={{ alignSelf: 'flex-start', backgroundColor: color + '15', borderRadius: s(5), paddingHorizontal: s(6), paddingVertical: s(2) }}>
                    <Text style={{ color, fontSize: s(9), fontWeight: '700' }}>{getDuration(e.startTime, e.endTime)}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.muted }]}>No events</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              {archivedForDate > 0 ? `${archivedForDate} archived — check Profile` : 'Tap + to add something to this day'}
            </Text>
          </View>
        }
      />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: pad(12, 16), paddingBottom: s(100) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
          <View style={[styles.calendarWrap, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: s(8), borderRadius: s(16), paddingVertical: s(12) }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: s(10), padding: s(3) }}>
                <TouchableOpacity style={{ paddingHorizontal: s(18), paddingVertical: s(8), borderRadius: s(7), backgroundColor: isMonthView ? colors.accentStrong : 'transparent' }} onPress={() => toggleView('month')} activeOpacity={0.7}>
                  <Text style={{ color: isMonthView ? '#FFFFFF' : colors.muted, fontSize: s(14), fontWeight: '700' }}>Month</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ paddingHorizontal: s(18), paddingVertical: s(8), borderRadius: s(7), backgroundColor: isMonthView ? 'transparent' : colors.accentStrong }} onPress={() => toggleView('agenda')} activeOpacity={0.7}>
                  <Text style={{ color: isMonthView ? colors.muted : '#FFFFFF', fontSize: s(14), fontWeight: '700' }}>Agenda</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Stats Row ── */}
          <View style={{ flexDirection: 'row', paddingTop: s(6), paddingBottom: s(12), gap: s(10) }}>
            <View style={{ flex: 1, backgroundColor: colors.accent + '12', borderRadius: s(14), borderWidth: 1, borderColor: colors.accent + '25', paddingVertical: s(12), alignItems: 'center', gap: s(3) }}>
              <Ionicons name="today-outline" size={s(18)} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: s(22), fontWeight: '800' }}>{todayCount}</Text>
              <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '500' }}>Today</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.warning + '12', borderRadius: s(14), borderWidth: 1, borderColor: colors.warning + '25', paddingVertical: s(12), alignItems: 'center', gap: s(3) }}>
              <Ionicons name="calendar-outline" size={s(18)} color={colors.warning} />
              <Text style={{ color: colors.warning, fontSize: s(22), fontWeight: '800' }}>{weekCount}</Text>
              <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: '500' }}>This week</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.success + '12', borderRadius: s(14), borderWidth: 1, borderColor: colors.success + '25', paddingVertical: s(12), alignItems: 'center', gap: s(3) }}>
              <Ionicons name="checkmark-circle-outline" size={s(18)} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: s(22), fontWeight: '800' }}>{allEvents.length}</Text>
              <Text style={{ color: colors.muted, fontSize: s(10), fontWeight: '500' }}>Total</Text>
            </View>
          </View>

          {groupedAgenda.length === 0 ? (
            <View style={[styles.emptyWrap, { marginTop: s(40) }]}>
              <View style={styles.emptyIcon}>
                <Ionicons name="calendar-outline" size={28} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.muted }]}>No upcoming events</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Tap + to add something</Text>
            </View>
          ) : (
            groupedAgenda.map(([date, evts]) => (
              <View key={date} style={{ marginBottom: s(20), marginTop: s(4) }}>
                {/* Date header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(14), gap: s(10) }}>
                  <View style={{ width: s(3), height: s(20), backgroundColor: colors.accent, borderRadius: s(2) }} />
                  <Text style={{ color: colors.text, fontSize: s(16), fontWeight: '700', flex: 1 }}>{formatDateHeader(date)}</Text>
                  <View style={{ backgroundColor: colors.accent + '15', borderRadius: s(8), paddingHorizontal: s(10), paddingVertical: s(4) }}>
                    <Text style={{ color: colors.accent, fontSize: s(11), fontWeight: '600' }}>{evts.length} event{evts.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>

                {/* Timeline */}
                <View style={{ paddingLeft: s(14) }}>
                  <View style={{ position: 'absolute', left: s(14), top: s(8), bottom: s(8), width: s(2), backgroundColor: colors.border + '60', borderRadius: s(1) }} />
                  {evts.map((evt, idx) => {
                    const color = evt.color ?? colors.accent;
                    return (
                      <View key={evt.id} style={{ flexDirection: 'row', marginBottom: idx < evts.length - 1 ? s(14) : 0 }}>
                        {/* Dot */}
                        <View style={{ width: s(28), alignItems: 'center', zIndex: 1 }}>
                          <View style={{ width: s(14), height: s(14), borderRadius: s(7), backgroundColor: color, borderWidth: s(3), borderColor: colors.surface }} />
                        </View>

                        {/* Card */}
                        <TouchableOpacity
                          style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: s(14), overflow: 'hidden' }}
                          onPress={() => { setSelectedDate(evt.date); openEdit(evt); }}
                          activeOpacity={0.7}
                        >
                          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: s(4), backgroundColor: color, borderTopLeftRadius: s(14), borderBottomLeftRadius: s(14) }} />
                          <TouchableOpacity
                            style={{ position: 'absolute', top: s(8), right: s(8), zIndex: 2, width: s(24), height: s(24), borderRadius: s(6), backgroundColor: colors.surfaceAlt + 'CC', justifyContent: 'center', alignItems: 'center' }}
                            onPress={() => { setSelectedDate(evt.date); openEdit(evt); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="pencil" size={s(11)} color={color} />
                          </TouchableOpacity>
                          <View style={{ padding: s(12), paddingLeft: s(16) }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginBottom: s(4) }}>
                              <View style={{ backgroundColor: color + '18', borderRadius: s(6), paddingHorizontal: s(8), paddingVertical: s(2) }}>
                                <Text style={{ color, fontSize: s(11), fontWeight: '700' }}>{formatTime(evt.startTime)}</Text>
                              </View>
                              <Text style={{ color: colors.muted, fontSize: s(10) }}>→</Text>
                              <Text style={{ color: colors.muted, fontSize: s(10) }}>{formatTime(evt.endTime)}</Text>
                            </View>
                            <Text style={{ color: colors.text, fontSize: s(15), fontWeight: '700' }} numberOfLines={1}>{evt.title}</Text>
                            {evt.notes ? <Text style={{ color: colors.muted, fontSize: s(11), marginTop: s(2) }} numberOfLines={1}>{evt.notes}</Text> : null}
                            <View style={{ flexDirection: 'row', gap: s(6), alignItems: 'center', marginTop: s(4) }}>
                              <View style={{ alignSelf: 'flex-start', backgroundColor: color + '15', borderRadius: s(5), paddingHorizontal: s(7), paddingVertical: s(2) }}>
                                <Text style={{ color, fontSize: s(9), fontWeight: '700' }}>{getDuration(evt.startTime, evt.endTime)}</Text>
                              </View>
                              {evt.circleName ? (
                                <View style={{ alignSelf: 'flex-start', backgroundColor: color + '18', borderRadius: s(4), paddingHorizontal: s(5), paddingVertical: s(1) }}>
                                  <Text style={{ color, fontSize: s(9), fontWeight: '600' }}>{evt.circleName}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accentStrong, width: s(58), height: s(58), borderRadius: s(16), bottom: s(28), right: s(24) }, Platform.select({ web: { boxShadow: `0 0 14px ${colors.accentStrong}` }, default: { shadowColor: colors.accentStrong, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8 } })]}
        onPress={() => { setCreateForm({ ...BLANK, date: selectedDate }); setCreateVisible(true); }}
        activeOpacity={0.85}
        accessibilityLabel="Create new event"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={s(28)} color={colors.onAccent} />
      </TouchableOpacity>

      {/* ── Create Event Modal ── */}
      <Modal visible={createVisible} transparent animationType="fade">
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => { setCreateVisible(false); setCreateForm(BLANK); setTimePickerTarget(null); setDatePickerTarget(null); }}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border, width: '90%', maxWidth: 400, borderRadius: s(22), padding: 0, paddingBottom: 0 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: pad(18, 24), paddingBottom: s(24) }} showsVerticalScrollIndicator={false}>
              {/* Header */}
              <ThemedText style={[styles.sheetTitle, { color: colors.text, fontSize: s(20) }]}>New Event</ThemedText>
              <View style={[styles.sheetAccent, { backgroundColor: createForm.color || colors.accent }]} />

              {/* Title */}
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(12), borderLeftWidth: 3, borderLeftColor: createForm.color || 'transparent' }]}>
                <Ionicons name="create-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(13) }]} placeholder="Event name" placeholderTextColor={colors.muted}
                  value={createForm.title} onChangeText={v => setCreateForm(f => ({ ...f, title: v }))} />
              </View>

              {/* Duration preview */}
              {(() => {
                const dur = computeDuration(createForm.startTime, createForm.endTime);
                if (!dur) return null;
                return (
                  <View style={[styles.durBadge, { backgroundColor: colors.accentStrong + '18', borderColor: colors.accentStrong + '40' }]}>
                    <Ionicons name="time-outline" size={s(13)} color={colors.accent} />
                    <ThemedText style={[styles.durBadgeText, { color: colors.accent }]}>{dur}</ThemedText>
                  </View>
                );
              })()}

              {/* Color picker */}
              <ThemedText style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Color</ThemedText>
              <View style={styles.colorRow}>
                {EVENT_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      createForm.color === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setCreateForm(f => ({ ...f, color: f.color === c ? '' : c }))}
                    accessibilityLabel={`Select color ${c}`}
                    accessibilityRole="button"
                  />
                ))}
              </View>

              {/* Detail section */}
              <View style={[styles.sheetSection, { borderColor: colors.border }]}>
                <ThemedText style={[styles.sheetSectionTitle, { color: colors.muted }]}>When</ThemedText>

                <TouchableOpacity style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]} onPress={() => setDatePickerTarget('create')} activeOpacity={0.7} accessibilityLabel="Select event date" accessibilityRole="button">
                  <Ionicons name="calendar-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                  <Text style={[styles.input, { color: createForm.date ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{createForm.date || 'Select date'}</Text>
                </TouchableOpacity>

                <View style={[styles.timeRow, { marginTop: s(10), gap: s(10) }]}>
                  <TouchableOpacity style={[styles.inputRow, { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]} onPress={() => setTimePickerTarget('createStart')} activeOpacity={0.7}>
                    <Ionicons name="time-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                    <Text style={[styles.input, { color: createForm.startTime ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{createForm.startTime || 'Start'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.inputRow, { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]} onPress={() => setTimePickerTarget('createEnd')} activeOpacity={0.7}>
                    <Ionicons name="time-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                    <Text style={[styles.input, { color: createForm.endTime ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{createForm.endTime || 'End'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notes */}
              <View style={[styles.sheetSection, { borderColor: colors.border }]}>
                <ThemedText style={[styles.sheetSectionTitle, { color: colors.muted }]}>Notes</ThemedText>
                <View style={[styles.inputRow, { alignItems: 'flex-start', paddingVertical: s(10), backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]}>
                  <Ionicons name="document-text-outline" size={s(17)} color={colors.accent} style={[styles.inputIcon, { marginTop: s(2) }]} />
                  <TextInput
                    style={[styles.input, { height: s(80), textAlignVertical: 'top', color: colors.text, fontSize: s(15), paddingVertical: s(13) }]}
                    placeholder="Add a note or description..."
                    placeholderTextColor={colors.muted}
                    multiline
                    value={createForm.notes}
                    onChangeText={v => setCreateForm(f => ({ ...f, notes: v }))}
                  />
                </View>
              </View>

              {banner?.type === 'overlap' && (
                <View style={styles.overlapBox}>
                  <Ionicons name="warning-outline" size={14} color={colors.warning} />
                  <ThemedText style={[styles.overlapText, { color: colors.warning }]}>{banner.msg}</ThemedText>
                </View>
              )}

              <TouchableOpacity style={[styles.btnSave, { backgroundColor: createForm.color || colors.accentStrong, borderRadius: s(12), paddingVertical: s(15), marginBottom: s(12) }]} onPress={handleCreate} activeOpacity={0.85} accessibilityLabel="Save new event" accessibilityRole="button">
                <ThemedText style={[styles.btnSaveText, { color: colors.onAccent, fontSize: s(16) }]}>Save Event</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCreateVisible(false); setCreateForm(BLANK); setTimePickerTarget(null); setDatePickerTarget(null); }}>
                <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit Event Modal ── */}
      <Modal visible={editVisible} transparent animationType="fade">
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => { setEditVisible(false); setEditingId(null); setTimePickerTarget(null); setDatePickerTarget(null); }}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.border, width: '90%', maxWidth: 400, borderRadius: s(22), padding: 0, paddingBottom: 0 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: pad(18, 24), paddingBottom: s(24) }} showsVerticalScrollIndicator={false}>
              {/* Header row with archive */}
              <View style={[styles.editHeader, { marginBottom: s(4) }]}>
                <Text style={[styles.sheetTitle, { color: colors.text, fontSize: s(20) }]}>Edit Event</Text>
                <TouchableOpacity
                  style={[styles.deleteBtnModal, { borderColor: colors.accent + '40', backgroundColor: colors.accent + '15' }]}
                  onPress={() => {
                    if (editingId) setConfirmDeleteEvent(editingId);
                  }}
                >
                  <Ionicons name="archive-outline" size={16} color={colors.accent} />
                  <Text style={[styles.deleteBtnText, { color: colors.accent }]}>Archive</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.sheetAccent, { backgroundColor: editForm.color || colors.accent }]} />

              {/* Title */}
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12), paddingHorizontal: pad(12, 14), marginBottom: s(12), borderLeftWidth: 3, borderLeftColor: editForm.color || 'transparent' }]}>
                <Ionicons name="create-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                <TextInput style={[styles.input, { color: colors.text, fontSize: s(15), paddingVertical: s(13) }]} placeholder="Event name" placeholderTextColor={colors.muted}
                  value={editForm.title} onChangeText={v => setEditForm(f => ({ ...f, title: v }))} />
              </View>

              {/* Duration preview */}
              {(() => {
                const dur = computeDuration(editForm.startTime, editForm.endTime);
                if (!dur) return null;
                return (
                  <View style={[styles.durBadge, { backgroundColor: colors.accentStrong + '18', borderColor: colors.accentStrong + '40' }]}>
                    <Ionicons name="time-outline" size={s(13)} color={colors.accent} />
                    <Text style={[styles.durBadgeText, { color: colors.accent }]}>{dur}</Text>
                  </View>
                );
              })()}

              {/* Color picker */}
              <Text style={[styles.fieldLabel, { color: colors.muted, fontSize: s(12) }]}>Color</Text>
              <View style={styles.colorRow}>
                {EVENT_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      editForm.color === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setEditForm(f => ({ ...f, color: f.color === c ? '' : c }))}
                  />
                ))}
              </View>

              {/* Detail section */}
              <View style={[styles.sheetSection, { borderColor: colors.border }]}>
                <Text style={[styles.sheetSectionTitle, { color: colors.muted }]}>When</Text>

                <TouchableOpacity style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]} onPress={() => setDatePickerTarget('edit')} activeOpacity={0.7}>
                  <Ionicons name="calendar-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                  <Text style={[styles.input, { color: editForm.date ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{editForm.date || 'Select date'}</Text>
                </TouchableOpacity>

                <View style={[styles.timeRow, { marginTop: s(10), gap: s(10) }]}>
                  <TouchableOpacity style={[styles.inputRow, { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]} onPress={() => setTimePickerTarget('editStart')} activeOpacity={0.7}>
                    <Ionicons name="time-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                    <Text style={[styles.input, { color: editForm.startTime ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{editForm.startTime || 'Start'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.inputRow, { flex: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]} onPress={() => setTimePickerTarget('editEnd')} activeOpacity={0.7}>
                    <Ionicons name="time-outline" size={s(17)} color={colors.accent} style={styles.inputIcon} />
                    <Text style={[styles.input, { color: editForm.endTime ? colors.text : colors.muted, fontSize: s(15), paddingVertical: s(13) }]}>{editForm.endTime || 'End'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notes */}
              <View style={[styles.sheetSection, { borderColor: colors.border }]}>
                <ThemedText style={[styles.sheetSectionTitle, { color: colors.muted }]}>Notes</ThemedText>
                <View style={[styles.inputRow, { alignItems: 'flex-start', paddingVertical: s(10), backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: s(12) }]}>
                  <Ionicons name="document-text-outline" size={s(17)} color={colors.accent} style={[styles.inputIcon, { marginTop: s(2) }]} />
                  <TextInput
                    style={[styles.input, { height: s(80), textAlignVertical: 'top', color: colors.text, fontSize: s(15), paddingVertical: s(13) }]}
                    placeholder="Add a note or description..."
                    placeholderTextColor={colors.muted}
                    multiline
                    value={editForm.notes}
                    onChangeText={v => setEditForm(f => ({ ...f, notes: v }))}
                  />
                </View>
              </View>

              {banner?.type === 'overlap' && (
                <View style={styles.overlapBox}>
                  <Ionicons name="warning-outline" size={14} color={colors.warning} />
                  <ThemedText style={[styles.overlapText, { color: colors.warning }]}>{banner.msg}</ThemedText>
                </View>
              )}

              <TouchableOpacity style={[styles.btnSave, { backgroundColor: editForm.color || colors.accentStrong, borderRadius: s(12), paddingVertical: s(15), marginBottom: s(12) }]} onPress={handleEdit} activeOpacity={0.85}>
                <Text style={[styles.btnSaveText, { color: colors.onAccent, fontSize: s(16) }]}>Save Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditVisible(false); setEditingId(null); setTimePickerTarget(null); setDatePickerTarget(null); }}>
                <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Validation Modal ── */}
      <Modal visible={validationMsg !== null} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setValidationMsg(null)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, width: '80%', maxWidth: 320, padding: s(24), alignItems: 'center' }}>
              <View style={{ width: s(48), height: s(48), borderRadius: s(16), backgroundColor: colors.warning + '20', justifyContent: 'center', alignItems: 'center', marginBottom: s(16) }}>
                <Ionicons name="alert-circle-outline" size={s(26)} color={colors.warning} />
              </View>
              <Text style={{ color: colors.text, fontSize: s(17), fontWeight: '700', textAlign: 'center', marginBottom: s(8) }}>Missing fields</Text>
              <Text style={{ color: colors.muted, fontSize: s(14), textAlign: 'center', marginBottom: s(20), lineHeight: s(20) }}>{validationMsg}</Text>
              <TouchableOpacity
                style={{ backgroundColor: colors.accentStrong, borderRadius: s(12), paddingVertical: s(12), paddingHorizontal: s(32), width: '100%', alignItems: 'center' }}
                onPress={() => setValidationMsg(null)}
                activeOpacity={0.85}
              >
                <Text style={{ color: colors.onAccent, fontSize: s(15), fontWeight: '700' }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Date Picker Modal ── */}
      <Modal visible={datePickerTarget !== null} transparent animationType="fade">
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setDatePickerTarget(null)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderRadius: s(22), borderWidth: 1, borderColor: colors.border, width: '90%', maxWidth: 360, paddingBottom: s(20) }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(20), paddingTop: s(18), paddingBottom: s(12) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="calendar-outline" size={s(18)} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700' }}>Select date</Text>
                </View>
                <TouchableOpacity onPress={() => setDatePickerTarget(null)} style={{ paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </View>
              <Calendar
                current={TODAY}
                markedDates={{
                  [(datePickerTarget === 'create' ? createForm.date : editForm.date) || '']: { selected: true, selectedColor: colors.accentStrong },
                }}
                onDayPress={(day: DateData) => {
                  if (datePickerTarget === 'create') setCreateForm(f => ({ ...f, date: day.dateString }));
                  else setEditForm(f => ({ ...f, date: day.dateString }));
                  setDatePickerTarget(null);
                }}
                theme={{
                  calendarBackground: 'transparent',
                  backgroundColor: 'transparent',
                  selectedDayBackgroundColor: colors.accentStrong,
                  selectedDayTextColor: colors.onAccent,
                  todayTextColor: colors.accent,
                  todayBackgroundColor: colors.accentSoft,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.muted,
                  dotColor: colors.accent,
                  selectedDotColor: colors.onAccent,
                  monthTextColor: colors.text,
                  arrowColor: colors.accent,
                  textSectionTitleColor: colors.muted,
                  textDayFontWeight: '500',
                  textMonthFontWeight: '700',
                  textDayHeaderFontWeight: '600',
                }}
                style={{ marginHorizontal: s(8), marginBottom: s(8) }}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* ── Time Picker Modal ── */}
      <Modal visible={timePickerTarget !== null} transparent animationType="slide">
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay, justifyContent: 'flex-end' }]}
          activeOpacity={1}
          onPress={() => setTimePickerTarget(null)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: s(22), borderTopRightRadius: s(22), borderWidth: 1, borderColor: colors.border, maxHeight: '55%', paddingBottom: s(34) }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(20), paddingTop: s(16), paddingBottom: s(12) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                  <View style={{ width: s(32), height: s(32), borderRadius: s(10), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={s(18)} color={colors.accent} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: s(18), fontWeight: '700' }}>Choose time</Text>
                </View>
                <TouchableOpacity onPress={() => setTimePickerTarget(null)} style={{ paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8), backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ color: colors.accent, fontSize: s(14), fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: s(300) }} showsVerticalScrollIndicator={false}>
                {TIME_SLOTS.map((slot) => {
                  const hour = parseInt(slot.split(':')[0], 10);
                  const period = hour < 12 ? 'AM' : 'PM';
                  const currentVal =
                    timePickerTarget === 'createStart' ? createForm.startTime :
                    timePickerTarget === 'createEnd' ? createForm.endTime :
                    timePickerTarget === 'editStart' ? editForm.startTime :
                    editForm.endTime;
                  const selected = currentVal === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: s(14), paddingHorizontal: s(20), borderBottomWidth: 0.5, borderBottomColor: colors.border + '40', backgroundColor: selected ? colors.accent + '12' : 'transparent' }}
                      onPress={() => {
                        if (timePickerTarget === 'createStart') setCreateForm(f => ({ ...f, startTime: slot }));
                        else if (timePickerTarget === 'createEnd') setCreateForm(f => ({ ...f, endTime: slot }));
                        else if (timePickerTarget === 'editStart') setEditForm(f => ({ ...f, startTime: slot }));
                        else if (timePickerTarget === 'editEnd') setEditForm(f => ({ ...f, endTime: slot }));
                        setTimePickerTarget(null);
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

      {/* ── Confirm Archive Event Modal ── */}
      <Modal visible={confirmDeleteEvent !== null} transparent animationType="fade">
        <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setConfirmDeleteEvent(null)}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderRadius: s(20), borderWidth: 1, borderColor: colors.border, padding: s(24), alignItems: 'center', width: '70%', maxWidth: s(260) }}>
              <View style={{ width: s(64), height: s(64), borderRadius: s(16), backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginBottom: s(14), borderWidth: 1, borderColor: colors.accent + '30' }}>
                <Ionicons name="archive-outline" size={s(32)} color={colors.accent} />
              </View>
              <Text style={{ color: colors.text, fontSize: isSmallDevice ? 20 : s(24), fontWeight: '800', marginBottom: s(6) }}>Archive Event</Text>
              <Text style={{ color: colors.muted, fontSize: s(15), textAlign: 'center', marginBottom: s(18), lineHeight: s(20) }}>Move this event to archive?</Text>
              <View style={{ flexDirection: 'row', gap: s(12), width: '100%' }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), flex: 1, backgroundColor: colors.accent + '15', borderRadius: s(12), paddingVertical: s(15), borderWidth: 1, borderColor: colors.accent + '30' }}
                  onPress={() => {
                    if (confirmDeleteEvent) {
                      archiveEvent(confirmDeleteEvent);
                      setEditVisible(false);
                      setEditingId(null);
                    }
                    setConfirmDeleteEvent(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="archive-outline" size={s(15)} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: s(15), fontWeight: '700' }}>Archive</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(8), flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: s(12), paddingVertical: s(15), borderWidth: 1, borderColor: colors.border }}
                  onPress={() => setConfirmDeleteEvent(null)}
                >
                  <Text style={{ color: colors.muted, fontSize: s(15), fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function computeDuration(start: string, end: string): string | null {
  if (!start || !end) return null;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const diff = toMin(end) - toMin(start);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr`;
  return `${h} hr ${m} min`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === 'android' ? 16 : 0 },
  banner: { marginHorizontal: 16, marginTop: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  bannerText: { fontSize: 13, textAlign: 'center' },
  guestPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', marginTop: 8,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1,
  },
  guestPillText: { fontSize: 12, fontWeight: '600' },
  calendarWrap: {
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, overflow: 'hidden', borderWidth: 1,
  },
  dateHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  dateHeaderMain: { fontSize: 16, fontWeight: '700' },
  dateHeaderSub: { fontSize: 12, marginTop: 2 },
  datePill: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
  },
  datePillText: { fontSize: 12, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  eventCard: {
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySubtitle: { fontSize: 13 },
  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 58, height: 58,
    borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    elevation: 8,
  },
  fabDisabled: { boxShadow: 'none' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  // AI card
  aiCard: { marginHorizontal: 16, marginTop: 6, borderRadius: 14, padding: 16, borderWidth: 1 },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  aiPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  aiPillText: { fontSize: 13, fontWeight: '700' },
  aiViewAll: { fontSize: 14, fontWeight: '600' },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  aiText: { flex: 1, fontSize: 15 },
  aiAction: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, marginLeft: 12 },
  aiActionText: { fontSize: 14, fontWeight: '700' },
  aiEmpty: { paddingVertical: 12, fontSize: 14 },
  modalSheet: {
    borderRadius: 22,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    borderWidth: 1, maxHeight: '90%',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  sheetAccent: { height: 3, width: 36, borderRadius: 2, marginTop: 8, marginBottom: 18 },
  colorRow: { flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: '#F1F5F9' },
  durBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  durBadgeText: { fontSize: 12, fontWeight: '600' },
  sheetSection: { borderTopWidth: 1, paddingTop: 16, marginBottom: 16 },
  sheetSectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1, paddingHorizontal: 14,
  },
  deleteBtnModal: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1, marginBottom: 16, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, paddingVertical: 13 },
  timeRow: { flexDirection: 'row' },
  overlapBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, padding: 10, marginBottom: 14,
    borderWidth: 1,
  },
  overlapText: { fontSize: 13 },
  btnSave: {
    borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  btnSaveText: { fontWeight: '700', fontSize: 16 },
  cancelText: { textAlign: 'center', fontSize: 14, paddingBottom: 8 },
  modalScroll: { flexGrow: 1 },
});
