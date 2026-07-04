import { supabase } from "@/lib/supabaseClient";
import * as supabaseDb from "@/lib/supabaseDb";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  color?: string;
  notes?: string;
  archived?: boolean;
}

export interface User {
  name: string;
  email: string;
  bio?: string;
}

export type CircleRole = 'member' | 'admin' | 'owner';

export interface Circle {
  id: string;
  name: string;
  inviteCode: string;
  members: string[];
  color: string;
  isOwner: boolean;
  role: CircleRole;
  memberIds?: Record<string, string>;
}

export interface CircleEvent {
  id: string;
  circleId: string;
  createdBy: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  color?: string;
  notes?: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  userName: string;
}

export interface ChatMessage {
  id: string;
  circleId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  parentId: string | null;
  likeCount: number;
  replyCount: number;
  userLiked: boolean;
  reactions: MessageReaction[];
  userReaction: string | null;
}

export interface AuthState {
  isAuthenticated: boolean;
  isRegistered: boolean;
  guestLoginTime: number | null;
  user: User | null;
  userId: string | null;
  events: ScheduleEvent[];
  circles: Circle[];
  circleEvents: Record<string, CircleEvent[]>;
  chatMessages: Record<string, ChatMessage[]>;
  conversations: supabaseDb.ConversationPreview[];
  conversationMessages: Record<string, supabaseDb.ConversationMessage[]>;
  pendingInvitations: supabaseDb.CircleInvitation[];
}

