import { supabase } from "@/lib/supabaseClient";
import {
  Circle,
  CircleEvent,
  ScheduleEvent,
  User,
} from "@/context/AuthContext";

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";
export type EventsCallback = (events: ScheduleEvent[]) => void;
export type CirclesCallback = (circles: Circle[]) => void;
export type CircleEventsCallback = (events: CircleEvent[]) => void;

/** Payload from a postgres_changes real-time event */
export interface RealtimePayload {
  eventType: RealtimeEventType;
  new: Record<string, any>;
  old: Record<string, any>;
}

// ─── User Operations ──────────────────────────────────────────────────────────

export async function saveUser(userId: string, user: User) {
  try {
    // Try RPC first (bypasses RLS), fallback to direct upsert
    const { error: rpcError } = await supabase.rpc("create_user_profile", {
      user_id: userId,
      user_name: user.name,
      user_email: user.email,
    });
    if (!rpcError) return true;
    // RPC not available, try direct upsert
    const { error } = await supabase.from("users").upsert(
      { id: userId, name: user.name, email: user.email },
      { onConflict: "id" },
    );
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error saving user:", error);
    return false;
  }
}

export async function getUser(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("name, email, bio")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? { name: data.name, email: data.email, bio: (data as any).bio ?? undefined } : null;
  } catch (error: any) {
    // If the bio column doesn't exist yet, fall back to name + email only
    if (error?.code === "42703") {
      try {
        const { data, error: fallbackError } = await supabase
          .from("users")
          .select("name, email")
          .eq("id", userId)
          .maybeSingle();
        if (fallbackError) throw fallbackError;
        return data ?? null;
      } catch (fallbackErr) {
        console.error("Error getting user (fallback):", fallbackErr);
        return null;
      }
    }
    console.error("Error getting user:", error);
    return null;
  }
}

export async function updateUserProfile(
  userId: string,
  updates: { name?: string; bio?: string },
): Promise<boolean> {
  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (Object.keys(dbUpdates).length === 0) return true;
    const { error } = await supabase.from("users").update(dbUpdates).eq("id", userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return false;
  }
}

export async function searchUsers(
  queryStr: string,
  maxResults: number = 10,
): Promise<{ id: string; name: string; email: string }[]> {
  try {
    if (!queryStr.trim()) return [];
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email")
      .ilike("name", `%${queryStr.trim()}%`)
      .order("name", { ascending: true })
      .limit(maxResults);
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    console.error("Error searching users:", error);
    return [];
  }
}

// ─── Event Operations ─────────────────────────────────────────────────────────

export async function saveEvent(userId: string, event: ScheduleEvent) {
  try {
    const { error } = await supabase.from("events").insert({
      id: event.id,
      user_id: userId,
      title: event.title,
      date: event.date,
      start_time: event.startTime,
      end_time: event.endTime,
      color: event.color ?? null,
      notes: event.notes ?? null,
      archived: event.archived ?? false,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error saving event:", error);
    return false;
  }
}

export async function getUserEvents(userId: string): Promise<ScheduleEvent[]> {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, date, start_time, end_time, color, notes, archived")
      .eq("user_id", userId)
      .order("date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      startTime: e.start_time,
      endTime: e.end_time,
      color: e.color ?? undefined,
      notes: e.notes ?? undefined,
      archived: e.archived ?? false,
    }));
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}

export async function updateEvent(
  userId: string,
  eventId: string,
  updates: Partial<ScheduleEvent>,
) {
  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.color !== undefined) dbUpdates.color = updates.color ?? null;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null;
    if (updates.archived !== undefined) dbUpdates.archived = updates.archived;

    const { error } = await supabase
      .from("events")
      .update(dbUpdates)
      .eq("id", eventId)
      .eq("user_id", userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error updating event:", error);
    return false;
  }
}

export async function deleteEvent(userId: string, eventId: string) {
  try {
    console.log("[supabaseDb.deleteEvent] Attempting to delete:", {
      userId,
      eventId,
    });

    if (!eventId || eventId === "undefined") {
      console.error("[supabaseDb.deleteEvent] ❌ Invalid eventId:", eventId);
      return false;
    }

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", userId);
    if (error) throw error;
    console.log("[supabaseDb.deleteEvent] ✅ Successfully deleted");
    return true;
  } catch (error: any) {
    console.error("[supabaseDb.deleteEvent] ❌ Error deleting event:", error);
    return false;
  }
}

// ─── Circle Operations ────────────────────────────────────────────────────────

async function fetchMembersForCircle(
  circleId: string,
): Promise<{ members: string[]; memberIds: Record<string, string> }> {
  const { data, error } = await supabase
    .from("circle_members")
    .select("user_id, users!inner(name)")
    .eq("circle_id", circleId);
  if (error || !data) return { members: [], memberIds: {} };

  const members: string[] = [];
  const memberIds: Record<string, string> = {};
  for (const row of data) {
    const name = (row as any).users?.name;
    if (name) {
      members.push(name);
      memberIds[name] = row.user_id;
    }
  }
  return { members, memberIds };
}

function dbCircleToCircle(
  dbCircle: any,
  isOwner: boolean,
  members: string[],
  memberIds: Record<string, string>,
  userRole: string = 'member',
): Circle {
  return {
    id: dbCircle.id,
    name: dbCircle.name,
    inviteCode: dbCircle.invite_code,
    color: dbCircle.color,
    members,
    isOwner,
    role: isOwner ? 'owner' : (userRole as Circle['role']),
    memberIds,
  };
}

export async function saveCircle(userId: string, circle: Circle) {
  try {
    // Only the owner upserts the circles table row
    if (circle.isOwner) {
      const { error: circleError } = await supabase.from("circles").upsert(
        {
          id: circle.id,
          owner_id: userId,
          name: circle.name,
          invite_code: circle.inviteCode,
          color: circle.color,
        },
        { onConflict: "id" },
      );
      if (circleError) throw circleError;
    }

    // Add members to circle_members
    if (circle.memberIds) {
      const memberEntries = Object.entries(circle.memberIds);
      if (memberEntries.length > 0) {
        const payload = memberEntries.map(([name, uid]) => ({
          circle_id: circle.id,
          user_id: uid,
          role: uid === userId ? 'owner' : 'member',
        }));
        let { error: memberError } = await supabase
          .from("circle_members")
          .upsert(payload, { onConflict: "circle_id, user_id" });
        if (memberError && (memberError.code === '42703' || memberError.message?.includes('role'))) {
          const fallbackPayload = payload.map(({ circle_id, user_id }) => ({ circle_id, user_id }));
          const fallback = await supabase
            .from("circle_members")
            .upsert(fallbackPayload, { onConflict: "circle_id, user_id" });
          memberError = fallback.error;
        }
        if (memberError) throw memberError;
      }
    }

    return true;
  } catch (error) {
    console.error("Error saving circle:", error);
    return false;
  }
}

