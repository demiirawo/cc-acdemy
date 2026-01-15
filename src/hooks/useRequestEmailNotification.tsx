import { supabase } from "@/integrations/supabase/client";

interface SendNewRequestEmailParams {
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

  return {
    sendNewRequestEmail,
    sendReviewEmail,
  };
};
