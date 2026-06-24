# Scheduly — User Manual

Scheduly is a cross-platform scheduling and group coordination app. This manual walks you through every feature step by step.

---

## Table of Contents

1. [First-Time Setup](#1-first-time-setup)
2. [Dashboard & Calendar](#2-dashboard--calendar)
3. [Creating & Managing Events](#3-creating--managing-events)
4. [Circles (Groups)](#4-circles-groups)
5. [Circle Events & Comments](#5-circle-events--comments)
6. [Chat](#6-chat)
7. [AI Assistant](#7-ai-assistant)
8. [Profile & Preferences](#8-profile--preferences)
9. [Archived Events](#9-archived-events)
10. [Signing Out](#10-signing-out)

---

## 1. First-Time Setup

### Step 1: Open the App

When you launch Scheduly, you see the login screen with two options.

### Step 2: Choose Your Path

- **Try as Guest** — tap to explore immediately. Guest accounts:
  - Expire after **24 hours**
  - Are limited to **5 events**
  - Only access the Dashboard
  - Store all data locally on your device
- **Create Account** — tap to register for full access:
  1. Enter your **full name**
  2. Enter your **email address**
  3. Enter a **password** (minimum 6 characters)
  4. Tap **"Create Account"**
  5. Your data now syncs to the cloud and all features unlock

### Step 3: Sign In (Returning Users)

1. Enter your **email** and **password**
2. Tap **"Sign In"**

---

## 2. Dashboard & Calendar

The **Dashboard** (tab labeled `/`) is your home screen. It has two views.

### Step 1: Use the Month Calendar

- The current month displays with **dots** on dates that have events
- **Tap** any date to select it — the agenda below updates to show that day's events
- **Swipe left or right** to switch months

### Step 2: Use the Agenda List

Below the calendar, a timeline list shows upcoming events grouped by date. Each event card shows:

- Start and end time
- Event title
- Optional notes preview
- Duration

**Pull down** on the agenda to refresh your events from the cloud.

### Step 3: View AI Suggestions (Optional)

If enabled in Profile settings, a **"Scheduly AI"** card appears at the top of the dashboard. It shows:

- Your busiest day
- Free time slots
- Overlap alerts
- Weekly summaries

---

## 3. Creating & Managing Events

### Step 1: Create an Event

1. Tap the **+ (FAB)** button at the bottom-right of the Dashboard
2. Fill in the event details:
   - **Title** (required)
   - **Date** (pre-filled with the selected date)
   - **Start Time** — tap to open the 30-minute slot picker
   - **End Time** — tap to open the 30-minute slot picker
   - **Color** — tap to select from 8 colors, or long-press for quick pick
   - **Notes** (optional, free text)
3. The app automatically checks for **time overlaps** with existing events and alerts you
4. Tap **"Save Event"** to confirm

### Step 2: Edit an Event

1. **Tap** the event on the calendar
2. The edit modal opens
3. Modify any field
4. Tap **"Save Changes"**

### Step 3: Delete an Event

1. **Tap** the event on the calendar to open it
2. Tap **"Delete Event"**
3. Confirm when prompted

### Auto-Archiving

Once an event's date has passed, it is automatically **archived**. It no longer appears on the dashboard but is preserved in your archived events list (see [Archived Events](#9-archived-events)).

---

## 4. Circles (Groups)

Circles let you share events and chat with a group of people.

### Step 1: Create a Circle

1. Go to the **Circles** tab
2. Tap **"Create Circle"**
3. Enter a **name** and pick a **color**
4. A random **6-character invite code** is generated automatically
5. Tap **"Create"**
6. You are now the **owner** of the circle

### Step 2: Join a Circle

1. Go to the **Circles** tab
2. Tap **"Join Circle"**
3. Enter the **6-character invite code** from a friend
4. Tap **"Join"**

### Step 3: Share an Invite Code

1. On a circle card, tap the **share icon**
2. Select a messaging app to send the invite code

### Step 4: View Circle Details

Tap any circle to open its detail screen.

**Members tab** — see who's in the circle. The owner can:

- Tap **"Add Member"** and search by name to add people
- **Swipe** or tap to remove members
- Toggle **"Edit Permissions"** — when on, members can create, edit, and delete circle events

### Step 5: Leave or Delete a Circle

- **Non-owners**: open the circle detail → tap **"Leave Circle"**
- **Owner**: open the circle detail → tap **"Delete Circle"** (removes the circle for everyone)

---

## 5. Circle Events & Comments

### Step 1: Create a Circle Event

1. Open a circle's detail screen
2. Tap **"New Event"** (requires edit permission or owner status)
3. Fill in **title**, **date**, **start/end time**, **color**, and **notes**
4. Tap **"Save"**
5. The event is now visible to all circle members

### Step 2: Comment on a Circle Event

1. **Tap** any circle event to expand it
2. Scroll to the **comment section**
3. Type your message and tap **send**
4. **Like** a comment by tapping the **heart icon**
5. **Reply** to a comment by tapping the **reply icon** — your reply appears threaded

---

## 6. Chat

The **Chat tab** has two sections.

### Circle Chats

1. All your circles are listed, sorted by most recent message
2. **Tap** a circle to enter the group chat

**Actions in chat:**

- **Send a message**: type in the input bar and hit send
- **React to a message**: long-press a message → pick an emoji (❤️ 👍 😂 🎉 🔥 💯)
- **Reply to a message**: swipe or tap the reply icon on a message
- **Delete a message**: long-press your own message → tap **Delete**
- **Leave the circle**: tap the circle info header → **Leave Circle**

### Direct Messages (DMs)

1. Your 1-on-1 conversations are listed, sorted by most recent message
2. **Start a new DM**: tap the search bar → search for a user by name → select them
3. A new conversation opens

**All message features** (reactions, replies, deletion) work the same as in Circle Chats.

**Delete a conversation**: open a DM → tap the info header → **Delete Conversation**

### Typing Indicators

When someone in a circle or DM is typing, a **"typing..."** indicator appears at the bottom of the chat.

---

## 7. AI Assistant

The **Assistant tab** is your AI-powered scheduling helper.

### Step 1: Send a Request

1. Type a natural-language request in the input bar
2. Or tap one of the **quick chips** below the input bar

### Step 2: Review the Response

The assistant responds in three ways, in order:

**a. Direct Actions** — recognizes and executes commands immediately:

- "Add dinner at 7pm tomorrow"
- "Delete my 3pm meeting"
- "Rename 'Lunch' to 'Brunch'"
- "Create a circle called Book Club"
- "Join circle ABC123"
- "Update my bio to 'Busy professional'"

**b. Smart AI (Groq)** — if no direct action matches and Groq is enabled, the assistant sends your query (plus your full schedule) to an AI for a natural answer

**c. Rule-based fallback** — answers common questions locally:

- "Free slots today?"
- "Busiest day this week?"
- "What's my next event?"
- "Clear my schedule on Friday"

### Step 3: Use Quick Chips

Tap these pre-built prompts for instant answers:

- **"Free slots today?"**
- **"Busiest day?"**
- **"Next event?"**
- **"Clear Friday"**

### Step 4: Enable Smart AI

1. Go to **Profile**
2. Toggle **"Use Smart AI Assistance"** to on
3. Optionally set your **Groq API key** (a default key is already configured)

---

## 8. Profile & Preferences

### Step 1: View Your Profile

The **Profile tab** shows:

- Your **name**, **email**, and **bio**
- **Account badge** — "Registered" (full account) or "Guest" (trial)
- **Stats** — total active events and number of circles

### Step 2: Edit Your Profile

1. Tap **"Edit Profile"**
2. Change any field
3. Changing your email requires re-entering your password

### Step 3: Customize Appearance

Toggle **Dark Mode** on or off to switch between light and dark themes.

### Step 4: Configure AI Preferences

- **"Use Smart AI Assistance"** — enables Groq-powered AI responses in the Assistant tab
- **"Dashboard Suggestions"** — shows the AI insights card on the Dashboard

---

## 9. Archived Events

Events with past dates are automatically archived.

### Step 1: View Archived Events

1. Go to **Profile**
2. Scroll down to **Archived Events**
3. A bottom sheet opens showing all archived events

### Step 2: Restore an Archived Event

- Tap **"Restore"** next to an event
- It returns to your active calendar immediately

### Step 3: Delete an Archived Event

- Tap **"Delete"** next to an event
- It is permanently removed

---

## 10. Signing Out

1. Open **Profile**
2. Scroll to the bottom
3. Tap **"Sign Out"**
4. All real-time subscriptions clean up and you return to the login screen