export async function getUserCircles(userId: string): Promise<Circle[]> {
  const [membershipsRes, ownedRes] = await Promise.all([
    supabase.from("circle_members").select("circle_id").eq("user_id", userId),
    supabase.from("circles").select("id").eq("owner_id", userId),
  ]);

  if (membershipsRes.error) throw membershipsRes.error;
  if (ownedRes.error) throw ownedRes.error;

  const memberCircleIds = new Set(
    (membershipsRes.data ?? []).map((m) => m.circle_id),
  );
  const ownedCircleIds = new Set(
    (ownedRes.data ?? []).map((c) => c.id),
  );
  const allCircleIds = new Set([...memberCircleIds, ...ownedCircleIds]);
  if (allCircleIds.size === 0) return [];

  // Ensure owner has circle_members entry
  const missingOwnerIds = [...ownedCircleIds].filter(
    (id) => !memberCircleIds.has(id),
  );
  if (missingOwnerIds.length > 0) {
    await supabase
      .from("circle_members")
      .upsert(
        missingOwnerIds.map((cid) => ({ circle_id: cid, user_id: userId, role: 'owner' })),
        { onConflict: "circle_id, user_id" },
      )
      .then(({ error }) => {
        if (error)
          console.error(
            "[getUserCircles] Failed to insert missing owner:",
            error,
          );
      });
  }

  const { data: circlesData, error: circlesError } = await supabase
    .from("circles")
    .select("*")
    .in("id", [...allCircleIds]);
  if (circlesError) throw circlesError;
  if (!circlesData) return [];

  // Batch fetch all members for all circles in one query
  const circleIdList = circlesData.map((c) => c.id);
  let { data: allMembers, error: membersError } = await supabase
    .from("circle_members")
    .select("circle_id, user_id, role, users!inner(name)")
    .in("circle_id", circleIdList) as any;
  if (membersError && (membersError.code === '42703' || membersError.message?.includes('role'))) {
    const fallback = await supabase
      .from("circle_members")
      .select("circle_id, user_id, can_edit, users!inner(name)")
      .in("circle_id", circleIdList) as any;
    allMembers = fallback.data;
    membersError = fallback.error;
  }
  if (membersError) throw membersError;

  // Group by circle_id
  const membersByCircle: Record<
    string,
    { user_id: string; name: string; role: string }[]
  > = {};
  for (const row of allMembers ?? []) {
    if (!membersByCircle[row.circle_id]) membersByCircle[row.circle_id] = [];
    membersByCircle[row.circle_id].push({
      user_id: row.user_id,
      name: row.users?.name ?? "Unknown",
      role: row.role ?? (row.can_edit ? 'admin' : 'member'),
    });
  }

  const results: Circle[] = circlesData.map((dbCircle) => {
    const circleMembers = membersByCircle[dbCircle.id] ?? [];
    const members = circleMembers.map((m) => m.name);
    const memberIds: Record<string, string> = {};
    const memberRoles: Record<string, string> = {};
    for (const m of circleMembers) {
      memberIds[m.name] = m.user_id;
      memberRoles[m.user_id] = m.role;
    }
    return dbCircleToCircle(
      dbCircle,
      dbCircle.owner_id === userId,
      members,
      memberIds,
      memberRoles[userId] ?? 'member',
    );
  });
  return results;
}

export async function updateCircle(
  userId: string,
  circleId: string,
  updates: Partial<Circle>,
) {
  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.inviteCode !== undefined) dbUpdates.invite_code = updates.inviteCode;
    if (updates.color !== undefined) dbUpdates.color = updates.color;

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase
        .from("circles")
        .update(dbUpdates)
        .eq("id", circleId);
      if (error) throw error;
    }

    // Handle memberIds update if provided (add/remove members)
    if (updates.memberIds !== undefined) {
      const newUserIds = Object.values(updates.memberIds) as string[];
      const addingSelf = newUserIds.length === 1 && newUserIds[0] === userId;

      // Only the owner can add/remove other members; anyone can add themselves
      if (!addingSelf) {
        const { data: circleOwner } = await supabase
          .from("circles")
          .select("owner_id")
          .eq("id", circleId)
          .single();
        const isOwner = circleOwner?.owner_id === userId;
        if (!isOwner) {
          console.warn("updateCircle: user is not the circle owner, skipping member mutations");
          return true;
        }
      }

      const { data: currentMembers, error: fetchError } = await supabase
        .from("circle_members")
        .select("user_id")
        .eq("circle_id", circleId);
      if (fetchError) throw fetchError;

      const currentUserIds = new Set(
        (currentMembers ?? []).map((m) => m.user_id),
      );
      const addUserIds = new Set(newUserIds);

      const toRemove = [...currentUserIds].filter((id) => !addUserIds.has(id));
      const toAdd = [...newUserIds].filter((id) => !currentUserIds.has(id));

      if (toRemove.length > 0) {
        const { error: delError } = await supabase
          .from("circle_members")
          .delete()
          .eq("circle_id", circleId)
          .in("user_id", toRemove);
        if (delError) throw delError;
      }
      if (toAdd.length > 0) {
        const { error: insError } = await supabase
          .from("circle_members")
          .upsert(toAdd.map((uid) => ({ circle_id: circleId, user_id: uid })), { onConflict: "circle_id, user_id" });
        if (insError) throw insError;
      }
    }

    return true;
  } catch (error) {
    console.error("Error updating circle:", error);
    return false;
  }
}

