# Scheduly — How the App Was Built

## What Is Scheduly?

Scheduly is a cross-platform scheduling and group coordination app. It runs on **iOS, Android, and Web** from a single codebase. Think of it as a shared calendar where you can manage your own schedule, create groups ("Circles") with friends or coworkers, chat with them, and use AI to help manage your day.

---

## The Big Picture

The entire app was built using one codebase written in **TypeScript** with **React Native** and **Expo**. Expo handles all the cross-platform complexity so we don't have to write separate code for iPhone vs Android vs Web.

The data lives in the cloud on **Supabase** (a backend service that provides a database, authentication, and real-time syncing). When you add an event on your phone, it saves to Supabase, and everyone in your Circle sees it instantly.

The AI assistant talks to three different AI providers (Groq, Grok, and Gemini) — but you can pick which one to use in Settings.

---

## Tech Stack (Plain English)

| Technology | What It Does |
|---|---|
| **React Native** | The core framework — lets us build mobile apps using JavaScript/TypeScript |
| **Expo SDK 54** | A tool on top of React Native that handles the hard parts (camera, fonts, haptics, etc.) |
| **Expo Router** | Handles navigation between screens — like a GPS for the app |
| **TypeScript** | JavaScript with extra safety features that catch bugs before they happen |
| **Supabase** | Backend-as-a-service — gives us a database, user accounts, and real-time syncing |
| **Groq / Grok / Gemini** | Three different AI services the assistant can use |
| **react-native-calendars** | The calendar widget you see on the home screen |
| **AsyncStorage** | Local storage on your device (used for preferences, not main data) |

---

## Project Structure (How the Code Is Organized)

```
Scheduly/
├── app/              # Screens (each file = one page in the app)
├── components/       # Reusable UI pieces (buttons, cards, etc.)
├── context/          # Global state management (auth, theme, preferences)
├── lib/              # Database layer (talks to Supabase)
├── utils/            # Helper tools (AI integrations, math, etc.)
├── hooks/            # Custom React hooks (responsive sizing, colors)
├── constants/        # Design tokens (colors, fonts, spacing)
├── data/             # Static/sample data
└── sql/              # Database setup scripts (run once on the server)
```

The **`app/` folder** is special — Expo Router uses the file names to create the app's navigation automatically. `app/login.tsx` becomes the login page, `app/(tabs)/chat.tsx` becomes the chat tab, etc.

---

## How Data Flows Through the App

```
You interact with a screen (tap a button, type text)
        ↓
The screen calls a function from AuthContext
        ↓
AuthContext calls a function from supabaseDb.ts
        ↓
supabaseDb sends a request to Supabase (the cloud database)
        ↓
Supabase saves/returns the data
        ↓
AuthContext updates its internal state
        ↓
The screen re-renders with the new data
```

**For real-time updates** (like chat messages or shared calendar changes): Supabase pushes the change to all connected devices through a "channel" — so when your friend adds an event, it pops up on your screen automatically without refreshing.

---

## Key Features — How They Work

### 1. User Accounts

Two types of users:

- **Registered users** — Sign up with email/password. Their data is saved to Supabase and syncs across devices.
- **Guest users** — Try the app without signing up. Guest data stays on the device only. Limited to 5 events and expires after 24 hours.

**How it was built:** When a user registers, Supabase Auth creates an account. When they log in, the `AuthContext` loads all their data (events, circles, messages) from Supabase into the app's memory. Guest mode uses the same data structures but stores everything locally and checks a timer to enforce the 24-hour limit.

### 2. Calendar (Home Screen)

The main screen shows a monthly calendar with dots on days that have events. Tap a day to see its agenda.

**How it was built:**
- Uses the `react-native-calendars` library for the calendar grid
- Events are fetched from Supabase and displayed as color-coded cards in the agenda
- Time slots are shown in 30-minute intervals
- You can swipe left on an event to delete it
- Past events are automatically marked as "archived" (hidden from the main view but recoverable in Profile)

### 3. Circles (Groups)

Circles let you share a calendar with other people. Each Circle has a name, a color, and a 6-character invite code.

