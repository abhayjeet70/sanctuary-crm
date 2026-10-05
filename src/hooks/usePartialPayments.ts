import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";

/**
 * Part-payment requests. The property takes 100% in advance; paying in parts
 * needs the guest to ask and management to agree. RLS narrows a guest to their
 * own rows, so the same hook serves the portal and the admin queue.
 */
export interface PartialPaymentRequest {
  id: string;
  bookingId: string;
  amountNow: number;
  nextDueDate: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  decidedAt?: string;
  decidedBy?: string;
  createdAt: string;
}

const toRequest = (x: Record<string, never>): PartialPaymentRequest => ({
  id: x.id,
  bookingId: x.booking_id,
  amountNow: x.amount_now,
  nextDueDate: x.next_due_date,
  note: x.note ?? "",
  status: x.status,
  decidedAt: x.decided_at ?? undefined,
  decidedBy: x.decided_by ?? undefined,
  createdAt: x.created_at,
});

export function usePartialPayments(bookingId?: string) {
  const [requests, setRequests] = useState<PartialPaymentRequest[]>([]);

  const reload = useCallback(async () => {
    let query = supabase
      .from("partial_payment_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (bookingId) query = query.eq("booking_id", bookingId);
    const { data } = await query;
    setRequests(((data ?? []) as Record<string, never>[]).map(toRequest));
  }, [bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const request = async (amountNow: number, nextDue: string, note: string) => {
    const { error } = await supabase.rpc("request_partial_payment", {
      p_booking_id: bookingId,
      p_amount_now: amountNow,
      p_next_due: nextDue,
      p_note: note,
    });
    if (!error) await reload();
    return { error: error?.message ?? null };
  };

  const decide = async (id: string, approve: boolean) => {
    const { error } = await supabase.rpc("decide_partial_payment", {
      p_request_id: id,
      p_approve: approve,
    });
    if (!error) await reload();
    return { error: error?.message ?? null };
  };

  return {
    requests,
    /** The agreement in force, if any. */
    approved: requests.find((r) => r.status === "approved"),
    pending: requests.find((r) => r.status === "pending"),
    request,
    decide,
  };
}