export async function deleteCircle(userId: string, circleId: string) {
  try {
    // Check if user is the owner
    const { data: circle, error: getError } = await supabase
      .from("circles")
      .select("owner_id")
      .eq("id", circleId)
      .single();
    if (getError) {
      // Circle doesn't exist or can't be read — just remove membership
      const { error: delError } = await supabase
        .from("circle_members")
        .delete()
        .eq("circle_id", circleId)
        .eq("user_id", userId);
      if (delError) throw delError;
      return true;
    }

    const isOwner = circle.owner_id === userId;

    if (isOwner) {
      // Owner deleting — remove circle entirely (cascades to circle_members)
      const { error } = await supabase
        .from("circles")
        .delete()
        .eq("id", circleId);
      if (error) throw error;
    } else {
      // Member leaving — just remove their membership
      const { error } = await supabase
        .from("circle_members")
        .delete()
        .eq("circle_id", circleId)
        .eq("user_id", userId);
      if (error) throw error;
    }

    return true;
  } catch (error) {
    console.error("Error deleting circle:", error);
    return false;
  }
}

export async function saveCircleToUser(targetUserId: string, circle: Circle) {
  try {
    const { error } = await supabase.from("circle_members").upsert(
      { circle_id: circle.id, user_id: targetUserId, role: 'member' },
      { onConflict: "circle_id, user_id" },
    );
    if (error && error.code === "42501") {
      console.warn("saveCircleToUser: RLS policy blocked insert, may need circle owner to add member");
      return true;
    }
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error saving circle to user:", error);
    return false;
  }
}

// ─── Invite Code Operations ────────────────────────────────────────────────────

export async function findCircleByInviteCode(
  inviteCode: string,
): Promise<{
  data: {
    id: string;
    name: string;
    inviteCode: string;
    members: string[];
    memberIds: Record<string, string>;
    color: string;
    ownerId: string;
  } | null;
  error: string | null;
}> {
  try {
    const { data: circle, error } = await supabase
      .from("circles")
      .select("*")
      .eq("invite_code", inviteCode)
      .maybeSingle();
    if (error) throw error;
    if (!circle) return { data: null, error: null };

    const { members, memberIds } = await fetchMembersForCircle(circle.id);

    return {
      data: {
        id: circle.id,
        name: circle.name,
        inviteCode: circle.invite_code,
        members,
        memberIds,
        color: circle.color,
        ownerId: circle.owner_id,
      },
      error: null,
    };
  } catch (error: any) {
    console.error(
      "[supabaseDb] findCircleByInviteCode error:",
      error?.code,
      error?.message,
    );
    return { data: null, error: error?.code || "unknown" };
  }
}

// ─── Circle Event Operations ──────────────────────────────────────────────────

export async function getCircleEvents(
  circleId: string,
): Promise<CircleEvent[]> {
  try {
    const { data, error } = await supabase
      .from("circle_events")
      .select("id, circle_id, created_by, title, date, start_time, end_time, color, notes")
      .eq("circle_id", circleId)
      .order("date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((e) => ({
      id: e.id,
      circleId: e.circle_id,
      createdBy: e.created_by,
      title: e.title,
      date: e.date,
      startTime: e.start_time,
      endTime: e.end_time,
      color: e.color ?? undefined,
      notes: e.notes ?? undefined,
    }));
  } catch (error) {
    console.error("Error fetching circle events:", error);
    return [];
  }
}

export async function addCircleEvent(
  circleId: string,
  userId: string,
  event: { title: string; date: string; startTime: string; endTime: string; color?: string; notes?: string },
): Promise<CircleEvent | null> {
  try {
    const id = `ce_${Date.now()}`;
    const { error } = await supabase.from("circle_events").insert({
      id,
      circle_id: circleId,
      created_by: userId,
      title: event.title,
      date: event.date,
      start_time: event.startTime,
      end_time: event.endTime,
      color: event.color ?? null,
      notes: event.notes ?? null,
    });
    if (error) throw error;
    return {
      id,
      circleId,
      createdBy: userId,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      color: event.color,
      notes: event.notes,
    };
  } catch (error) {
    console.error("Error adding circle event:", error);
    return null;
  }
}

export async function updateCircleEvent(
  circleId: string,
  eventId: string,
  updates: Partial<CircleEvent>,
) {
  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.color !== undefined) dbUpdates.color = updates.color ?? null;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null;

    const { error } = await supabase
      .from("circle_events")
      .update(dbUpdates)
      .eq("id", eventId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error updating circle event:", error);
    return false;
  }
}