**How it was built:**
- When you create a Circle, a row is inserted into the `circles` table and you become the owner
- An invite code is generated randomly (6 characters like "A3B9K2")
- When someone joins with that code, they get added to `circle_members`
- Everyone in the Circle can add events to `circle_events`, and changes sync in real-time via Supabase subscriptions
- The owner can toggle edit permissions per member

### 4. Circle Events (Shared Calendar)

Events inside a Circle are visible to all members in real-time.

**How it was built:**
- CRUD operations (Create, Read, Update, Delete) go through `supabaseDb.ts`
- Each event has a `circle_id` so it shows up only for members of that Circle
- Events have comments (with likes and threaded replies) — stored in `event_comments` table
- Real-time subscriptions listen for INSERT, UPDATE, DELETE on `circle_events`

### 5. Chat & Direct Messages

Two types of messaging: Circle chats (everyone in the Circle sees it) and DMs (between two people).

**How it was built:**
- Circle messages are stored in a `messages` table with a `circle_id`
- DMs use a `conversations` table with `conversation_participants` linking two users, and `conversation_messages` for the actual messages
- Messages support emoji reactions and threaded replies
- Real-time Supabase channels push new messages instantly
- You can delete messages you sent (which sets `deleted` to true, hiding the content)
- Typing indicators are shown locally (not broadcast to others)

### 6. AI Assistant

The assistant can:
- **Add, delete, or rename events** by typing "add lunch at 12pm tomorrow"
- **Create or join circles** by typing "create a circle called Family"
- **Update your profile** by typing "change my name to John"
- **Answer questions** like "What's my busiest day?" or "When am I free today?"
- **Use a real AI** (Groq, Grok, or Gemini) to answer open-ended questions about your schedule

**How it was built — the tiered system:**

```
Step 1: Check for "Direct Actions"
  (regex patterns for adding events, deleting, etc.)
  If matched → execute immediately, done.

Step 2: If no direct action matched, try Smart AI
  (Groq by default, or whichever AI you chose in Settings)
  Send the user's query + their full schedule to the AI
  → Returns a natural language answer

Step 3: If AI is disabled or fails, use rule-based fallback
  (pattern matching for "free slots", "busiest day", "next event", "clear schedule")
```

Each AI provider (Groq, Grok, Gemini) has its own file in `utils/` — they all return the same format so the app can swap between them seamlessly.

### 7. Dark Mode

The app has a light and dark theme. The user controls this manually in Profile (not tied to system settings).

**How it was built:**
- `ThemeContext` generates a palette of ~24 color tokens based on the selected mode
- Each component uses `useTheme()` to get its colors
- Light palette: white backgrounds, dark text, blue accents
- Dark palette: dark navy backgrounds, light text, teal accents
- The preference is saved to AsyncStorage so it persists across app restarts

### 8. Profile & Preferences

The Profile screen shows user stats and lets you edit settings.

**How it was built:**
- Profile edits (name, bio, email) call Supabase to update the user record
- Password changes go through Supabase Auth
- Archived events can be restored or permanently deleted
- Preferences (compact layout, notifications, AI provider) are saved to AsyncStorage via `PrefsContext`
- Account deletion calls a Supabase function to remove the user and all their data

---

## State Management (How the App Keeps Track of Everything)

There's no Redux or other complex state library — just **React Context** (a built-in React feature for sharing data across components).

Three contexts:

1. **AuthContext** (~1700 lines) — The big one. Holds the current user, all events, all circles, all chat messages, and all the functions to manipulate them. Every screen imports from this.

2. **ThemeContext** — Just the current color palette (light or dark) and a toggle function.

3. **PrefsContext** — User preferences (compact layout, notification settings, which AI to use, API keys).

When you add an event, `AuthContext.addEvent()` is called. It sends the data to Supabase, waits for confirmation, then updates its internal array of events. Because all screens share the same context, they all re-render with the new event automatically.

---

## The Database (Supabase / PostgreSQL)

The database has these main tables:

