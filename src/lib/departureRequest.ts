import { supabase } from "@/integrations/supabase/client";

/**
 * A departure on the requests board.
 *
 * A leaver creates the same two questions a holiday does — who is taking the
 * work on, and has the client been told — and staff_requests already has a
 * column for each. So a departure is another request type rather than another
 * mechanism, and it appears in the requests list, the timeline and the upcoming
 * preview beside the holidays.
 *
 * It is the one request type nobody but an admin can read. Requests are
 * otherwise deliberately open — your own, your swap partner's, colleagues on
 * the same client, and approved rows anonymously so the public client schedule
 * can show cover — and every one of those would announce a departure the person
 * may not have been told about. All four non-admin policies exclude the type;
 * see the migration.
 */

export interface DepartureRequest {
  id: string;
  user_id: string;
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  client_informed: boolean;
  details: string | null;
  status: string;
}

/**
 * Who already has this leaver's clients booked after their last day.
 *
 * Read from the rota rather than typed, so the succession only has to be
 * recorded once — moving the shifts across is what says who is taking over.
 * Returns null when nobody does yet, which is itself worth seeing on the board.
 */
export async function successorFromRota(userId: string, lastDay: string): Promise<string | null> {
  const { data: theirs } = await supabase
    .from("recurring_shift_patterns")
    .select("client_name")
    .eq("user_id", userId);

  const clients = [...new Set((theirs ?? [])
    .map(r => (r.client_name ?? "").trim())
    .filter(Boolean))];
  if (clients.length === 0) return null;

  const { data: after } = await supabase
    .from("recurring_shift_patterns")
    .select("user_id")
    .in("client_name", clients)
    .gt("start_date", lastDay)
    .neq("user_id", userId);

  const ids = [...new Set((after ?? []).map(r => r.user_id))];
  // Only when it is unambiguous. Two people picking up different clients is a
  // real situation, and guessing which one to name would be worse than naming
  // none and letting an admin say.
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Record the departure, or update it if the last day moves.
 *
 * One row per leaver, not one per edit — an end date corrected twice should not
 * leave three departures on the board. Whether the client has been told is
 * never overwritten: that is an admin's answer, not something to reset because
 * a date changed.
 */
export async function upsertDepartureRequest(userId: string, lastDay: string): Promise<"created" | "updated"> {
  const { data: existing } = await supabase
    .from("staff_requests")
    .select("id, client_informed")
    .eq("user_id", userId)
    .eq("request_type", "departure")
    .maybeSingle();

  const successor = await successorFromRota(userId, lastDay);

  if (existing) {
    const { error } = await supabase
      .from("staff_requests")
      .update({
        start_date: lastDay,
        end_date: lastDay,
        swap_with_user_id: successor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase.from("staff_requests").insert({
    user_id: userId,
    request_type: "departure",
    swap_with_user_id: successor,
    start_date: lastDay,
    end_date: lastDay,
    days_requested: 0,
    // Not a request anybody is approving — the decision has been made, and this
    // is the record of what still has to happen because of it.
    status: "approved",
    client_informed: false,
    details: "Last day of employment. Cover and client notification tracked here.",
  });
  if (error) throw error;
  return "created";
}

/** Withdraw the departure when an end date is cleared — they are staying. */
export async function clearDepartureRequest(userId: string): Promise<void> {
  const { error } = await supabase
    .from("staff_requests")
    .delete()
    .eq("user_id", userId)
    .eq("request_type", "departure");
  if (error) throw error;
}