export async function deleteCircleEvent(eventId: string) {
  try {
    const { error } = await supabase
      .from("circle_events")
      .delete()
      .eq("id", eventId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting circle event:", error);
    return false;
  }
}

export async function getMemberRole(
  circleId: string,
  userId: string,
): Promise<'member' | 'admin' | 'owner' | null> {
  try {
    let { data, error } = await supabase
      .from("circle_members")
      .select("role")
      .eq("circle_id", circleId)
      .eq("user_id", userId)
      .maybeSingle() as any;
    if (error && (error.code === '42703' || error.message?.includes('role'))) {
      const fallback = await supabase
        .from("circle_members")
        .select("can_edit")
        .eq("circle_id", circleId)
        .eq("user_id", userId)
        .maybeSingle() as any;
      data = fallback.data;
      error = fallback.error;
      if (!error && data) {
        return data.can_edit ? 'admin' : 'member';
      }
    }
    if (error) throw error;
    return (data?.role as 'member' | 'admin' | 'owner') ?? null;
  } catch (error) {
    console.error("Error getting member role:", error);
    return null;
  }
}

export async function setMemberRole(
  circleId: string,
  targetUserId: string,
  newRole: 'member' | 'admin',
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("circle_members")
      .update({ role: newRole })
      .eq("circle_id", circleId)
      .eq("user_id", targetUserId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error setting member role:", error);
    return false;
  }
}

export async function transferOwnership(
  circleId: string,
  newOwnerUserId: string,
  currentUserId: string,
): Promise<boolean> {
  try {
    const { error: circleError } = await supabase
      .from("circles")
      .update({ owner_id: newOwnerUserId })
      .eq("id", circleId)
      .eq("owner_id", currentUserId);
    if (circleError) throw circleError;

    const { error: roleError } = await supabase
      .from("circle_members")
      .update({ role: 'member' })
      .eq("circle_id", circleId)
      .eq("user_id", currentUserId)
      .eq("role", 'owner');
    if (roleError) throw roleError;

    const { error: newOwnerError } = await supabase
      .from("circle_members")
      .update({ role: 'owner' })
      .eq("circle_id", circleId)
      .eq("user_id", newOwnerUserId);
    if (newOwnerError) throw newOwnerError;

    return true;
  } catch (error) {
    console.error("Error transferring ownership:", error);
    return false;
  }
}

// ─── Event Comment Operations ───────────────────────────────────────────────

export interface EventComment {
  id: string;
  circleEventId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  parentId: string | null;
  likeCount: number;
  replyCount: number;
  userLiked: boolean;
}

export async function getEventComments(
  circleEventId: string,
  currentUserId?: string,
): Promise<EventComment[]> {
  try {
    const { data, error } = await supabase
      .from("event_comments")
      .select("id, circle_event_id, user_id, text, created_at, parent_id, users!inner(name)")
      .eq("circle_event_id", circleEventId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const comments: EventComment[] = (data ?? []).map((r: any) => ({
      id: r.id,
      circleEventId: r.circle_event_id,
      userId: r.user_id,
      userName: r.users?.name ?? 'Unknown',
      text: r.text,
      createdAt: r.created_at,
      parentId: r.parent_id ?? null,
      likeCount: 0,
      replyCount: 0,
      userLiked: false,
    }));

    if (comments.length === 0) return [];

    // Fetch all likes for these comments
    const commentIds = comments.map((c) => c.id);
    const { data: likes } = await supabase
      .from("comment_likes")
      .select("comment_id, user_id")
      .in("comment_id", commentIds);

    const userLikedSet = new Set<string>();
    const likeCounts: Record<string, number> = {};
    for (const l of likes ?? []) {
      likeCounts[l.comment_id] = (likeCounts[l.comment_id] || 0) + 1;
      if (currentUserId && l.user_id === currentUserId) {
        userLikedSet.add(l.comment_id);
      }
    }

    // Calculate reply counts
    const replyCounts: Record<string, number> = {};
    for (const c of comments) {
      if (c.parentId) {
        replyCounts[c.parentId] = (replyCounts[c.parentId] || 0) + 1;
      }
    }

    return comments.map((c) => ({
      ...c,
      likeCount: likeCounts[c.id] || 0,
      replyCount: replyCounts[c.id] || 0,
      userLiked: userLikedSet.has(c.id),
    }));
  } catch (error) {
    console.error("Error fetching event comments:", error);
    return [];
  }
}

export async function addEventComment(
  circleEventId: string,
  userId: string,
  text: string,
  parentId?: string,
): Promise<EventComment | null> {
  try {
    const id = `ec_${Date.now()}`;
    const { error } = await supabase.from("event_comments").insert({
      id,
      circle_event_id: circleEventId,
      user_id: userId,
      text,
      parent_id: parentId ?? null,
    });
    if (error) throw error;
    const { data: user } = await supabase.from("users").select("name").eq("id", userId).maybeSingle();
    return {
      id,
      circleEventId,
      userId,
      userName: user?.name ?? 'Unknown',
      text,
      createdAt: new Date().toISOString(),
      parentId: parentId ?? null,
      likeCount: 0,
      replyCount: 0,
      userLiked: false,
    };
  } catch (error) {
    console.error("Error adding event comment:", error);
    return null;
  }
}

export async function deleteEventComment(
  commentId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting event comment:", error);
    return false;
  }
}

export async function toggleCommentLike(
  commentId: string,
  userId: string,
): Promise<{ liked: boolean; likeCount: number } | null> {
  try {
    const { data: existing } = await supabase
      .from("comment_likes")
      .select("id")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("comment_likes")
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
      const { count } = await supabase
        .from("comment_likes")
        .select("id", { count: "exact", head: true })
        .eq("comment_id", commentId);
      return { liked: false, likeCount: count ?? 0 };
    } else {
      const id = `cl_${Date.now()}`;
      const { error } = await supabase.from("comment_likes").insert({
        id,
        comment_id: commentId,
        user_id: userId,
      });
      if (error) throw error;
      const { count } = await supabase
        .from("comment_likes")
        .select("id", { count: "exact", head: true })
        .eq("comment_id", commentId);
      return { liked: true, likeCount: count ?? 0 };
    }
  } catch (error) {
    console.error("Error toggling comment like:", error);
    return null;
  }
}

// ─── Chat / Messages ───────────────────────────────────────────────────────────

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

export async function sendMessage(
  circleId: string,
  userId: string,
  text: string,
  parentId?: string,
): Promise<ChatMessage | null> {
  try {
    const id = `msg_${Date.now()}`;
    const { error } = await supabase.from("messages").insert({
      id,
      circle_id: circleId,
      user_id: userId,
      text,
      parent_id: parentId ?? null,
    });
    if (error) throw error;
    const { data: user } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    return {
      id,
      circleId,
      userId,
      userName: user?.name ?? "Unknown",
      text,
      createdAt: new Date().toISOString(),
      parentId: parentId ?? null,
      likeCount: 0,
      replyCount: 0,
      userLiked: false,
      reactions: [],
      userReaction: null,
    };
  } catch (error) {
    console.error("Error sending message:", error);
    return null;
  }
}

