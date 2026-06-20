import { useState, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { ThemedText } from '@/components/themed-text';
import { fetchGroqResponse, getGroqApiKey } from '@/utils/groq';
import { findFreeWindows } from '@/utils/groupSync';
import { useResponsive } from '@/hooks/useResponsive';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const MOCK_RESPONSES = [
  "I've checked your calendar - you're free tomorrow from 2 PM to 4 PM. Want me to block that time?",
  "Sure! I can help you reschedule that. What day works best for you?",
  "You have 3 events this week. Your busiest day is Wednesday with 2 back-to-back meetings.",
  "I noticed a potential conflict on Friday. Your gym session overlaps with the team standup. Should I adjust one?",
  "Done! I've added a reminder 30 minutes before your appointment.",
  "Based on your schedule, I'd suggest moving the weekly review to Thursday at 4 PM. Shall I do that?",
];

let mockIndex = 0;
const getMockResponse = () => MOCK_RESPONSES[mockIndex++ % MOCK_RESPONSES.length];

const QUICK_CHIPS = ['Free slots today?', 'Busiest day?', 'Next event?', 'Clear Friday'];

export default function AssistantScreen() {
  const { colors } = useAppTheme();
  const { s, isSmallDevice, pad } = useResponsive();
  const [messages, setMessages] = useState<Message[]>([{
    id: 'm0', role: 'assistant',
    text: "Hi! I'm your Scheduly AI. Ask me anything about your schedule and I'll help you stay on top of it.",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList>(null);

  const { events, user, addEvent, editEvent, removeEvent, addCircle, joinCircleByCode, removeCircle, circles, updateProfile } = useAuth();
  const { prefs } = usePrefs();

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    const userMsg: Message = { id: `m_${Date.now()}`, role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    const shouldUseGroq = prefs.useGroq && !!getGroqApiKey();
    let responseText = '';

    responseText = (await executeAction(text, { events, user, circles, addEvent, editEvent, removeEvent, addCircle, joinCircleByCode, removeCircle, updateProfile })) || '';

    if (!responseText && shouldUseGroq) {
      try {
        const eventSummary = events.length === 0
          ? 'No events scheduled.'
          : events.slice(0, 20).map(e =>
              `- ${e.title} on ${e.date} at ${e.startTime}-${e.endTime}${e.notes ? ` (${e.notes})` : ''}`
            ).join('\n');
        const archivedSummary = events.filter((e: any) => e.archived).length > 0
          ? events.filter((e: any) => e.archived).slice(0, 10).map(e =>
              `- ${e.title} on ${e.date} at ${e.startTime}-${e.endTime} (archived)`
            ).join('\n')
          : 'None.';
        const circleSummary = circles.length === 0
          ? 'Not part of any circles.'
          : circles.map((c: any) =>
              `- ${c.name}${c.members ? ` (${c.members.length} members)` : ''}`
            ).join('\n');
        const prompt = `You are the Scheduly scheduling assistant for ${user?.name || 'a user'}. Today's local date is ${localDateStr()} and local time is ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Answer concisely in 1-3 sentences.

User profile:
- Name: ${user?.name || 'Unknown'}
- Email: ${user?.email || 'Not set'}
- Bio: ${user?.bio || 'No bio'}

Current events:
${eventSummary}

Archived events:
${archivedSummary}

Your circles:
${circleSummary}

User asked: ${text}`;
        responseText = await fetchGroqResponse(prompt, prefs.groqApiKey);
      } catch (error) {
        console.warn('Groq fetch failed:', error);
        responseText = '';
      }
    }

    if (!responseText) {
      responseText = generateAnswer(text, events, user, prefs) || getMockResponse();
    }

    setTimeout(() => {
      const assistantMsg: Message = {
        id: `m_${Date.now() + 1}`, role: 'assistant',
        text: responseText, timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }, 700);

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(text: string): string | null {
  const lower = text.toLowerCase();
  const today = new Date();
  if (/^today$/i.test(text)) return localDateStr(today);
  if (/^tomorrow$/i.test(text)) { const d = new Date(today); d.setDate(d.getDate() + 1); return localDateStr(d); }
  const dayNames: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const dayMatch = lower.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (dayMatch) {
    const d = new Date(today);
    const target = dayNames[dayMatch[1]];
    d.setDate(d.getDate() + ((target - d.getDay() + 6) % 7) + 1);
    return localDateStr(d);
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return text;
  return null;
}

function parseTimeRange(text: string): { start: string; end: string } | null {
  const rangeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (rangeMatch) {
    const sh = parseInt(rangeMatch[1]), sm = parseInt(rangeMatch[2] || '0');
    let eh = parseInt(rangeMatch[4]), em = parseInt(rangeMatch[5] || '0');
    let sAmpm = (rangeMatch[3] || '').toLowerCase(), eAmpm = (rangeMatch[6] || '').toLowerCase();
    if (!eAmpm && sAmpm) eAmpm = sAmpm;
    const to24 = (h: number, a: string) => a === 'pm' && h < 12 ? h + 12 : a === 'am' && h === 12 ? 0 : h;
    const startH = to24(sh, sAmpm), endH = to24(eh, eAmpm);
    return { start: `${String(startH).padStart(2, '0')}:${String(sm).padStart(2, '0')}`, end: `${String(endH).padStart(2, '0')}:${String(em).padStart(2, '0')}` };
  }
  const singleMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (singleMatch) {
    const h = parseInt(singleMatch[1]), m = parseInt(singleMatch[2] || '0');
    const a = singleMatch[3].toLowerCase();
    const h24 = a === 'pm' && h < 12 ? h + 12 : a === 'am' && h === 12 ? 0 : h;
    const start = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const endH = h24 + 1;
    return { start, end: `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }
  return null;
}

async function executeAction(text: string, ctx: {
  events: any[]; user: any; circles: any[];
  addEvent: (e: any) => any; editEvent: (id: string, u: any) => any; removeEvent: (id: string) => void;
  addCircle: (c: any) => any; joinCircleByCode: (code: string) => Promise<any>; removeCircle: (id: string) => void;
  updateProfile: (u: any) => Promise<boolean>;
}): Promise<string | null> {
  const lower = text.toLowerCase().trim();

  // ── Add event ──
  const addMatch = text.match(/(?:add|create|schedule)\s+(?:an?\s+)?(?:event\s+)?["']?([^"'\n]+?)["']?\s*(?:on|for|this)\s+(.+)/i);
  if (addMatch || /^(?:add|create|schedule)\s+(?:an?\s+)?event/i.test(lower)) {
    let title: string, dateStr: string, timeStr = '';
    if (addMatch) {
      title = addMatch[1].trim();
      const rest = addMatch[2].trim();
      const dateParts = rest.match(/(today|tomorrow|next\s+\w+|\d{4}-\d{2}-\d{2}|\w+\s+\d+)/i);
      if (!dateParts) return `I need a date. Try "Add event ${title} tomorrow at 3pm".`;
      dateStr = dateParts[1];
      const resolved = parseDate(dateStr);
      if (!resolved) return `I couldn't understand the date "${dateStr}". Try "today", "tomorrow", or "next monday".`;
      timeStr = rest.replace(dateParts[0], '').trim();
      const timeRes = parseTimeRange(timeStr || rest);
      if (!timeRes) return `I need a time. Try "Add event ${title} tomorrow at 3pm".`;
      const result = ctx.addEvent({ title, date: resolved, startTime: timeRes.start, endTime: timeRes.end, color: '#2DD4BF' });
      if (result === 'overlap') return `This event overlaps with an existing event on ${resolved}. Try a different time.`;
      return `Done! Added "${title}" for ${new Date(resolved + 'T00:00:00').toLocaleDateString()} at ${timeRes.start}.`;
    }
  }

  // ── Delete event ──
  const delMatch = text.match(/(?:delete|remove)\s+(?:the\s+)?(?:event\s+)?["']?([^"'\n]+?)["']?\s*(?:from\s+(?:my\s+)?schedule)?$/i);
  if (delMatch) {
    const title = delMatch[1].trim().toLowerCase();
    const found = ctx.events.find((e: any) => e.title.toLowerCase().includes(title));
    if (!found) return `I couldn't find an event matching "${title}".`;
    ctx.removeEvent(found.id);
    return `Removed "${found.title}" from your schedule.`;
  }
  const delShort = text.match(/^(?:delete|remove)\s+["']?([^"'\n]+?)["']?$/i);
  if (delShort && ctx.events.some((e: any) => e.title.toLowerCase().includes(delShort[1].trim().toLowerCase()))) {
    const title = delShort[1].trim().toLowerCase();
    const found = ctx.events.find((e: any) => e.title.toLowerCase().includes(title));
    if (found) { ctx.removeEvent(found.id); return `Removed "${found.title}" from your schedule.`; }
  }

  // ── Edit / rename event ──
  const renameMatch = text.match(/(?:rename|change)\s+["']?([^"'\n]+?)["']?\s+to\s+["']?([^"'\n]+?)["']?$/i);
  if (renameMatch) {
    const oldTitle = renameMatch[1].trim().toLowerCase();
    const newTitle = renameMatch[2].trim();
    const found = ctx.events.find((e: any) => e.title.toLowerCase().includes(oldTitle));
    if (!found) return `I couldn't find an event matching "${oldTitle}".`;
    ctx.editEvent(found.id, { title: newTitle });
    return `Renamed "${found.title}" to "${newTitle}".`;
  }
  const moveMatch = text.match(/(?:move|reschedule)\s+["']?([^"'\n]+?)["']?\s+to\s+(.+)/i);
  if (moveMatch) {
    const title = moveMatch[1].trim().toLowerCase();
    const rest = moveMatch[2].trim();
    const found = ctx.events.find((e: any) => e.title.toLowerCase().includes(title));
    if (!found) return `I couldn't find an event matching "${title}".`;
    const dateRes = parseDate(rest);
    if (dateRes) {
      ctx.editEvent(found.id, { date: dateRes });
      return `Moved "${found.title}" to ${new Date(dateRes + 'T00:00:00').toLocaleDateString()}.`;
    }
    const timeRes = parseTimeRange(rest);
    if (timeRes) {
      ctx.editEvent(found.id, { startTime: timeRes.start, endTime: timeRes.end });
      return `Rescheduled "${found.title}" to ${timeRes.start}-${timeRes.end}.`;
    }
    const bothMatch = rest.match(/(today|tomorrow|next\s+\w+|\d{4}-\d{2}-\d{2})\s+(.+)/i);
    if (bothMatch) {
      const d = parseDate(bothMatch[1]);
      const t = parseTimeRange(bothMatch[2]);
      if (d && t) {
        ctx.editEvent(found.id, { date: d, startTime: t.start, endTime: t.end });
        return `Moved "${found.title}" to ${new Date(d + 'T00:00:00').toLocaleDateString()} at ${t.start}.`;
      }
    }
    return `I couldn't parse the new date/time. Try "Move ${title} to tomorrow at 3pm".`;
  }

  // ── Create circle ──
  const circleMatch = text.match(/(?:create|make|start)\s+(?:a\s+)?(?:circle\s+)(?:called\s+)?["']?([^"'\n]+?)["']?$/i);
  if (circleMatch) {
    const name = circleMatch[1].trim();
    const newCircle = ctx.addCircle({ name, color: '#2DD4BF', members: [ctx.user?.name || 'You'], inviteCode: '', isOwner: true, canEdit: true });
    return `Created circle "${newCircle.name}"! Share the invite code with friends to add them.`;
  }

  // ── Join circle ──
  const joinMatch = text.match(/(?:join)\s+(?:circle\s+)?(?:\s+with\s+code\s+)?["']?([A-Za-z0-9]{6,})["']?/i);
  if (joinMatch) {
    const code = joinMatch[1].trim().toUpperCase();
    const result = await ctx.joinCircleByCode(code);
    if (result.success) return `Joined "${result.circle?.name}"! You can now see circle events and members.`;
    return result.error || 'Could not join circle. Check the invite code and try again.';
  }

  // ── Delete circle ──
  const delCircleMatch = text.match(/(?:delete|remove)\s+(?:the\s+)?(?:circle\s+)?["']?([^"'\n]+?)["']?$/i);
  if (delCircleMatch) {
    const name = delCircleMatch[1].trim().toLowerCase();
    const found = ctx.circles.find((c: any) => c.name.toLowerCase().includes(name));
    if (!found) return `I couldn't find a circle matching "${name}".`;
    ctx.removeCircle(found.id);
    return `Deleted circle "${found.name}".`;
  }

  // ── Update profile name ──
  const nameMatch = text.match(/(?:change|set|update)\s+(?:my\s+)?name\s+to\s+["']?([^"'\n]+?)["']?$/i);
  if (nameMatch) {
    const newName = nameMatch[1].trim();
    await ctx.updateProfile({ name: newName });
    return `Updated your name to "${newName}".`;
  }

  // ── Update profile bio ──
  const bioMatch = text.match(/(?:change|set|update)\s+(?:my\s+)?bio\s+to\s+["']?(.+?)["']?$/i);
  if (bioMatch) {
    const newBio = bioMatch[1].trim();
    await ctx.updateProfile({ bio: newBio });
    return `Updated your bio.`;
  }

  return null;
}

function generateAnswer(q: string, events: any[], user: any, prefsObj: any) {
  const lower = q.toLowerCase();
  const todayStr = localDateStr();

  // ── How-to questions (info only, actions handled above) ──
  if (/(how do i|how to).*leave.*circle/.test(lower)) {
    return 'Open the circle, tap Leave Circle. If you are the owner you may need to transfer ownership or delete the circle first.';
  }
  if (/(invite|invite code|share).*circle/.test(lower)) {
    return 'Open the circle and tap the invite code to copy it. Share it with anyone you want to add. They can join from the Circles tab.';
  }
  if (/(remove|kick).*member/.test(lower)) {
    return 'Open the circle detail, find the member, and tap Remove. Only the circle owner can remove members.';
  }
  if (/(events today|what.*today|schedule.*today)/.test(lower)) {
    const todays = events.filter((e: any) => e.date === todayStr);
    if (todays.length === 0) return 'You have no events scheduled for today.';
    return todays.map((e: any) => `${e.title} at ${e.startTime} - ${e.endTime}${e.notes ? ` (${e.notes})` : ''}`).join('\n');
  }
  if (/(events tomorrow|what.*tomorrow|schedule.*tomorrow)/.test(lower)) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tStr = localDateStr(tomorrow);
    const evts = events.filter((e: any) => e.date === tStr);
    if (evts.length === 0) return 'Nothing scheduled for tomorrow.';
    return evts.map((e: any) => `${e.title} at ${e.startTime} - ${e.endTime}${e.notes ? ` (${e.notes})` : ''}`).join('\n');
  }

  // ── Profile & Preferences ──
  if (/(dark mode|light mode|theme|toggle.*dark)/.test(lower)) {
    return 'You can toggle dark mode from your Profile screen — look for the Dark Mode switch near the top.';
  }
  if (/(compact layout|compact mode)/.test(lower)) {
    return 'Compact layout is a preference in your Profile → Preferences. Enabling it reduces paddings and makes views denser.';
  }
  if (/(week numbers|show week numbers)/.test(lower)) {
    return 'Toggle Show Week Numbers in Profile → Preferences to display ISO week numbers on the calendar.';
  }
  if (/(ai suggestions|suggestions|ai)/.test(lower) && /(disable|turn off|off)/.test(lower)) {
    return 'You can toggle AI Suggestions in Profile → Preferences. When off, dashboard suggestions are hidden.';
  }
  if (/(notifications|notif)/.test(lower)) {
    return 'Notifications are not currently supported in Scheduly. You can follow the project for updates.';
  }

  // ── Calendar / View ──
  if (/(switch.*month|month.*view|calendar.*view)/.test(lower)) {
    return 'Tap the Month/Agenda toggle at the top of the dashboard to switch between the calendar grid and the list view.';
  }
  if (/(switch.*agenda|agenda.*view|list.*view)/.test(lower)) {
    return 'Tap the Month/Agenda toggle at the top of the dashboard to switch to the agenda list view.';
  }

  // ── Schedule-aware answers ──
  if (/(free slots|free time|available)/.test(lower)) {
    const windows = findFreeWindows(events, 30, 7);
    if (windows.length === 0) return 'No free slots found in the next 7 days.';
    return windows.slice(0, 3).map(w =>
      `${w.label}: free from ${w.startTime} to ${w.endTime}`
    ).join('\n');
  }

  if (/(busiest day)/.test(lower) || /(busiest)/.test(lower)) {
    const days = new Map<string, number>();
    const now = new Date();
    for (let i=0;i<7;i++){ const d = new Date(now); d.setDate(d.getDate()+i); const k = localDateStr(d); days.set(k, 0); }
    events.forEach((e: any)=>{ if (days.has(e.date)) days.set(e.date, (days.get(e.date)||0)+1); });
    let best = '', bestN = 0;
    for (const [k,v] of days) if (v>bestN){ best=k; bestN=v; }
    if (!bestN) return 'You have no events in the next 7 days.';
    return `Your busiest day is ${new Date(best).toLocaleDateString()} with ${bestN} event${bestN>1?'s':''}.`;
  }

  if (/(next event|upcoming event|what.*next)/.test(lower)) {
    const now = new Date();
    const upcoming = events
      .map((e: any)=>({ ...e, when: new Date(`${e.date}T${e.startTime}:00`) }))
      .filter((e: any)=>e.when > now)
      .sort((a: any,b: any)=>a.when.getTime()-b.when.getTime());
    if (upcoming.length===0) return 'No upcoming events found.';
    const ne = upcoming[0];
    return `Next up: ${ne.title} on ${new Date(ne.date).toLocaleDateString()} at ${ne.startTime}.`;
  }

  if (/(how many|count|total).*event/.test(lower)) {
    return `You have ${events.length} event${events.length !== 1 ? 's' : ''} on your calendar.`;
  }

  // ── Default ──
  if (/(how|what|why|where|can you|help)/.test(lower)) {
    return "I can help with events, circles, and preferences. Try: 'Add event meeting tomorrow at 3pm', 'Next event', 'Free slots today', or 'Create circle Book Club'.";
  }

  return '';
}

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border, paddingHorizontal: pad(16, 20), paddingVertical: s(18), paddingTop: s(36), gap: s(14) }]}>
        <View style={[styles.aiAvatar, { backgroundColor: colors.accent, width: s(54), height: s(54), borderRadius: s(16) }]}>
          <Ionicons name="sparkles" size={s(26)} color={colors.onAccent} />
          <View style={[styles.onlineDot, { borderColor: colors.background }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: s(20) }]}>Scheduly AI</Text>
          <Text style={[styles.headerSub, { color: colors.muted, fontSize: s(14) }]}>{typing ? 'Typing...' : 'Always online'}</Text>
          {prefs.useGroq && !getGroqApiKey() ? (
            <Text style={[styles.headerHint, { color: colors.warning, fontSize: s(12) }]}>Groq API key missing. Using local assistant fallback.</Text>
          ) : null}
        </View>
        <View style={[styles.headerBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '40', borderRadius: s(10), paddingHorizontal: s(14), paddingVertical: s(6) }]}>
          <Text style={[styles.headerBadgeText, { color: colors.accent, fontSize: s(14) }]}>AI</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.messageList, { padding: pad(12, 16), paddingBottom: s(8) }]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={[styles.bubbleRow, { marginBottom: s(12) }, isUser ? styles.rowUser : styles.rowAI]}>
                {!isUser && (
                  <View style={[styles.aiBubbleAvatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '40', width: s(26), height: s(26), borderRadius: s(8), marginRight: s(8) }]}>
                    <Ionicons name="sparkles" size={s(12)} color={colors.accent} />
                  </View>
                )}
                <View style={[
                  styles.bubble,
                  { maxWidth: isSmallDevice ? '82%' : '76%', borderRadius: s(18), paddingHorizontal: s(14), paddingVertical: s(10) },
                  isUser
                    ? [styles.bubbleUser, { backgroundColor: colors.accentStrong }]
                    : [styles.bubbleAI, { backgroundColor: colors.surface, borderColor: colors.border }],
                ]}>
                  <Text style={[styles.bubbleText, { color: isUser ? '#fff' : colors.text, fontSize: s(14), lineHeight: s(21) }, isUser && styles.bubbleTextUser]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, { color: isUser ? 'rgba(255,255,255,0.5)' : colors.muted, fontSize: s(10) }]}>
                    {fmt(item.timestamp)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={typing ? (
            <View style={[styles.bubbleRow, { marginBottom: s(12) }, styles.rowAI]}>
              <View style={[styles.aiBubbleAvatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '40', width: s(26), height: s(26), borderRadius: s(8), marginRight: s(8) }]}>
                <Ionicons name="sparkles" size={s(12)} color={colors.accent} />
              </View>
              <View style={[styles.bubble, styles.bubbleAI, styles.typingBubble, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(18), paddingVertical: s(14), paddingHorizontal: s(14) }]}>
                <View style={[styles.typingDots, { gap: s(5) }]}>
                  {[0, 1, 2].map(i => <View key={i} style={[styles.dot, { width: s(7), height: s(7), borderRadius: s(4) }]} />)}
                </View>
              </View>
            </View>
          ) : null}
        />

        {/* Input area */}
        <View style={[styles.inputArea, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? s(24) : s(12), paddingTop: s(10) }]}>
          {/* Quick chips */}
          <FlatList
            horizontal
            data={QUICK_CHIPS}
            keyExtractor={c => c}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.chips, { paddingHorizontal: pad(12, 16), gap: s(8), marginBottom: s(10) }]}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: s(20), paddingHorizontal: s(14), paddingVertical: s(7) }]} onPress={() => setInput(item)} accessibilityLabel={`Ask: ${item}`} accessibilityRole="button">
                <ThemedText style={[styles.chipText, { color: colors.muted, fontSize: s(12) }]}>{item}</ThemedText>
              </TouchableOpacity>
            )}
          />
          <View style={[styles.inputBar, { paddingHorizontal: pad(12, 16), gap: s(10) }]}>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, borderRadius: s(18), paddingHorizontal: s(16), paddingVertical: s(12), fontSize: s(14), maxHeight: s(100) }]}
              placeholder="Ask about your schedule..."
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              multiline
              returnKeyType="send"
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.accentStrong, width: s(42), height: s(42), borderRadius: s(14) }, !input.trim() && { backgroundColor: colors.surfaceAlt }]}
              onPress={sendMessage}
              disabled={!input.trim()}
              activeOpacity={0.8}
              accessibilityLabel="Send message to AI assistant"
              accessibilityRole="button"
              accessibilityState={{ disabled: !input.trim() }}
            >
              <Ionicons name="arrow-up" size={s(18)} color={colors.onAccent} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080B14' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#0F1629',
    backgroundColor: '#080B14',
  },
  aiAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#2DD4BF', justifyContent: 'center', alignItems: 'center',
  },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#10B981', borderWidth: 2, borderColor: '#080B14',
  },
  headerTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#475569', fontSize: 12, marginTop: 1 },
  headerHint: { marginTop: 6, fontSize: 11, color: '#FBBF24' },
  headerBadge: {
    backgroundColor: '#134E4A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#2DD4BF40',
  },
  headerBadgeText: { color: '#5EEAD4', fontSize: 11, fontWeight: '700' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  rowAI: { justifyContent: 'flex-start' },
  aiBubbleAvatar: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#134E4A', justifyContent: 'center', alignItems: 'center',
    marginRight: 8, borderWidth: 1, borderColor: '#2DD4BF40',
  },
  bubble: { maxWidth: '76%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: '#0F766E', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#0F1629', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#1E2D4A' },
  bubbleText: { color: '#CBD5E1', fontSize: 14, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  bubbleTime: { color: '#475569', fontSize: 10, marginTop: 5, textAlign: 'right' },
  typingBubble: { paddingVertical: 14 },
  typingDots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#64748B' },
  inputArea: {
    borderTopWidth: 1, borderTopColor: '#0F1629',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12, paddingTop: 10,
    backgroundColor: '#080B14',
  },
  chips: { paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  chip: {
    backgroundColor: '#0F1629', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1E2D4A',
  },
  chipText: { color: '#64748B', fontSize: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, gap: 10 },
  textInput: {
    flex: 1, backgroundColor: '#0F1629', color: '#F1F5F9',
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: '#1E2D4A',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnOff: { backgroundColor: '#131C30' },
});