export interface AuthContextValue extends AuthState {
  loginAsGuest: () => void;
  loginAsRegistered: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  addEvent: (event: Omit<ScheduleEvent, "id">) => "ok" | "overlap";
  addEventForced: (event: Omit<ScheduleEvent, "id">) => void;
  editEvent: (
    id: string,
    updates: Partial<Omit<ScheduleEvent, "id">>,
  ) => "ok" | "overlap";
  removeEvent: (id: string) => void;
  archiveEvent: (id: string) => void;
  restoreEvent: (id: string) => void;
  addCircle: (circle: Omit<Circle, "id">) => Circle;
  updateCircle: (id: string, updates: Partial<Circle>) => void;
  removeCircle: (id: string) => void;
  joinCircleByCode: (code: string) => Promise<{ success: boolean; error?: string; circle?: Circle }>;
  refreshCircles: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  isGuestExpired: () => boolean;
  loaded: boolean;
  fetchCircleEvents: (circleId: string) => Promise<void>;
  addCircleEvent: (circleId: string, event: Omit<CircleEvent, "id" | "circleId" | "createdBy">) => Promise<CircleEvent | null>;
  updateCircleEvent: (circleId: string, eventId: string, updates: Partial<CircleEvent>) => Promise<boolean>;
  deleteCircleEvent: (circleId: string, eventId: string) => Promise<boolean>;
  setMemberRole: (circleId: string, targetUserId: string, newRole: 'member' | 'admin') => Promise<boolean>;
  transferOwnership: (circleId: string, newOwnerUserId: string) => Promise<boolean>;
  fetchChatMessages: (circleId: string) => Promise<void>;
  sendChatMessage: (circleId: string, text: string, parentId?: string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  getOrCreateDMConversation: (otherUserId: string) => Promise<string | null>;
  fetchConversationMessages: (conversationId: string) => Promise<void>;
  sendConversationMessage: (conversationId: string, text: string) => Promise<void>;
  deleteConversationMessage: (messageId: string) => Promise<boolean>;
  deleteCircleChatMessage: (messageId: string) => Promise<boolean>;
  leaveConversation: (conversationId: string) => Promise<boolean>;
  toggleReaction: (messageId: string, emoji: string, isCircle: boolean) => Promise<void>;
  applyConvMsgPayload: (convId: string, payload: supabaseDb.RealtimePayload) => void;
  updateProfile: (updates: { name?: string; bio?: string }) => Promise<boolean>;
  updateEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  pendingInvitations: supabaseDb.CircleInvitation[];
  sendInvitation: (circleId: string, invitedUserId: string) => Promise<boolean>;
  respondToInvitation: (invitationId: string, status: 'accepted' | 'declined', circleId: string) => Promise<boolean>;
  refreshInvitations: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GUEST_EXPIRY_MS = 24 * 60 * 60 * 1000;
const AUTH_KEY = "@scheduly/auth";
const EVENTS_KEY = "@scheduly/events";
const CIRCLES_KEY = "@scheduly/circles";

// ─── Auth Error Messages ──────────────────────────────────────────────────────

function getAuthErrorMessage(error: any): string {
  const msg = error?.message ?? "";
  const code = error?.code ?? "";

  if (msg.includes("User already registered") || code === "user_already_exists") {
    return "This email is already registered. Please sign in instead.";
  }
  if (msg.includes("Invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (msg.includes("Password should be at least")) {
    return "Password should be at least 6 characters.";
  }
  if (msg.includes("rate limit") || msg.includes("rate_limit")) {
    return "Too many attempts. Please try again later.";
  }
  if (msg.includes("network") || msg.includes("Network") || msg.includes("fetch")) {
    return "Network error. Please check your connection.";
  }
  if (msg.includes("Email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  return msg || "An error occurred. Please try again.";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasTimeOverlap(
  events: ScheduleEvent[],
  incoming: Omit<ScheduleEvent, "id">,
): boolean {
  return events
    .filter((e) => e.date === incoming.date)
    .some(
      (e) => incoming.startTime < e.endTime && incoming.endTime > e.startTime,
    );
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isRegistered: false,
    guestLoginTime: null,
    user: null,
    userId: null,
    events: [],
    circles: [],
    circleEvents: {},
    chatMessages: {},
    conversations: [],
    conversationMessages: {},
    pendingInvitations: [],
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const unsubAuthRef = useRef<(() => void) | null>(null);
  const unsubscribeListenersRef = useRef<(() => void)[]>([]);
  const circleSubsRef = useRef<supabaseDb.CircleSubscriptions | null>(null);
  const invitationUnsubRef = useRef<(() => void) | null>(null);

  // ── Debounce helper to avoid re-fetch storms ──
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounced = useCallback((key: string, fn: () => void, ms = 500) => {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key]);
    }
    debounceTimersRef.current[key] = setTimeout(() => {
      delete debounceTimersRef.current[key];
      fn();
    }, ms);
  }, []);

  // ── Helpers to manage data listeners separately from auth listener ──
  const cleanupDataListeners = useCallback(() => {
    unsubscribeListenersRef.current.forEach((unsub) => unsub?.());
    unsubscribeListenersRef.current = [];
    if (circleSubsRef.current) {
      circleSubsRef.current.unsubCircles();
      circleSubsRef.current.unsubCircleMembers();
      circleSubsRef.current.unsubCircleEvents();
      circleSubsRef.current.unsubMessages();
      circleSubsRef.current = null;
    }
    if (invitationUnsubRef.current) {
      invitationUnsubRef.current();
      invitationUnsubRef.current = null;
    }
  }, []);

  // ── Set up circle-level subscriptions (re-created when circles change) ──
  const setupCircleSubscriptions = useCallback(
    (userId: string, circleIds: string[]) => {
      if (circleIds.length === 0) return;

      // Clean up old subscriptions first (prevents duplicate channel errors)
      if (circleSubsRef.current) {
        circleSubsRef.current.unsubCircles();
        circleSubsRef.current.unsubCircleMembers();
        circleSubsRef.current.unsubCircleEvents();
        circleSubsRef.current.unsubMessages();
        circleSubsRef.current = null;
      }

      const subs = supabaseDb.setupCircleSubscriptions(
        userId,
        circleIds,
        // Circles table changes
        (payload) => {
          const newCircles = supabaseDb.applyCirclePayload(
            stateRef.current.circles,
            payload,
          );
          if (newCircles) {
            setState((prev) => ({ ...prev, circles: newCircles }));
          } else {
            debounced("circles-full", () => {
              supabaseDb.getUserCircles(userId).then((circles) => {
                setState((prev) => ({ ...prev, circles }));
              });
            });
          }
        },
        // Circle_members changes (someone joined/left)
        (payload) => {
          const result = supabaseDb.applyMemberPayload(
            stateRef.current.circles,
            payload,
            userId,
          );
          if (result) {
            setState((prev) => ({ ...prev, circles: result }));
          } else {
            debounced("circles-members", () => {
              supabaseDb.getUserCircles(userId).then((circles) => {
                setState((prev) => ({ ...prev, circles }));
              });
            });
          }
        },
        // Circle_events changes
        (payload) => {
          const newCircleEvents = supabaseDb.applyCircleEventPayload(
            stateRef.current.circleEvents,
            payload,
          );
          if (newCircleEvents) {
            setState((prev) => ({ ...prev, circleEvents: newCircleEvents }));
          } else {
            const circleId =
              payload.new?.circle_id ?? payload.old?.circle_id ?? null;
            if (circleId) {
              supabaseDb.getCircleEvents(circleId).then((events) => {
                setState((prev) => ({
                  ...prev,
                  circleEvents: { ...prev.circleEvents, [circleId]: events },
                }));
              });
            }
          }
        },
        // Messages changes (real-time chat)
        (payload) => {
          const circleId =
            payload.new?.circle_id ?? payload.old?.circle_id ?? null;
          if (!circleId) return;

          // For INSERT, resolve userName from local circle data
          // (real-time payload only contains user_id, not the user name)
          if (payload.eventType === 'INSERT' && payload.new?.user_id) {
            const circle = stateRef.current.circles.find((c) => c.id === circleId);
            if (circle?.memberIds) {
              const name = Object.entries(circle.memberIds).find(
                ([, uid]) => uid === payload.new.user_id,
              )?.[0];
              if (name) {
                payload.new.user_name = name;
              }
            }
          }

          const msg = supabaseDb.applyMessagePayload(
            stateRef.current.chatMessages[circleId] ?? [],
            payload,
          );
          if (msg) {
            setState((prev) => ({
              ...prev,
              chatMessages: {
                ...prev.chatMessages,
                [circleId]: msg,
              },
            }));
          } else {
            supabaseDb.fetchMessages(circleId).then((messages) => {
              setState((prev) => ({
                ...prev,
                chatMessages: { ...prev.chatMessages, [circleId]: messages },
              }));
            });
          }
        },
      );
      circleSubsRef.current = subs;
    },
    [debounced],
  );

  // ── Load from storage on mount & set up Supabase listener ──
  useEffect(() => {
    (async () => {
      try {
        // Load from AsyncStorage
        const [authRaw, eventsRaw, circlesRaw] = await Promise.all([
          AsyncStorage.getItem(AUTH_KEY),
          AsyncStorage.getItem(EVENTS_KEY),
          AsyncStorage.getItem(CIRCLES_KEY),
        ]);

        const authState = authRaw ? JSON.parse(authRaw) : null;

        setState((prev) => ({
          ...prev,
          isAuthenticated: authRaw ? true : false,
          isRegistered: authState?.isRegistered ?? false,
          guestLoginTime: authState?.guestLoginTime ?? null,
          user: authState?.user ?? null,
          userId: authState?.userId ?? null,
          events: eventsRaw ? JSON.parse(eventsRaw) : [],
          circles: circlesRaw ? JSON.parse(circlesRaw) : [],
        }));

        // Set up Supabase auth listener
        const { data: authData } = supabase.auth.onAuthStateChange(
          (event, session) => {
            console.log("[Auth] onAuthStateChange fired:", {
              event,
              userId: session?.user?.id ?? null,
            });

            if (session?.user) {
              const uid = session.user.id;
              console.log(
                "[Auth] Setting up real-time listeners for user:",
                uid,
              );

              // Update state to ensure isRegistered and userId are set
              setState((prev) => ({
                ...prev,
                isRegistered: true,
                userId: uid,
              }));

              // Clean up any existing data listeners (NOT the auth listener)
              cleanupDataListeners();

              // Registered user - set up real-time listeners
              try {
                const unsubEvents = supabaseDb.onUserEventsChange(
                  uid,
                  // Targeted update on each real-time payload
                  (payload) => {
                    const newEvents = supabaseDb.applyEventPayload(
                      stateRef.current.events,
                      payload,
                    );
                    if (newEvents) {
                      setState((prev) => ({ ...prev, events: newEvents }));
                      setTimeout(() => archiveExpiredEvents(), 0);
                    } else {
                      // Can't apply incrementally — do full re-fetch
                      debounced("events-full", () => {
                        supabaseDb.getUserEvents(uid).then((events) => {
                          setState((prev) => ({ ...prev, events }));
                          AsyncStorage.setItem(
                            EVENTS_KEY,
                            JSON.stringify(events),
                          );
                          setTimeout(() => archiveExpiredEvents(), 0);
                        });
                      });
                    }
                  },
                );

                // Set up invitations real-time listener
                const unsubInvitations = supabaseDb.onInvitationsChange(
                  uid,
                  (payload) => {
                    const newInvites = supabaseDb.applyInvitationPayload(
                      stateRef.current.pendingInvitations,
                      payload,
                    );
                    if (newInvites) {
                      setState((prev) => ({ ...prev, pendingInvitations: newInvites }));
                      // For INSERT, the payload lacks circleName/circleColor/invitedByName
                      // (those require JOINs). Fetch in background to get full data.
                      if (payload.eventType === 'INSERT') {
                        supabaseDb.getPendingInvitations(uid).then((invites) => {
                          setState((prev) => ({ ...prev, pendingInvitations: invites }));
                        });
                      }
                    } else {
                      supabaseDb.getPendingInvitations(uid).then((invites) => {
                        setState((prev) => ({ ...prev, pendingInvitations: invites }));
                      });
                    }
                  },
                );

                // Fetch initial pending invitations
                supabaseDb.getPendingInvitations(uid).then((invites) => {
                  setState((prev) => ({ ...prev, pendingInvitations: invites }));
                });

                unsubscribeListenersRef.current = [unsubEvents];
                invitationUnsubRef.current = unsubInvitations;

                // Set up circle-level subscriptions
                const existingIds = stateRef.current.circles.map((c) => c.id);
                if (existingIds.length > 0) {
                  setupCircleSubscriptions(uid, existingIds);
                }

                console.log(
                  "[Auth] ✅ Real-time listeners set up successfully",
                );
              } catch (listenerError) {
                console.error(
                  "[Auth] Error setting up real-time listeners:",
                  listenerError,
                );
              }
            } else {
              console.log(
                "[Auth] No Supabase session - clearing stale registered state",
              );
              setState((prev) => {
                if (prev.isRegistered) {
                  return {
                    ...prev,
                    isRegistered: false,
                    userId: null,
                    user: prev.guestLoginTime ? prev.user : null,
                    isAuthenticated: !!prev.guestLoginTime,
                    events: [],
                    circles: [],
                  };
                }
                return prev;
              });
              cleanupDataListeners();
            }
          },
        );

        unsubAuthRef.current = () =>
          authData?.subscription?.unsubscribe();

        // Await Supabase session recovery, then fetch fresh data for registered users.
        // We must have a valid session (JWT) for RLS policies to allow the queries.
        // This runs in parallel with onAuthStateChange — the last write wins.
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (uid) {
          setState((prev) => ({
            ...prev,
            isRegistered: true,
            userId: uid,
          }));
          const [events, circles, pendingInvitations] = await Promise.all([
            supabaseDb.getUserEvents(uid),
            supabaseDb.getUserCircles(uid),
            supabaseDb.getPendingInvitations(uid),
          ]).catch((err) => {
            console.error("[Auth] Session-backed fetch failed:", err);
            return [[], [], []] as [any[], any[], any[]];
          });
          setState((prev) => ({ ...prev, events, circles, pendingInvitations }));
          AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
          AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(circles));
          setTimeout(() => archiveExpiredEvents(), 0);
          if (circles.length > 0) {
            setupCircleSubscriptions(
              uid,
              circles.map((c) => c.id),
            );
          }
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setLoaded(true);
      }
    })();

    return () => {
      // Clean up listeners on unmount
      cleanupDataListeners();
      unsubAuthRef.current?.();
    };
  }, [cleanupDataListeners]);

  // ── Persist events to AsyncStorage ──
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(state.events));
    }
  }, [state.events, loaded]);

  // ── Persist circles to AsyncStorage ──
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(state.circles));
    }
  }, [state.circles, loaded]);

  // ── Persist auth on change ──
  useEffect(() => {
    if (loaded) {
      const authData = {
        isRegistered: state.isRegistered,
        guestLoginTime: state.guestLoginTime,
        user: state.user,
        userId: state.userId,
      };
      if (state.isAuthenticated) {
        AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authData));
      } else {
        AsyncStorage.removeItem(AUTH_KEY);
      }
    }
  }, [
    state.isAuthenticated,
    state.isRegistered,
    state.guestLoginTime,
    state.user,
    state.userId,
    loaded,
  ]);

  const loginAsGuest = useCallback(async () => {
    try {
      // Sign out any existing Supabase session
      await supabase.auth.signOut();

      setState((s) => ({
        ...s,
        isAuthenticated: true,
        isRegistered: false,
        guestLoginTime: Date.now(),
        user: { name: "Guest", email: "" },
        userId: null,
      }));
    } catch (error) {
      console.error("Error logging in as guest:", error);
    }
  }, []);

  const loginAsRegistered = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (!data.user) throw new Error("No user returned from sign-in");

        const userId = data.user.id;
        const name = data.user.email?.split("@")[0] ?? "User";

        // Fetch user profile from Supabase (may not exist if registration failed)
        const profile = await supabaseDb.getUser(userId);
        const displayName = profile?.name ?? name;

        // Save profile if it doesn't exist yet
        if (!profile) {
          await supabaseDb.saveUser(userId, { name: displayName, email });
        }

        const user: User = { name: displayName, email };

        setState((s) => ({
          ...s,
          isAuthenticated: true,
          isRegistered: true,
          guestLoginTime: null,
          user,
          userId,
        }));

        // Fetch events, circles, and invitations from Supabase so the UI displays them right away
        const [events, circles, pendingInvitations] = await Promise.all([
          supabaseDb.getUserEvents(userId),
          supabaseDb.getUserCircles(userId),
          supabaseDb.getPendingInvitations(userId),
        ]).catch(() => [[], [], []] as [ScheduleEvent[], Circle[], supabaseDb.CircleInvitation[]]);

        setState((s) => ({ ...s, events, circles, pendingInvitations }));
        AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
        AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(circles));

        if (circles.length > 0) {
          setupCircleSubscriptions(
            userId,
            circles.map((c) => c.id),
          );
        }

        return { success: true };
      } catch (error: any) {
        console.error("Error logging in:", error);
        return { success: false, error: getAuthErrorMessage(error) };
      }
    },
    [setupCircleSubscriptions],
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (!data.user) throw new Error("No user returned from sign-up");

        const userId = data.user.id;

        // Save user profile to users table
        const user: User = { name, email };
        const saved = await supabaseDb.saveUser(userId, user);
        if (!saved) throw new Error("Failed to create user profile.");

        setState((s) => ({
          ...s,
          isAuthenticated: true,
          isRegistered: true,
          guestLoginTime: null,
          user,
          userId,
        }));

        // Fetch events, circles, and invitations from Supabase so the UI displays them right away
        const [events, circles, pendingInvitations] = await Promise.all([
          supabaseDb.getUserEvents(userId),
          supabaseDb.getUserCircles(userId),
          supabaseDb.getPendingInvitations(userId),
        ]).catch(() => [[], [], []] as [ScheduleEvent[], Circle[], supabaseDb.CircleInvitation[]]);

        setState((s) => ({ ...s, events, circles, pendingInvitations }));
        AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
        AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(circles));

        if (circles.length > 0) {
          setupCircleSubscriptions(
            userId,
            circles.map((c) => c.id),
          );
        }

        return { success: true };
      } catch (error: any) {
        console.error("Error registering:", error);
        return { success: false, error: getAuthErrorMessage(error) };
      }
    },
    [setupCircleSubscriptions],
  );

  const logout = useCallback(async () => {
    try {
      // Clean up data listeners first (before signOut triggers callback)
      cleanupDataListeners();

      // Sign out from Supabase
      await supabase.auth.signOut();

      // Clean up auth listener
      unsubAuthRef.current?.();
      unsubAuthRef.current = null;

      setState({
        isAuthenticated: false,
        isRegistered: false,
        guestLoginTime: null,
        user: null,
        userId: null,
        events: [],
        circles: [],
        circleEvents: {},
        chatMessages: {},
        conversations: [],
        conversationMessages: {},
        pendingInvitations: [],
      });
    } catch (error) {
      console.error("Error logging out:", error);
    }
  }, [cleanupDataListeners]);

  const addEvent = useCallback(
    (event: Omit<ScheduleEvent, "id">): "ok" | "overlap" => {
      const s = stateRef.current;

      if (hasTimeOverlap(s.events, event)) return "overlap";

      const newEvent: ScheduleEvent = { ...event, id: `e_${Date.now()}` };
      setState((prev) => ({
        ...prev,
        events: [...prev.events, newEvent],
      }));

      // Save to Supabase if registered
      if (s.userId && s.isRegistered) {
        console.log("[addEvent] Saving to Supabase for user:", s.userId);
        supabaseDb
          .saveEvent(s.userId, newEvent)
          .then(() => console.log("[addEvent] ✅ Event saved to Supabase!"))
          .catch((err) =>
            console.error("[addEvent] ❌ Error saving event to Supabase:", err),
          );
      } else {
        console.log(
          "[addEvent] ⚠️ Not saving to Supabase - user is guest or no userId",
        );
      }

      return "ok";
    },
    [],
  );

  const addEventForced = useCallback((event: Omit<ScheduleEvent, "id">) => {
    const s = stateRef.current;
    const newEvent: ScheduleEvent = {
      ...event,
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setState((prev) => ({
      ...prev,
      events: [...prev.events, newEvent],
    }));

    // Save to Supabase if registered
    if (s.userId && s.isRegistered) {
      supabaseDb
        .saveEvent(s.userId, newEvent)
        .catch((err) => console.error("Error saving event to Supabase:", err));
    }
  }, []);

  const editEvent = useCallback(
    (
      id: string,
      updates: Partial<Omit<ScheduleEvent, "id">>,
    ): "ok" | "overlap" => {
      const s = stateRef.current;
      const others = s.events.filter((e) => e.id !== id);
      const base = s.events.find((e) => e.id === id);

      console.log("[editEvent] Called:", {
        id,
        isRegistered: s.isRegistered,
        userId: s.userId,
        updates,
      });

      if (!base) return "ok";
      const merged = { ...base, ...updates };
      if (hasTimeOverlap(others, merged)) return "overlap";
      setState((prev) => ({
        ...prev,
        events: prev.events.map((e) =>
          e.id === id ? { ...e, ...updates } : e,
        ),
      }));

      // Update Supabase if registered
      if (s.userId && s.isRegistered) {
        console.log("[editEvent] Updating in Supabase for user:", s.userId);
        supabaseDb
          .updateEvent(s.userId, id, updates)
          .then(() => console.log("[editEvent] ✅ Event updated in Supabase!"))
          .catch((err) =>
            console.error(
              "[editEvent] ❌ Error updating event in Supabase:",
              err,
            ),
          );
      } else {
        console.log(
          "[editEvent] ⚠️ Not updating Supabase - user is guest or no userId",
        );
      }

      return "ok";
    },
    [],
  );

  const removeEvent = useCallback((id: string) => {
    const s = stateRef.current;
    const uid = s.userId;

    setState((s) => {
      const events = s.events.filter((e) => e.id !== id);
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      return { ...s, events };
    });

    if (uid) {
      supabaseDb
        .deleteEvent(uid, id)
        .catch((err) =>
          console.error("[removeEvent] ❌ Error deleting event:", err),
        );
    }
  }, []);

  const archiveEvent = useCallback((id: string) => {
    const s = stateRef.current;
    setState((prev) => {
      const events = prev.events.map((e) => e.id === id ? { ...e, archived: true } : e);
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      return { ...prev, events };
    });
    if (s.userId && s.isRegistered) {
      supabaseDb.updateEvent(s.userId, id, { archived: true } as any)
        .catch((err) => console.error("[archiveEvent] Supabase error:", err));
    }
  }, []);

  const restoreEvent = useCallback((id: string) => {
    const s = stateRef.current;
    setState((prev) => {
      const events = prev.events.map((e) => e.id === id ? { ...e, archived: false } : e);
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      return { ...prev, events };
    });
    if (s.userId && s.isRegistered) {
      supabaseDb.updateEvent(s.userId, id, { archived: false } as any)
        .catch((err) => console.error("[restoreEvent] Supabase error:", err));
    }
  }, []);

  // ── Auto-archive expired events ──
  const archiveExpiredEvents = useCallback(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setState((prev) => {
      const updated = prev.events.map((e) => {
        if (!e.archived && e.date < todayStr) {
          return { ...e, archived: true };
        }
        return e;
      });
      if (updated.some((e, i) => e.archived !== prev.events[i]?.archived)) {
        console.log("[Auth] Auto-archived past events");
        return { ...prev, events: updated };
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      archiveExpiredEvents();
    }
  }, [loaded, archiveExpiredEvents]);

  const addCircle = useCallback((circle: Omit<Circle, "id">): Circle => {
    const s = stateRef.current;
    const newCircle: Circle = { ...circle, id: `c_${Date.now()}` };
    setState((s) => ({ ...s, circles: [newCircle, ...s.circles] }));

    // Save to Supabase if registered
    if (s.userId && s.isRegistered) {
      supabaseDb
        .saveCircle(s.userId, newCircle)
        .catch((err) => console.error("Error saving circle to Supabase:", err));
    }

    // Re-setup circle subscriptions to include the new circle
    const currentIds = stateRef.current.circles.map((c) => c.id);
    if (s.userId && s.isRegistered && currentIds.length > 0) {
      setupCircleSubscriptions(s.userId, currentIds);
    }

    return newCircle;
  }, [setupCircleSubscriptions]);

  const updateCircle = useCallback((id: string, updates: Partial<Circle>) => {
    const s = stateRef.current;
    setState((s) => ({
      ...s,
      circles: s.circles.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));

    // Update Supabase if registered
    if (s.userId && s.isRegistered) {
      supabaseDb
        .updateCircle(s.userId, id, updates)
        .catch((err) =>
          console.error("Error updating circle in Supabase:", err),
        );
    }
  }, []);

  const removeCircle = useCallback((id: string) => {
    const s = stateRef.current;
    const leavingCircle = s.circles.find((c) => c.id === id);
    const myName = s.user?.name ?? "Someone";

    setState((s) => ({ ...s, circles: s.circles.filter((c) => c.id !== id) }));

    // Post system message to circle chat
    if (s.userId && s.isRegistered && leavingCircle) {
      supabaseDb.sendMessage(id, s.userId, `${myName} left the circle`).catch(() => {});
    }

    // Delete from Supabase if registered
    if (s.userId && s.isRegistered) {
      supabaseDb
        .deleteCircle(s.userId, id)
        .catch((err) =>
          console.error("Error deleting circle from Supabase:", err),
        );
    }

    // Re-setup circle subscriptions without the removed circle
    const remainingIds = stateRef.current.circles
      .filter((c) => c.id !== id)
      .map((c) => c.id);
    if (s.userId && s.isRegistered && remainingIds.length > 0) {
      setupCircleSubscriptions(s.userId, remainingIds);
    }
  }, [setupCircleSubscriptions]);

  const joinCircleByCode = useCallback(
    async (
      code: string,
    ): Promise<{ success: boolean; error?: string; circle?: Circle }> => {
      const s = stateRef.current;
      const myName = s.user?.name ?? "You";

      // Check local circles first (covers self-join of own circles)
      const localCircle = s.circles.find((c) => c.inviteCode === code);
      if (localCircle) {
        if (
          localCircle.members.some((m) => m === myName || m === "You")
        ) {
          return { success: false, error: "You are already in this circle." };
        }

        const updatedMembers = Array.from(
          new Set([...localCircle.members, myName]),
        );
        const updatedMemberIds = {
          ...(localCircle.memberIds ?? {}),
          ...(s.userId ? { [myName]: s.userId } : {}),
        };

        updateCircle(localCircle.id, {
          members: updatedMembers,
          memberIds: updatedMemberIds,
        });

        return {
          success: true,
          circle: { ...localCircle, members: updatedMembers, memberIds: updatedMemberIds },
        };
      }

      // If not registered, can't query the database
      if (!s.userId || !s.isRegistered) {
        return { success: false, error: "No circle found with that code." };
      }

      try {
        const { data: circleData, error: lookupError } =
          await supabaseDb.findCircleByInviteCode(code);

        if (lookupError) {
          return {
            success: false,
            error: `Database error: ${lookupError}`,
          };
        }

        if (!circleData) {
          return { success: false, error: "No circle found with that code." };
        }

        // Check if already a member
        if (circleData.members.includes(myName)) {
          return {
            success: false,
            error: "You are already in this circle.",
          };
        }

        const updatedMembers = Array.from(
          new Set([...circleData.members, myName]),
        );
        const updatedMemberIds = {
          ...(circleData.memberIds ?? {}),
          [myName]: s.userId,
        };

        // Add self to circle_members
        await supabaseDb.saveCircleToUser(s.userId, {
          id: circleData.id,
          name: circleData.name,
          inviteCode: code,
          members: updatedMembers,
          color: circleData.color,
          isOwner: false,
          role: 'member',
          memberIds: updatedMemberIds,
        });

        // Add to local state
        const joinedCircle: Circle = {
          id: circleData.id,
          name: circleData.name,
          inviteCode: code,
          members: updatedMembers,
          color: circleData.color,
          isOwner: false,
          role: 'member',
          memberIds: updatedMemberIds,
        };

        setState((prev) => ({
          ...prev,
          circles: [joinedCircle, ...prev.circles],
        }));

        // Post system message to circle chat
        if (s.userId) {
          supabaseDb.sendMessage(circleData.id, s.userId, `${myName} joined via invite code`).catch(() => {});
        }

        // Re-setup circle subscriptions to include the new circle
        if (s.userId && s.isRegistered) {
          const allIds = stateRef.current.circles.map((c) => c.id);
          if (allIds.length > 0) {
            setupCircleSubscriptions(s.userId, allIds);
          }
        }

        return { success: true, circle: joinedCircle };
      } catch (error) {
        console.error("Error joining circle by code:", error);
        return {
          success: false,
          error: "An error occurred while joining the circle.",
        };
      }
    },
    [updateCircle],
  );

  const refreshCircles = useCallback(async () => {
    const s = stateRef.current;
    if (!s.userId || !s.isRegistered) return;
    try {
      const circles = await supabaseDb.getUserCircles(s.userId);
      setState((prev) => ({ ...prev, circles }));
      AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(circles));
      // Re-setup circle-level subscriptions
      if (circles.length > 0) {
        setupCircleSubscriptions(
          s.userId,
          circles.map((c) => c.id),
        );
      }
    } catch (error) {
      console.error("Error refreshing circles:", error);
    }
  }, [setupCircleSubscriptions]);

  const refreshEvents = useCallback(async () => {
    const s = stateRef.current;
    if (!s.userId || !s.isRegistered) return;
    try {
      const events = await supabaseDb.getUserEvents(s.userId);
      setState((prev) => ({ ...prev, events }));
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    } catch (error) {
      console.error("Error refreshing events:", error);
    }
  }, []);

  const fetchCircleEvents = useCallback(async (circleId: string) => {
    if (!stateRef.current.isRegistered) return;
    try {
      const events = await supabaseDb.getCircleEvents(circleId);
      setState((prev) => ({
        ...prev,
        circleEvents: { ...prev.circleEvents, [circleId]: events },
      }));
    } catch (error) {
      console.error("Error fetching circle events:", error);
    }
  }, []);

  const addCircleEvent = useCallback(
    async (
      circleId: string,
      event: Omit<CircleEvent, "id" | "circleId" | "createdBy">,
    ): Promise<CircleEvent | null> => {
      const s = stateRef.current;
      if (!s.userId) return null;
      const newEvent = await supabaseDb.addCircleEvent(circleId, s.userId, event);
      if (newEvent) {
        setState((prev) => ({
          ...prev,
          circleEvents: {
            ...prev.circleEvents,
            [circleId]: [...(prev.circleEvents[circleId] ?? []), newEvent],
          },
        }));
      }
      return newEvent;
    },
    [],
  );

  const updateCircleEvent = useCallback(
    async (
      circleId: string,
      eventId: string,
      updates: Partial<CircleEvent>,
    ): Promise<boolean> => {
      const ok = await supabaseDb.updateCircleEvent(circleId, eventId, updates);
      if (ok) {
        setState((prev) => ({
          ...prev,
          circleEvents: {
            ...prev.circleEvents,
            [circleId]: (prev.circleEvents[circleId] ?? []).map((e) =>
              e.id === eventId ? { ...e, ...updates } : e,
            ),
          },
        }));
      }
      return ok;
    },
    [],
  );

  const deleteCircleEvent = useCallback(
    async (circleId: string, eventId: string): Promise<boolean> => {
      const ok = await supabaseDb.deleteCircleEvent(eventId);
      if (ok) {
        setState((prev) => ({
          ...prev,
          circleEvents: {
            ...prev.circleEvents,
            [circleId]: (prev.circleEvents[circleId] ?? []).filter(
              (e) => e.id !== eventId,
            ),
          },
        }));
      }
      return ok;
    },
    [],
  );

  const setMemberRole = useCallback(
    async (circleId: string, targetUserId: string, newRole: 'member' | 'admin'): Promise<boolean> => {
      const s = stateRef.current;
      const ok = await supabaseDb.setMemberRole(circleId, targetUserId, newRole);
      if (ok) {
        // Post system message
        const circle = s.circles.find((c) => c.id === circleId);
        const targetName = circle?.memberIds ? Object.entries(circle.memberIds).find(([, uid]) => uid === targetUserId)?.[0] : undefined;
        if (s.userId && targetName) {
          supabaseDb.sendMessage(circleId, s.userId, `${targetName} is ${newRole === 'admin' ? 'now an admin' : 'no longer an admin'}`).catch(() => {});
        }
        await refreshCircles();
      }
      return ok;
    },
    [refreshCircles],
  );

  const transferOwnership = useCallback(
    async (circleId: string, newOwnerUserId: string): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.userId) return false;
      const ok = await supabaseDb.transferOwnership(circleId, newOwnerUserId, s.userId);
      if (ok) {
        // Post system message
        const circle = s.circles.find((c) => c.id === circleId);
        const newOwnerName = circle?.memberIds ? Object.entries(circle.memberIds).find(([, uid]) => uid === newOwnerUserId)?.[0] : undefined;
        if (s.userId && newOwnerName) {
          supabaseDb.sendMessage(circleId, s.userId, `${newOwnerName} is now the owner`).catch(() => {});
        }
        await refreshCircles();
      }
      return ok;
    },
    [refreshCircles],
  );

  const fetchChatMessages = useCallback(async (circleId: string) => {
    const s = stateRef.current;
    const messages = await supabaseDb.fetchMessages(circleId, s.userId ?? undefined);
    setState((prev) => ({
      ...prev,
      chatMessages: { ...prev.chatMessages, [circleId]: messages },
    }));
  }, []);

  const sendChatMessage = useCallback(
    async (circleId: string, text: string, parentId?: string) => {
      const s = stateRef.current;
      if (!s.userId || !text.trim()) return;
      const msg = await supabaseDb.sendMessage(circleId, s.userId, text.trim(), parentId);
      if (msg) {
        setState((prev) => ({ ...prev, chatMessages: { ...prev.chatMessages, [circleId]: [...(prev.chatMessages[circleId] ?? []), msg] } }));
      }
    },
    [],
  );

  const fetchConversations = useCallback(async () => {
    const s = stateRef.current;
    if (!s.userId) return;
    const convs = await supabaseDb.fetchConversations();
    setState((prev) => ({ ...prev, conversations: convs }));
  }, []);

  const getOrCreateDMConversation = useCallback(async (otherUserId: string): Promise<string | null> => {
    const s = stateRef.current;
    if (!s.userId) return null;
    return await supabaseDb.getOrCreateDMConversation(otherUserId);
  }, []);

  const fetchConversationMessages = useCallback(async (conversationId: string) => {
    const s = stateRef.current;
    const messages = await supabaseDb.fetchConversationMessages(conversationId, s.userId ?? undefined);
    setState((prev) => ({
      ...prev,
      conversationMessages: { ...prev.conversationMessages, [conversationId]: messages },
    }));
  }, []);

  const sendConversationMessage = useCallback(
    async (conversationId: string, text: string) => {
      const s = stateRef.current;
      if (!s.userId || !text.trim()) return;
      const msg = await supabaseDb.sendConversationMessage(conversationId, s.userId, text.trim());
      if (msg) {
        setState((prev) => ({
          ...prev,
          conversationMessages: {
            ...prev.conversationMessages,
            [conversationId]: [...(prev.conversationMessages[conversationId] ?? []), msg],
          },
        }));
      }
    },
    [],
  );

  const deleteConversationMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const ok = await supabaseDb.deleteConversationMessage(messageId);
      if (ok) {
        setState((prev) => ({
          ...prev,
          conversationMessages: Object.fromEntries(
            Object.entries(prev.conversationMessages).map(([convId, msgs]) => [
              convId,
              msgs.filter((m) => m.id !== messageId),
            ]),
          ),
        }));
      }
      return ok;
    },
    [],
  );

  const deleteCircleChatMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const ok = await supabaseDb.deleteCircleChatMessage(messageId);
      if (ok) {
        setState((prev) => ({
          ...prev,
          chatMessages: Object.fromEntries(
            Object.entries(prev.chatMessages).map(([circleId, msgs]) => [
              circleId,
              msgs.filter((m) => m.id !== messageId),
            ]),
          ),
        }));
      }
      return ok;
    },
    [],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string, isCircle: boolean) => {
      const s = stateRef.current;
      if (!s.userId) return;
      if (isCircle) {
        const ok = await supabaseDb.toggleCircleMessageReaction(messageId, s.userId, emoji);
        if (ok) {
          // Optimistic update: re-fetch to get accurate reaction state
          const circleId = s.chatMessages ? Object.entries(s.chatMessages).find(([, msgs]) => msgs.some(m => m.id === messageId))?.[0] : undefined;
          if (circleId) fetchChatMessages(circleId);
        }
      } else {
        const ok = await supabaseDb.toggleConversationMessageReaction(messageId, s.userId, emoji);
        if (ok) {
          const convId = s.conversationMessages ? Object.entries(s.conversationMessages).find(([, msgs]) => msgs.some(m => m.id === messageId))?.[0] : undefined;
          if (convId) fetchConversationMessages(convId);
        }
      }
    },
    [fetchChatMessages, fetchConversationMessages],
  );

  const applyConvMsgPayload = useCallback(
    (convId: string, payload: supabaseDb.RealtimePayload) => {
      const current = stateRef.current.conversationMessages[convId] ?? [];
      const updated = supabaseDb.applyConversationMessagePayload(current, payload);
      if (updated) {
        setState((prev) => ({
          ...prev,
          conversationMessages: {
            ...prev.conversationMessages,
            [convId]: updated,
          },
        }));
      }
    },
    [],
  );

  const leaveConversation = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.userId) return false;
      const ok = await supabaseDb.leaveConversation(conversationId, s.userId);
      if (ok) {
        setState((prev) => ({
          ...prev,
          conversations: prev.conversations.filter((c) => c.id !== conversationId),
          conversationMessages: Object.fromEntries(
            Object.entries(prev.conversationMessages).filter(([id]) => id !== conversationId),
          ),
        }));
      }
      return ok;
    },
    [],
  );

  const updateProfile = useCallback(
    async (updates: { name?: string; bio?: string }): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.userId) return false;
      const ok = await supabaseDb.updateUserProfile(s.userId, updates);
      if (ok) {
        setState((prev) => ({
          ...prev,
          user: prev.user ? { ...prev.user, ...updates } : null,
        }));
      }
      return ok;
    },
    [],
  );

  const updateEmail = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const s = stateRef.current;
      // Re-authenticate before changing email
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: s.user?.email ?? '',
        password,
      });
      if (signInError) {
        return { success: false, error: 'Current password is incorrect.' };
      }
      const { error } = await supabase.auth.updateUser({ email });
      if (error) {
        return { success: false, error: error.message };
      }
      // Update local user email immediately (confirmation pending)
      setState((prev) => ({
        ...prev,
        user: prev.user ? { ...prev.user, email } : null,
      }));
      return { success: true };
    },
    [],
  );

  const isGuestExpired = useCallback((): boolean => {
    const { isRegistered, guestLoginTime } = stateRef.current;
    if (isRegistered || !guestLoginTime) return false;
    return Date.now() - guestLoginTime >= GUEST_EXPIRY_MS;
  }, []);

  const sendInvitation = useCallback(
    async (circleId: string, invitedUserId: string): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.userId) return false;
      const ok = await supabaseDb.sendInvitation(circleId, invitedUserId, s.userId);
      return ok;
    },
    [],
  );

  const respondToInvitation = useCallback(
    async (invitationId: string, status: 'accepted' | 'declined', circleId: string): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.userId) return false;
      const ok = await supabaseDb.respondToInvitation(invitationId, status, circleId, s.userId);
      if (ok) {
        // Remove invitation from local state immediately
        setState((prev) => ({
          ...prev,
          pendingInvitations: prev.pendingInvitations.filter((i) => i.id !== invitationId),
        }));
        if (status === 'accepted') {
          // Refresh circles to include the newly joined circle
          const circles = await supabaseDb.getUserCircles(s.userId);
          setState((prev) => ({ ...prev, circles }));
          AsyncStorage.setItem(CIRCLES_KEY, JSON.stringify(circles));
          if (circles.length > 0) {
            setupCircleSubscriptions(s.userId, circles.map((c) => c.id));
          }
        }
      }
      return ok;
    },
    [setupCircleSubscriptions],
  );

  const refreshInvitations = useCallback(async () => {
    const s = stateRef.current;
    if (!s.userId || !s.isRegistered) return;
    const invites = await supabaseDb.getPendingInvitations(s.userId);
    setState((prev) => ({ ...prev, pendingInvitations: invites }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loginAsGuest,
        loginAsRegistered,
        register,
        logout,
        addEvent,
        addEventForced,
        editEvent,
        removeEvent,
        archiveEvent,
        restoreEvent,
        addCircle,
        updateCircle,
        removeCircle,
        joinCircleByCode,
        refreshCircles,
        refreshEvents,
        fetchCircleEvents,
        addCircleEvent,
        updateCircleEvent,
        deleteCircleEvent,
        setMemberRole,
        transferOwnership,
        fetchChatMessages,
        sendChatMessage,
        fetchConversations,
        getOrCreateDMConversation,
        fetchConversationMessages,
        sendConversationMessage,
        deleteConversationMessage,
        deleteCircleChatMessage,
        toggleReaction,
        applyConvMsgPayload,
        leaveConversation,
        updateProfile,
        updateEmail,
        isGuestExpired,
        loaded,
        pendingInvitations: state.pendingInvitations,
        sendInvitation,
        respondToInvitation,
        refreshInvitations,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