export async function fetchMessages(
  circleId: string,
  currentUserId?: string,
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, circle_id, user_id, text, created_at, parent_id, users!inner(name)")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const allMessages = (data ?? []).map((r: any) => ({
      id: r.id,
      circleId: r.circle_id,
      userId: r.user_id,
      userName: r.users?.name ?? "Unknown",
      text: r.text,
      createdAt: r.created_at,
      parentId: r.parent_id ?? null,
      likeCount: 0,
      replyCount: 0,
      userLiked: false,
      reactions: [] as MessageReaction[],
      userReaction: null as string | null,
    }));

    if (allMessages.length === 0) return [];

    const messageIds = allMessages.map((m) => m.id);

    // Fetch reactions
    const { data: reactions } = await supabase
      .from("message_reactions")
      .select("message_id, user_id, reaction")
      .in("message_id", messageIds);

    const reactionMap: Record<string, MessageReaction[]> = {};
    const userReacted: Record<string, string | null> = {};
    for (const r of reactions ?? []) {
      if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
      reactionMap[r.message_id].push({
        emoji: r.reaction ?? '❤️',
        userId: r.user_id,
        userName: '',
      });
      if (currentUserId && r.user_id === currentUserId) {
        userReacted[r.message_id] = r.reaction ?? '❤️';
      }
    }

    // Calculate reply counts
    const replyCounts: Record<string, number> = {};
    for (const m of allMessages) {
      if (m.parentId) {
        replyCounts[m.parentId] = (replyCounts[m.parentId] || 0) + 1;
      }
    }

    return allMessages.map((m) => ({
      ...m,
      likeCount: (reactionMap[m.id] ?? []).length,
      replyCount: replyCounts[m.id] || 0,
      userLiked: userReacted[m.id] !== undefined,
      reactions: reactionMap[m.id] ?? [],
      userReaction: userReacted[m.id] ?? null,
    }));
  } catch (error) {
    console.error("Error fetching messages:", error);
    return [];
  }
}

export function applyMessagePayload(
  currentMessages: ChatMessage[],
  payload: RealtimePayload,
): ChatMessage[] | null {
  if (payload.eventType === "INSERT") {
    const m = payload.new;
    if (!m || !m.id) return null;
    if (currentMessages.some((x) => x.id === m.id)) return currentMessages;
    const msg: ChatMessage = {
      id: m.id,
      circleId: m.circle_id ?? "",
      userId: m.user_id ?? "",
      userName: m.users?.name ?? m.user_name ?? "Unknown",
      text: m.text ?? "",
      createdAt: m.created_at ?? new Date().toISOString(),
      parentId: m.parent_id ?? null,
      likeCount: 0,
      replyCount: 0,
      userLiked: false,
      reactions: [],
      userReaction: null,
    };
    return [...currentMessages, msg];
  }
  if (payload.eventType === "DELETE") {
    const old = payload.old;
    if (!old || !old.id) return null;
    return currentMessages.filter((m) => m.id !== old.id);
  }
  return null;
}

let _channelSeq = 0;

function nextChannelSeq(): number {
  return ++_channelSeq;
}