| Table | Purpose |
|---|---|
| `profiles` | User info (name, bio, avatar) |
| `events` | Personal calendar events |
| `circles` | Group info (name, invite code, owner) |
| `circle_members` | Who belongs to which Circle |
| `circle_events` | Shared calendar events inside Circles |
| `messages` | Circle chat messages |
| `conversations` | DM conversations |
| `conversation_messages` | DM messages |
| `event_comments` | Comments on shared events |
| `message_reactions` | Emoji reactions on messages |
| `comment_likes` | Likes on event comments |

Row-Level Security (RLS) is enabled on every table — this means the database itself enforces that users can only see or edit data they have permission to access. Even if someone bypasses the app, the database blocks unauthorized access.

---

## Design System

All the visual design is controlled by constants in `constants/`:

- **Colors** (`theme.ts`): Two complete palettes (light & dark) with background, surface, text, primary, accent, success, warning, danger, and border colors
- **Spacing** (`spacing.ts`): A consistent scale for margins, padding, border radius, font sizes, and font weights

Every component imports from these files, ensuring the app looks consistent. If you change the primary color in `theme.ts`, it changes everywhere.

---

## Responsive Design

Since the app runs on phones, tablets, and web browsers, a custom `useResponsive` hook handles sizing:

- `s(size)` — Scales a value based on screen width
- `vs(size)` — Scales based on screen height
- `hp(percent)`, `wp(percent)` — Get percentage of screen height/width
- `isSmallDevice` — Boolean for very small screens

This means a button that looks right on an iPhone SE also looks right on a tablet, without writing separate layouts.

---

## The App Router (Navigation Map)

```
App Launch
    ↓
Root Layout (_layout.tsx)
  ├── Checks if logged in → yes → Tab Screens
  │   ├── Calendar Tab (index.tsx)
  │   ├── Circles Tab (circles.tsx)
  │   ├── Chat Tab (chat.tsx)
  │   ├── Assistant Tab (assistant.tsx)
  │   └── Profile Tab (profile.tsx)
  │
  └── Not logged in → Login Screen (login.tsx)
        ├── Login with email/password
        ├── Register new account
        └── Try as Guest (limited mode)
```

The root layout also wraps the entire app in providers:
1. **ThemeProvider** — Dark mode colors
2. **PrefsProvider** — Saved preferences
3. **AuthProvider** — User data and all app logic

---

## Summary of Architectural Decisions

| Decision | Why |
|---|---|
| **React Context instead of Redux** | Simple enough for this app; avoids extra dependency bloat |
| **Manual dark mode toggle** | User control rather than following system; simpler to implement |
| **File-based routing (Expo Router)** | Zero config navigation; file name = route name |
| **Three AI providers** | Flexibility — if one goes down or has bad pricing, swap to another |
| **Guest mode** | Lowers barrier to trying the app; 24h limit encourages sign-up |
| **Supabase over custom backend** | Fastest path to production — auth, database, real-time, and RLS built-in |
| **No push notifications yet** | Requires additional infrastructure (notifications server, device tokens); planned for future |
| **No unit tests yet** | Initial focus was on rapid feature development; testing infrastructure is not yet set up |

---

## Files Worth Reading (Key Source Files)

| File | What It Contains |
|---|---|
| `context/AuthContext.tsx` | The brain of the app — all state and logic |
| `lib/supabaseDb.ts` | Every database operation (the data layer) |
| `lib/supabaseClient.ts` | The Supabase connection configuration |
| `app/(tabs)/index.tsx` | The calendar screen (home page) |
| `app/(tabs)/circles.tsx` | Circles list |
| `app/(tabs)/circle-detail.tsx` | A single Circle's shared calendar |
| `app/(tabs)/chat.tsx` | Chat screen |
| `app/(tabs)/assistant.tsx` | AI assistant screen |
| `utils/groq.ts` | Groq AI integration |
| `utils/grok.ts` | Grok AI integration |
| `utils/gemini.ts` | Gemini AI integration |
| `utils/groupSync.ts` | Free time window finder |
| `constants/theme.ts` | All color palettes |
| `constants/spacing.ts` | Design tokens (spacing, fonts, radius) |
| `components/ui/button.tsx` | Themed button component |
| `hooks/useResponsive.ts` | Screen size scaling |
