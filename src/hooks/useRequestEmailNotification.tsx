import { supabase } from "@/integrations/supabase/client";

interface SendNewRequestEmailParams {
  /** The request just created — the reviewer's email link opens it directly. */
  requestId?: string;
  requestType: string;
  requesterName: string;
  requesterEmail: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  details?: string;
}

interface SendReviewEmailParams {
  type: "request_approved" | "request_rejected";
  requestType: string;
  requesterName: string;
  requesterEmail: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reviewNotes?: string;
  reviewerName?: string;
  /** Clients impacted by this leave — renders handover-tracker links on holiday approvals. */
  impactedClients?: string[];
}

interface SendCoverAssignmentEmailParams {
  assigneeName: string;
  assigneeEmail: string;
  coveredForName: string;
  coveredForEmail?: string;
  coveredDates?: string[];
  impactedClients?: string[];
}

/** Tells the person going on leave that their cover is arranged (or has changed). */
interface SendCoverConfirmedEmailParams {
  assigneeName: string;
  assigneeEmail?: string;
  coveredForName: string;
  coveredForEmail: string;
  coveredDates?: string[];
  impactedClients?: string[];
  /** Name of the person this cover replaces, when known — switches the wording to "changed". */
  previousAssigneeName?: string;
}

/** Tells a removed cover (and the person they were covering) that the cover no longer stands. */
interface SendCoverRemovedEmailParams {
  assigneeName: string;
  assigneeEmail: string;
  coveredForName: string;
  coveredForEmail?: string;
  coveredDates?: string[];
  /** Replacement cover, when already known. */
  newAssigneeName?: string;
}

export const useRequestEmailNotification = () => {
  const sendNewRequestEmail = async (params: SendNewRequestEmailParams) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-request-email", {
        body: {
          type: "new_request",
          ...params,
        },
      });

      if (error) {
        console.error("Failed to send new request email:", error);
        return { success: false, error };
      }

      console.log("New request email sent:", data);
      return { success: true, data };
    } catch (err) {
      console.error("Error sending new request email:", err);
      return { success: false, error: err };
    }
  };

  const sendReviewEmail = async (params: SendReviewEmailParams) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-request-email", {
        body: params,
      });

      if (error) {
        console.error("Failed to send review email:", error);
        return { success: false, error };
      }

      console.log("Review email sent:", data);
      return { success: true, data };
    } catch (err) {
      console.error("Error sending review email:", err);
      return { success: false, error: err };
    }
  };

  const sendCoverAssignmentEmail = async (params: SendCoverAssignmentEmailParams) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-request-email", {
        body: { type: "cover_assigned", ...params },
      });

      if (error) {
        console.error("Failed to send cover assignment email:", error);
        return { success: false, error };
      }

      console.log("Cover assignment email sent:", data);
      return { success: true, data };
    } catch (err) {
      console.error("Error sending cover assignment email:", err);
      return { success: false, error: err };
    }
  };

  const sendCoverConfirmedEmail = async (params: SendCoverConfirmedEmailParams) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-request-email", {
        body: { type: "cover_confirmed", ...params },
      });
      if (error) {
        console.error("Failed to send cover confirmation email:", error);
        return { success: false, error };
      }
      return { success: true, data };
    } catch (err) {
      console.error("Error sending cover confirmation email:", err);
      return { success: false, error: err };
    }
  };

  const sendCoverRemovedEmail = async (params: SendCoverRemovedEmailParams) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-request-email", {
        body: { type: "cover_removed", ...params },
      });
      if (error) {
        console.error("Failed to send cover removed email:", error);
        return { success: false, error };
      }
      return { success: true, data };
    } catch (err) {
      console.error("Error sending cover removed email:", err);
      return { success: false, error: err };
    }
  };

  return {
    sendNewRequestEmail,
    sendReviewEmail,
    sendCoverAssignmentEmail,
    sendCoverConfirmedEmail,
    sendCoverRemovedEmail,
  };
};