export function onMessagesChange(
  circleIds: string[],
  onPayload: (payload: RealtimePayload) => void,
) {
  if (circleIds.length === 0) return () => {};
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`messages-${circleIds.join("-")}-${seq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `circle_id=in.(${circleIds.join(",")})`,
      },
      (payload: any) => {
        onPayload({
          eventType: payload.eventType as RealtimeEventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function toggleMessageReaction(
  messageId: string,
  userId: string,
): Promise<{ liked: boolean; likeCount: number } | null> {
  try {
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
      const { count } = await supabase
        .from("message_reactions")
        .select("id", { count: "exact", head: true })
        .eq("message_id", messageId);
      return { liked: false, likeCount: count ?? 0 };
    } else {
      const id = `mr_${Date.now()}`;
      const { error } = await supabase.from("message_reactions").insert({
        id,
        message_id: messageId,
        user_id: userId,
      });
      if (error) throw error;
      const { count } = await supabase
        .from("message_reactions")
        .select("id", { count: "exact", head: true })
        .eq("message_id", messageId);
      return { liked: true, likeCount: count ?? 0 };
    }
  } catch (error) {
    console.error("Error toggling message reaction:", error);
    return null;
  }
}

// ─── Real-time Listeners ──────────────────────────────────────────────────────

/**
 * Subscribe to the user's own events. Returns an unsubscribe function.
 * The payload callback provides the raw postgres_changes payload so the
 * caller can do targeted updates instead of a full re-fetch.
 */
export function onUserEventsChange(
  userId: string,
  onPayload: (payload: RealtimePayload) => void,
) {
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`events-${userId}-${seq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "events",
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        onPayload({
          eventType: payload.eventType as RealtimeEventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to changes on circles the user owns. Returns unsubscribe fn.
 */
function onCirclesTableChange(
  userId: string,
  onPayload: (payload: RealtimePayload) => void,
) {
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`circles-own-${userId}-${seq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "circles",
        filter: `owner_id=eq.${userId}`,
      },
      (payload: any) => {
        onPayload({
          eventType: payload.eventType as RealtimeEventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to circle_members changes for circles the user is in.
 * This detects when OTHER users join or leave a shared circle.
 * Returns unsubscribe fn.
 */
function onCircleMembersChange(
  circleIds: string[],
  onPayload: (payload: RealtimePayload) => void,
) {
  if (circleIds.length === 0) return () => {};
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`circle-members-${circleIds.join("-")}-${seq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "circle_members",
        filter: `circle_id=in.(${circleIds.join(",")})`,
      },
      (payload: any) => {
        onPayload({
          eventType: payload.eventType as RealtimeEventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to circle_events changes for circles the user is in.
 * Returns unsubscribe fn.
 */
function onCircleEventsChange(
  circleIds: string[],
  onPayload: (payload: RealtimePayload) => void,
) {
  if (circleIds.length === 0) return () => {};
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`circle-events-${circleIds.join("-")}-${seq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "circle_events",
        filter: `circle_id=in.(${circleIds.join(",")})`,
      },
      (payload: any) => {
        onPayload({
          eventType: payload.eventType as RealtimeEventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── High-level Subscription Setup ─────────────────────────────────────────

export interface CircleSubscriptions {
  unsubCircles: () => void;
  unsubCircleMembers: () => void;
  unsubCircleEvents: () => void;
  unsubMessages: () => void;
}

/**
 * Set up all circle-related subscriptions. Returns object with unsubscribe fns.
 */
export function setupCircleSubscriptions(
  userId: string,
  circleIds: string[],
  onCirclePayload: (payload: RealtimePayload) => void,
  onMemberPayload: (payload: RealtimePayload) => void,
  onEventPayload: (payload: RealtimePayload) => void,
  onMessagePayload: (payload: RealtimePayload) => void,
): CircleSubscriptions {
  return {
    unsubCircles: onCirclesTableChange(userId, onCirclePayload),
    unsubCircleMembers: onCircleMembersChange(circleIds, onMemberPayload),
    unsubCircleEvents: onCircleEventsChange(circleIds, onEventPayload),
    unsubMessages: onMessagesChange(circleIds, onMessagePayload),
  };
}

// ─── Direct Message (DM) Operations ─────────────────────────────────────────

export interface MessageReaction {
  emoji: string;
  userId: string;
  userName: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  reactions: MessageReaction[];
  userReaction: string | null;
}

export function applyConversationMessagePayload(
  currentMessages: ConversationMessage[],
  payload: RealtimePayload,
): ConversationMessage[] | null {
  if (payload.eventType === 'INSERT') {
    const m = payload.new;
    if (!m || !m.id) return null;
    if (currentMessages.some((x) => x.id === m.id)) return currentMessages;
    const msg: ConversationMessage = {
      id: m.id,
      conversationId: m.conversation_id ?? '',
      userId: m.user_id ?? '',
      userName: m.users?.name ?? m.user_name ?? 'Unknown',
      text: m.text ?? '',
      createdAt: m.created_at ?? new Date().toISOString(),
      reactions: [],
      userReaction: null,
    };
    return [...currentMessages, msg];
  }
  if (payload.eventType === 'DELETE') {
    const old = payload.old;
    if (!old || !old.id) return null;
    return currentMessages.filter((m) => m.id !== old.id);
  }
  return null;
}

export interface ConversationPreview {
  id: string;
  type: 'dm';
  otherUserId: string;
  otherUserName: string;
  lastMessage: string;
  lastMessageAt: string;
}

export async function getOrCreateDMConversation(
  otherUserId: string,
): Promise<string | null> {
  try {
    const { data: existing, error: searchError } = await supabase
      .rpc("find_dm_conversation", { other_user_id: otherUserId });
    if (searchError) throw searchError;
    if (existing) return existing as string;

    const { data, error } = await supabase
      .rpc("create_dm_conversation", { other_user_id: otherUserId });
    if (error) throw error;
    return data as string;
  } catch (error) {
    console.error("Error getting/creating DM conversation:", error);
    return null;
  }
}

export async function fetchConversations(): Promise<ConversationPreview[]> {
  try {
    const { data, error } = await supabase.rpc("fetch_user_conversations");
    if (error) throw error;
    const rows: any[] = data as any[] ?? [];
    return rows.map((r: any) => ({
      id: r.id,
      type: 'dm' as const,
      otherUserId: r.other_user_id,
      otherUserName: r.other_user_name ?? "Unknown",
      lastMessage: r.last_message ?? "",
      lastMessageAt: r.last_message_at ?? "",
    }));
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return [];
  }
}

export async function sendConversationMessage(
  conversationId: string,
  userId: string,
  text: string,
): Promise<ConversationMessage | null> {
  try {
    const id = `cmsg_${Date.now()}`;
    const { error } = await supabase.from("conversation_messages").insert({
      id,
      conversation_id: conversationId,
      user_id: userId,
      text,
    });
    if (error) throw error;

    const { data: user } = await supabase
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();

    return {
      id,
      conversationId,
      userId,
      userName: user?.name ?? "Unknown",
      text,
      createdAt: new Date().toISOString(),
      reactions: [],
      userReaction: null,
    };
  } catch (error) {
    console.error("Error sending conversation message:", error);
    return null;
  }
}

export async function deleteConversationMessage(
  messageId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("conversation_messages")
      .delete()
      .eq("id", messageId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting conversation message:", error);
    return false;
  }
}

export async function deleteCircleChatMessage(
  messageId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting circle chat message:", error);
    return false;
  }
}

export async function leaveConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error leaving conversation:", error);
    return false;
  }
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export async function toggleCircleMessageReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  try {
    // Check if user already has a reaction on this message
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id, reaction")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      if (existing.reaction === emoji) {
        // Same emoji → delete
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Different emoji → update
        const { error } = await supabase
          .from("message_reactions")
          .update({ reaction: emoji })
          .eq("id", existing.id);
        if (error) throw error;
      }
    } else {
      // No existing reaction → insert
      const id = `reac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { error } = await supabase
        .from("message_reactions")
        .insert({ id, message_id: messageId, user_id: userId, reaction: emoji });
      if (error) throw error;
    }
    return true;
  } catch (error) {
    console.error("Error toggling circle message reaction:", error);
    return false;
  }
}

export async function toggleConversationMessageReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from("conversation_message_reactions")
      .select("id, reaction")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      if (existing.reaction === emoji) {
        const { error } = await supabase
          .from("conversation_message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("conversation_message_reactions")
          .update({ reaction: emoji })
          .eq("id", existing.id);
        if (error) throw error;
      }
    } else {
      const id = `reac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { error } = await supabase
        .from("conversation_message_reactions")
        .insert({ id, message_id: messageId, user_id: userId, reaction: emoji });
      if (error) throw error;
    }
    return true;
  } catch (error) {
    console.error("Error toggling conversation message reaction:", error);
    return false;
  }
}

export async function fetchConversationMessages(
  conversationId: string,
  currentUserId?: string,
): Promise<ConversationMessage[]> {
  try {
    const { data, error } = await supabase
      .rpc("fetch_conversation_messages", { conv_id: conversationId });
    if (error) throw error;
    const rows: any[] = data as any[] ?? [];
    const messages = rows.map((r: any) => ({
      id: r.id,
      conversationId: r.conversation_id,
      userId: r.user_id,
      userName: r.user_name ?? "Unknown",
      text: r.text,
      createdAt: r.created_at,
      reactions: [] as MessageReaction[],
      userReaction: null as string | null,
    }));

    if (messages.length === 0) return [];

    // Fetch reactions
    const messageIds = messages.map((m) => m.id);
    const { data: reactions } = await supabase
      .from("conversation_message_reactions")
      .select("message_id, user_id, reaction")
      .in("message_id", messageIds);

    const reactionMap: Record<string, MessageReaction[]> = {};
    const userReacted: Record<string, string | null> = {};
    for (const r of reactions ?? []) {
      if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
      reactionMap[r.message_id].push({
        emoji: r.reaction ?? '❤️',
        userId: r.user_id,
        userName: '',
      });
      if (currentUserId && r.user_id === currentUserId) {
        userReacted[r.message_id] = r.reaction ?? '❤️';
      }
    }

    return messages.map((m) => ({
      ...m,
      reactions: reactionMap[m.id] ?? [],
      userReaction: userReacted[m.id] ?? null,
    }));
  } catch (error) {
    console.error("Error fetching conversation messages:", error);
    return [];
  }
}

export function onConversationMessagesChange(
  conversationIds: string[],
  onPayload: (payload: RealtimePayload) => void,
) {
  if (conversationIds.length === 0) return () => {};
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`conv-messages-${conversationIds.join("-")}-${seq}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversation_messages",
        filter: `conversation_id=in.(${conversationIds.join(",")})`,
      },
      (payload: any) => {
        onPayload({
          eventType: payload.eventType as RealtimeEventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ─── Typing Indicator Broadcast ───────────────────────────────────────────────

export function broadcastTyping(channelName: string, userName: string) {
  const seq = nextChannelSeq();
  const channel = supabase
    .channel(`typing-${channelName}-${seq}`)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userName, timestamp: Date.now() },
        });
        // Clean up after sending
        setTimeout(() => { supabase.removeChannel(channel); }, 1000);
      }
    });
}

export function onTypingChange(
  channelName: string,
  onTyping: (typingUsers: string[]) => void,
) {
  const seq = nextChannelSeq();
  const typingTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};
  const typingUsers = new Set<string>();

  const channel = supabase
    .channel(`typing-${channelName}-${seq}`)
    .on('broadcast', { event: 'typing' }, (payload: any) => {
      const userName: string = payload.payload?.userName;
      if (!userName) return;
      typingUsers.add(userName);
      onTyping(Array.from(typingUsers));
      if (typingTimeouts[userName]) clearTimeout(typingTimeouts[userName]);
      typingTimeouts[userName] = setTimeout(() => {
        typingUsers.delete(userName);
        onTyping(Array.from(typingUsers));
        delete typingTimeouts[userName];
      }, 3000);
    })
    .subscribe();

  return () => {
    Object.values(typingTimeouts).forEach(clearTimeout);
    supabase.removeChannel(channel);
  };
}

/**
 * Apply a real-time payload to local events state without full re-fetch.
 * Returns the updated events array, or null if a full re-fetch is needed.
 */
export function applyEventPayload(
  events: ScheduleEvent[],
  payload: RealtimePayload,
): ScheduleEvent[] | null {
  if (payload.eventType === "INSERT") {
    const e = payload.new;
    if (!e || !e.id) return null;
    const event: ScheduleEvent = {
      id: e.id,
      title: e.title ?? "",
      date: e.date ?? "",
      startTime: e.start_time ?? "",
      endTime: e.end_time ?? "",
      color: e.color ?? undefined,
      notes: e.notes ?? undefined,
      archived: e.archived ?? false,
    };
    // Don't add if it already exists (e.g., optimistic update beat the real-time event)
    if (events.some((ex) => ex.id === event.id)) return events;
    return [...events, event];
  }

  if (payload.eventType === "UPDATE") {
    const e = payload.new;
    if (!e || !e.id) return null;
    const idx = events.findIndex((ex) => ex.id === e.id);
    if (idx === -1) return null; // Don't have it locally, need full refresh
    const updated: ScheduleEvent = {
      ...events[idx],
      title: e.title ?? events[idx].title,
      date: e.date ?? events[idx].date,
      startTime: e.start_time ?? events[idx].startTime,
      endTime: e.end_time ?? events[idx].endTime,
      color: e.color ?? events[idx].color,
      notes: e.notes ?? events[idx].notes,
      archived: e.archived ?? events[idx].archived,
    };
    const copy = [...events];
    copy[idx] = updated;
    return copy;
  }

  if (payload.eventType === "DELETE") {
    const old = payload.old;
    if (!old || !old.id) return null;
    return events.filter((ex) => ex.id !== old.id);
  }

  return null;
}

/**
 * Apply a real-time payload to local circles state without full re-fetch.
 * For member changes, returns a partial update.
 */
export function applyCirclePayload(
  circles: Circle[],
  payload: RealtimePayload,
): Circle[] | null {
  if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
    const c = payload.eventType === "INSERT" ? payload.new : payload.new;
    if (!c || !c.id) return null;
    const idx = circles.findIndex((ex) => ex.id === c.id);
    if (idx === -1) return null; // Don't have it, skip (full refresh will catch)
    const updated: Circle = {
      ...circles[idx],
      ...(c.name !== undefined ? { name: c.name } : {}),
      ...(c.invite_code !== undefined ? { inviteCode: c.invite_code } : {}),
      ...(c.color !== undefined ? { color: c.color } : {}),
    };
    const copy = [...circles];
    copy[idx] = updated;
    return copy;
  }

  if (payload.eventType === "DELETE") {
    const old = payload.old;
    if (!old || !old.id) return null;
    return circles.filter((ex) => ex.id !== old.id);
  }

  return null;
}

/**
 * Apply a member change payload (someone joined/left a circle the user is in).
 * Returns updated circles array, or null if a full re-fetch is needed.
 */
export function applyMemberPayload(
  circles: Circle[],
  payload: RealtimePayload,
  currentUserId: string,
): Circle[] | null {
  const extractCircleId = (obj: Record<string, any>) =>
    obj.circle_id ?? obj.circleId ?? null;

  if (payload.eventType === "INSERT") {
    const row = payload.new;
    if (!row) return null;
    const circleId = extractCircleId(row);
    if (!circleId) return null;

    // If it's our own membership being added (we just joined a new circle),
    // we need a full refresh to get the circle data
    if (row.user_id === currentUserId) return null;

    const idx = circles.findIndex((c) => c.id === circleId);
    if (idx === -1) return null;
    // Can't update member list without knowing the name; trigger full refresh
    return null;
  }

  if (payload.eventType === "UPDATE") {
    const row = payload.new;
    if (!row) return null;
    const circleId = extractCircleId(row);
    if (!circleId) return null;

    if (row.user_id === currentUserId) return null;

    return null;
  }

  if (payload.eventType === "DELETE") {
    const row = payload.old;
    if (!row) return null;
    const circleId = extractCircleId(row);
    if (!circleId) return null;

    // If we ourselves were removed, remove the circle entirely
    if (row.user_id === currentUserId) {
      return circles.filter((c) => c.id !== circleId);
    }

    // Another member left — need full refresh to rebuild member list
    return null;
  }

  return null;
}

/**
 * Apply a circle_events payload to the local circleEvents state.
 */
export function applyCircleEventPayload(
  circleEvents: Record<string, CircleEvent[]>,
  payload: RealtimePayload,
): Record<string, CircleEvent[]> | null {
  const extractCircleId = (obj: Record<string, any>) =>
    obj.circle_id ?? obj.circleId ?? null;

  const dbRowToEvent = (row: Record<string, any>): CircleEvent => ({
    id: row.id,
    circleId: row.circle_id ?? row.circleId ?? "",
    createdBy: row.created_by ?? row.createdBy ?? "",
    title: row.title ?? "",
    date: row.date ?? "",
    startTime: row.start_time ?? row.startTime ?? "",
    endTime: row.end_time ?? row.endTime ?? "",
    color: row.color ?? undefined,
    notes: row.notes ?? undefined,
  });

  if (payload.eventType === "INSERT") {
    const row = payload.new;
    if (!row || !row.id) return null;
    const circleId = extractCircleId(row);
    if (!circleId) return null;
    const event = dbRowToEvent(row);
    const current = circleEvents[circleId] ?? [];
    if (current.some((e) => e.id === event.id)) return circleEvents;
    return { ...circleEvents, [circleId]: [...current, event] };
  }

  if (payload.eventType === "UPDATE") {
    const row = payload.new;
    if (!row || !row.id) return null;
    const circleId = extractCircleId(row);
    if (!circleId) return null;
    const current = circleEvents[circleId] ?? [];
    const idx = current.findIndex((e) => e.id === row.id);
    if (idx === -1) return null;
    const updated = dbRowToEvent({ ...current[idx], ...row });
    const copy = [...current];
    copy[idx] = updated;
    return { ...circleEvents, [circleId]: copy };
  }

  if (payload.eventType === "DELETE") {
    const row = payload.old;
    if (!row || !row.id) return null;
    const circleId = extractCircleId(row);
    if (!circleId) return null;
    const current = circleEvents[circleId] ?? [];
    return {
      ...circleEvents,
      [circleId]: current.filter((e) => e.id !== row.id),
    };
  }

  return null;
}

// ─── Invitation Operations ─────────────────────────────────────────────────────

export interface CircleInvitation {
  id: string;
  circleId: string;
  invitedUserId: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  circleName?: string;
  circleColor?: string;
  invitedByName?: string;
  createdAt: string;
}

export async function sendInvitation(
  circleId: string,
  invitedUserId: string,
  invitedBy: string,
): Promise<boolean> {
  try {
    // Delete any existing invitation first (admitted user may have left and re-joining)
    await supabase
      .from("circle_invitations")
      .delete()
      .eq("circle_id", circleId)
      .eq("invited_user_id", invitedUserId);

    const { error } = await supabase.from("circle_invitations").insert({
      circle_id: circleId,
      invited_user_id: invitedUserId,
      invited_by: invitedBy,
      status: 'pending',
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error sending invitation:", error);
    return false;
  }
}

export async function respondToInvitation(
  invitationId: string,
  status: 'accepted' | 'declined',
  circleId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("circle_invitations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("invited_user_id", userId);
    if (error) throw error;

    // If accepted, also add user to circle_members
    if (status === 'accepted') {
      const { error: memberError } = await supabase
        .from("circle_members")
        .upsert(
          { circle_id: circleId, user_id: userId, role: 'member' },
          { onConflict: "circle_id, user_id" },
        );
      if (memberError) throw memberError;
    }

    return true;
  } catch (error) {
    console.error("Error responding to invitation:", error);
    return false;
  }
}

export async function getPendingInvitations(
  userId: string,
): Promise<CircleInvitation[]> {
  try {
    const { data, error } = await supabase
      .from("circle_invitations")
      .select("id, circle_id, invited_user_id, invited_by, status, created_at, circles!inner(name, color), invited:users!circle_invitations_invited_by_fkey(name)")
      .eq("invited_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }) as any;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      circleId: r.circle_id,
      invitedUserId: r.invited_user_id,
      invitedBy: r.invited_by,
      status: r.status,
      circleName: r.circles?.name ?? 'Unknown',
      circleColor: r.circles?.color ?? '#2DD4BF',
      invitedByName: r.invited?.name ?? 'Unknown',
      createdAt: r.created_at,
    }));
  } catch (error) {
    console.error("Error fetching pending invitations:", error);
    return [];
  }
}

export function onInvitationsChange(
  userId: string,
  callback: (payload: RealtimePayload) => void,
): () => void {
  const channel = supabase
    .channel("invitations-" + userId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "circle_invitations",
        filter: `invited_user_id=eq.${userId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType.toUpperCase() as RealtimeEventType,
          new: payload.new as Record<string, any>,
          old: payload.old as Record<string, any>,
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function applyInvitationPayload(
  invitations: CircleInvitation[],
  payload: RealtimePayload,
): CircleInvitation[] | null {
  if (payload.eventType === "INSERT") {
    const row = payload.new;
    if (!row || !row.id) return null;
    const invitation: CircleInvitation = {
      id: row.id,
      circleId: row.circle_id ?? '',
      invitedUserId: row.invited_user_id ?? '',
      invitedBy: row.invited_by ?? '',
      status: row.status ?? 'pending',
      createdAt: row.created_at ?? new Date().toISOString(),
    };
    if (invitations.some((i) => i.id === invitation.id)) return invitations;
    return [...invitations, invitation];
  }

  if (payload.eventType === "UPDATE") {
    const row = payload.new;
    if (!row || !row.id) return null;
    const idx = invitations.findIndex((i) => i.id === row.id);
    if (idx === -1) return null;
    const updated = [...invitations];
    updated[idx] = {
      ...updated[idx],
      status: row.status ?? updated[idx].status,
    };
    if (row.status && row.status !== 'pending') {
      return updated.filter((i) => i.status === 'pending');
    }
    return updated;
  }

  if (payload.eventType === "DELETE") {
    const row = payload.old;
    if (!row || !row.id) return null;
    return invitations.filter((i) => i.id !== row.id);
  }

  return null;
}
