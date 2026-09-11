import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trash2, ClipboardList, Plane, MessageCircle, Mail, Loader2, CheckCircle2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { ClientHandoverTracker } from "./ClientHandoverTracker";
import {
  getAllHandovers,
  groupHandoversByLeave,
  handoverTitle,
  type ClientHandover,
  type LeaveHandoverGroup,
} from "@/lib/handoverStatus";

const APP_URL = "https://www.care-cuddle-academy.co.uk";
const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";

/** One client's handovers within a leave: Springs of Joy → Amaka, → Sam. */
interface ClientRows {
  client: string;
  handovers: ClientHandover[];
}

/** A leave (or departure) as the card shows it, with its numbers worked out once. */
interface LeaveView {
  group: LeaveHandoverGroup;
  clients: ClientRows[];
  required: ClientHandover[];
  /** Required handovers nobody has made a start on. */
  notStartedCount: number;
  /** Every required handover is complete (and at least one is required). */
  ready: boolean;
  /** Mean progress across the required handovers (0 when none). */
  avgProgress: number;
  /** Clients with at least one handover still required — what the nudges talk about. */
  nudgeClients: ClientRows[];
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The client's tracker page, opened on this handover. */
const trackerPath = (h: ClientHandover) =>
  `/public/schedule/${encodeURIComponent(h.client.trim())}?handover=${encodeURIComponent(h.id ?? h.key)}`;

const isComplete = (h: ClientHandover) =>
  h.requirement === "required" && h.taskCount > 0 && h.avgProgress >= 100;

/** "not started" / "40% complete" — the vocabulary the nudge email reads back. */
const statusLabel = (h: ClientHandover) =>
  h.avgProgress > 0 ? `${h.avgProgress}% complete` : "not started";

/** "Mercy", "Amaka and Sam", "Amaka, Sam and Bola". */
const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function summarise(group: LeaveHandoverGroup): LeaveView {
  const byClient = new Map<string, ClientHandover[]>();
  for (const h of group.handovers) {
    if (!byClient.has(h.client)) byClient.set(h.client, []);
    byClient.get(h.client)!.push(h);
  }
  // Clients alphabetically; within a client the group's order already puts
  // coverers by name with "cover not assigned yet" last.
  const clients = Array.from(byClient.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([client, handovers]) => ({ client, handovers }));
  const required = group.handovers.filter((h) => h.requirement === "required");
  return {
    group,
    clients,
    required,
    notStartedCount: required.filter((h) => h.avgProgress === 0).length,
    ready: required.length > 0 && required.every(isComplete),
    avgProgress: required.length
      ? Math.round(required.reduce((s, h) => s + h.avgProgress, 0) / required.length)
      : 0,
    nudgeClients: clients.filter((c) => c.handovers.some((h) => h.requirement === "required")),
  };
}

/** How one handover stands, in the words the nudges use. */
const describe = (h: ClientHandover) =>
  h.requirement === "not_required" ? "not required" : statusLabel(h);

/**
 * Ready-to-paste WhatsApp nudge for one leave's outstanding handovers —
 * "start" wording when nothing is underway, "finish" wording otherwise, with
 * every coverer's status and a tracker link per client.
 */
function buildWhatsAppMessage(leave: LeaveView): string {
  const { group, required, nudgeClients } = leave;
  const firstName = group.from.name.trim().split(/\s+/)[0];
  const departure = group.kind === "departure";
  const dates = group.startDate === group.endDate
    ? fmtDate(group.startDate)
    : `${fmtDate(group.startDate)} – ${fmtDate(group.endDate)}`;
  const inDays = `in ${group.daysUntil} day${group.daysUntil === 1 ? "" : "s"}`;
  const timing = departure
    ? group.ongoing
      ? "your last day has passed"
      : group.daysUntil === 0 ? "today is your last day" : `your last day is ${inDays}`
    : group.ongoing
      ? "your leave has already started"
      : group.daysUntil === 0 ? "your leave starts today" : `your leave starts ${inDays}`;
  const plural = required.length > 1;
  const anyStarted = required.some((h) => h.avgProgress > 0);
  const clientLines = nudgeClients.map(({ client, handovers }) => {
    // A client either has named coverers or one "not assigned yet" handover,
    // never both — the rota derives one or the other.
    const named = handovers.filter((h) => h.to);
    const handingTo = named.length > 0
      ? `hand over to ${joinNames(named.map((h) => `${h.to!.name} (${describe(h)})`))}`
      : `no cover assigned yet (${describe(handovers[0])})`;
    // Open the page on a handover they still need to work on.
    const focus = handovers.find((h) => h.requirement === "required") ?? handovers[0];
    return `• ${client} — ${handingTo}\n${APP_URL}${trackerPath(focus)}`;
  });
  const ask = anyStarted
    ? `Please complete the outstanding handover tasks before ${departure ? "your last day" : "your leave begins"}${plural ? " — each handover needs finishing" : ""}.`
    : `Please start your handover${plural ? "s" : ""} as soon as you can so everything is covered before you go.`;
  return [
    `Hi ${firstName}, ${timing} (${dates}) and your client handover${plural ? "s" : ""} ${plural ? "aren't" : "isn't"} complete yet.`,
    clientLines.join("\n\n"),
    `📺 Not sure how the Handover Tracker works? Watch this short guide:\n${HANDOVER_VIDEO_URL}`,
    `${ask} Thank you! 🙏`,
  ].join("\n\n");
}

/** What send-handover-nudge needs to write the same reminder as an email. */
function nudgePayload(leave: LeaveView) {
  const { group } = leave;
  return {
    recipientEmail: group.from.email,
    recipientName: group.from.name,
    leaveStart: group.startDate,
    leaveEnd: group.endDate,
    daysUntil: group.daysUntil,
    ongoing: group.ongoing,
    kind: group.kind,
    // The fields the previous function read, alongside the per-coverer ones,
    // so an app build that ships before the function is redeployed still
    // produces a correct reminder.
    anyStarted: leave.required.some((h) => h.avgProgress > 0),
    clients: leave.nudgeClients.map(({ client, handovers }) => ({
      client,
      statusLabel: (() => {
        const required = handovers.filter((h) => h.requirement === "required");
        const mean = required.length ? Math.round(required.reduce((s, h) => s + h.avgProgress, 0) / required.length) : 0;
        return mean > 0 ? `${mean}% complete` : "not started";
      })(),
      coverNames: handovers.filter((h) => h.requirement === "required" && h.to).map((h) => h.to!.name),
      handovers: handovers.map((h) => ({
        // The value for ?handover= in the tracker links.
        handoverRef: h.id ?? h.key,
        toName: h.to?.name ?? null,
        toEmail: h.to?.email ?? null,
        statusLabel: statusLabel(h),
        requirement: h.requirement,
      })),
    })),
  };
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[140px] flex-shrink-0">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
        {value}%
      </span>
    </div>
  );
}

/** "→ Mercy · 2 of 8", "→ Sam George · Not required", "→ cover not assigned yet · Not started". */
function HandoverLine({ h }: { h: ClientHandover }) {
  const complete = isComplete(h);
  return (
    <>
      <span className="text-muted-foreground" aria-hidden>→</span>
      <a
        href={trackerPath(h)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`hover:text-primary hover:underline ${h.to ? "font-medium text-foreground" : "italic text-muted-foreground"}`}
        title={`Open this handover on ${h.client}'s public page`}
      >
        {h.to ? h.to.name : "cover not assigned yet"}
      </a>
      <span className="text-muted-foreground" aria-hidden>·</span>
      {h.requirement === "not_required" ? (
        <Badge variant="outline" className="font-normal text-muted-foreground" title={h.notRequiredReason ?? undefined}>
          Not required
        </Badge>
      ) : h.avgProgress === 0 ? (
        // The same test the leave header counts "not started" with: nothing
        // ticked yet, whether or not tasks have been added.
        <Badge variant="outline" className="font-normal bg-destructive/10 text-destructive border-destructive/30">
          Not started{h.taskCount > 0 && ` · 0 of ${h.taskCount}`}
        </Badge>
      ) : complete ? (
        <Badge variant="outline" className="font-normal bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
        </Badge>
      ) : (
        <span className="text-sm text-muted-foreground tabular-nums">
          {h.completedCount} of {h.taskCount}
        </span>
      )}
      {h.requirement === "required" && !complete && h.latestTargetDate && (
        <Badge variant="secondary" className="font-normal">
          Due {fmtDate(h.latestTargetDate)}
        </Badge>
      )}
    </>
  );
}

export function HandoverTrackerSummaryCard() {
  const qc = useQueryClient();

  const { data: handovers = [], isLoading } = useQuery({
    queryKey: ["handovers-all"],
    queryFn: getAllHandovers,
    staleTime: 60 * 1000,
  });

  const clearMutation = useMutation({
    mutationFn: async (h: ClientHandover) => {
      // Only a stored handover can have tasks; the button is hidden otherwise.
      if (!h.id) return;
      const { error } = await supabase
        .from("client_handover_tasks")
        .delete()
        .eq("handover_id", h.id);
      if (error) throw error;
    },
    onSuccess: (_d, h) => {
      qc.invalidateQueries({ queryKey: ["handovers-all"] });
      qc.invalidateQueries({ queryKey: ["client-handovers"] });
      qc.invalidateQueries({ queryKey: ["client-handover-tasks", h.client] });
      toast.success(`Cleared the ${handoverTitle(h)} handover at ${h.client}`);
    },
    onError: (e: any) => toast.error(e.message || "Failed to clear handover"),
  });

  // Email equivalent of the "Copy message" WhatsApp nudge.
  const emailNudgeMutation = useMutation({
    mutationFn: async (leave: LeaveView) => {
      if (!leave.group.from.email) throw new Error(`No email address on file for ${leave.group.from.name}`);
      const { error } = await supabase.functions.invoke("send-handover-nudge", { body: nudgePayload(leave) });
      if (error) throw error;
    },
    onSuccess: (_d, { group }) =>
      toast.success(`Handover reminder emailed to ${group.from.name} (${group.from.email})`),
    onError: (e: any) => toast.error(e.message || "Failed to send email"),
  });

  // One entry per leave: a person with two holidays ahead appears twice, each
  // with its own clients, coverers and progress.
  const leaves = useMemo(() => groupHandoversByLeave(handovers).map(summarise), [handovers]);

  if (isLoading || leaves.length === 0) return null;

  // Rendered whether or not there is anything to clear, so the rows of one
  // client keep their progress bars aligned.
  const clearButton = (h: ClientHandover) => {
    const clearable = !!h.id && h.taskCount > 0;
    return (
      <Button
        variant="outline"
        size="sm"
        className={clearable ? "flex-shrink-0" : "flex-shrink-0 invisible"}
        aria-hidden={!clearable}
        tabIndex={clearable ? undefined : -1}
        title="Delete every task in this handover"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Clear all handover tasks for ${h.client} (${handoverTitle(h)})? This cannot be undone.`)) {
            clearMutation.mutate(h);
          }
        }}
        disabled={!clearable || clearMutation.isPending}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Clear
      </Button>
    );
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Active Handover Trackers
          <Badge variant="secondary" className="ml-1">
            {leaves.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full space-y-3">
          {leaves.map((leave) => {
            const { group, clients, required, notStartedCount, ready, avgProgress, nudgeClients } = leave;
            const staffName = group.from.name;
            const departure = group.kind === "departure";
            const urgent = group.ongoing || group.daysUntil <= 3;
            const soon = !urgent && group.daysUntil <= 7;
            // Same row, same data — a departure is only drawn differently
            // because it is not a holiday.
            const Icon = departure ? UserMinus : Plane;
            const timing = departure
              ? group.ongoing
                ? `Left ${Math.abs(group.daysUntil)}d ago`
                : group.daysUntil === 0 ? "Leaves today" : `Leaving in ${group.daysUntil}d`
              : group.ongoing
                ? "On leave now"
                : group.daysUntil === 0 ? "Leave starts today" : `Leave in ${group.daysUntil}d`;
            // A nudge says the handover isn't finished, so it is only offered
            // while that is true.
            const nudgeBlocked = ready
              ? "Every handover is complete — nothing to chase"
              : nudgeClients.length === 0
                ? "Every handover is marked not required"
                : null;
            return (
              <AccordionItem
                key={group.key}
                value={group.key}
                className={`border rounded-lg px-3 ${
                  urgent ? "border-destructive/40" : soon ? "border-amber-500/40" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="flex-1 hover:no-underline py-3">
                    <div className="flex items-center justify-between gap-2 w-full pr-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Icon
                          className={`h-4 w-4 flex-shrink-0 ${
                            urgent
                              ? "text-destructive"
                              : soon
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-primary"
                          }`}
                        />
                        <span className="font-semibold text-foreground">{staffName}</span>
                        <Badge
                          variant="outline"
                          className={`font-normal ${
                            urgent
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : soon
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                              : "bg-primary/5 text-primary border-primary/20"
                          }`}
                        >
                          {timing}
                        </Badge>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {departure
                            ? `Last day ${fmtDate(group.startDate)}`
                            : `${fmtDate(group.startDate)}${group.startDate !== group.endDate ? ` – ${fmtDate(group.endDate)}` : ""}`}
                        </span>
                        <Badge variant="secondary" className="font-normal">
                          {clients.length} client{clients.length === 1 ? "" : "s"}
                        </Badge>
                        {notStartedCount > 0 ? (
                          <Badge variant="outline" className="font-normal bg-destructive/10 text-destructive border-destructive/30">
                            {notStartedCount} not started
                          </Badge>
                        ) : ready ? (
                          <Badge variant="outline" className="font-normal bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
                          </Badge>
                        ) : required.length === 0 ? (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            Not required
                          </Badge>
                        ) : null}
                      </div>
                      <ProgressBar value={avgProgress} />
                    </div>
                  </AccordionTrigger>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!nudgeBlocked}
                      title={nudgeBlocked ?? "Copy a WhatsApp message asking them to start or finish their handover"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const msg = buildWhatsAppMessage(leave);
                        navigator.clipboard
                          .writeText(msg)
                          .then(() => toast.success(`WhatsApp message for ${staffName} copied — paste it into your chat`))
                          .catch(() => toast.error("Couldn't copy to clipboard"));
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Copy message
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={emailNudgeMutation.isPending || !group.from.email || !!nudgeBlocked}
                      title={nudgeBlocked
                        ?? (group.from.email
                          ? `Email this reminder to ${group.from.email}`
                          : `No email address on file for ${staffName}`)}
                      onClick={(e) => {
                        e.stopPropagation();
                        emailNudgeMutation.mutate(leave);
                      }}
                    >
                      {emailNudgeMutation.isPending
                        ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        : <Mail className="h-4 w-4 mr-1" />}
                      Send email
                    </Button>
                  </div>
                </div>
                <AccordionContent className="pb-2">
                  <Accordion type="multiple" className="w-full pl-4 sm:pl-6">
                    {clients.map(({ client, handovers: rows }) => {
                      // The client's first handover shares the client's line;
                      // any others sit beneath it, one row each.
                      const [first, ...rest] = rows;
                      const nothingRequired = rows.every((h) => h.requirement === "not_required");
                      return (
                        <AccordionItem
                          key={client}
                          value={`${group.key}::${client}`}
                          className={nothingRequired ? "border-dashed" : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <AccordionTrigger className="flex-1 hover:no-underline py-3">
                              <div className="flex items-center justify-between gap-2 w-full pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <a
                                    href={trackerPath(first)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-medium text-foreground hover:text-primary hover:underline"
                                    title={`Open ${client}'s public page`}
                                  >
                                    {client}
                                  </a>
                                  <HandoverLine h={first} />
                                </div>
                                {first.requirement === "required" && first.taskCount > 0 && (
                                  <ProgressBar value={first.avgProgress} />
                                )}
                              </div>
                            </AccordionTrigger>
                            {clearButton(first)}
                          </div>
                          {rest.map((h) => (
                            <div key={h.key} className="flex items-center gap-2 pb-3">
                              <div className="flex flex-1 items-center justify-between gap-2 pl-4 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <HandoverLine h={h} />
                                </div>
                                {h.requirement === "required" && h.taskCount > 0 && (
                                  <ProgressBar value={h.avgProgress} />
                                )}
                              </div>
                              {/* Stands in for the chevron on the line above. */}
                              <span className="w-4 flex-shrink-0" aria-hidden />
                              {clearButton(h)}
                            </div>
                          ))}
                          <AccordionContent>
                            <ClientHandoverTracker
                              clientName={client}
                              focus={{
                                holidayId: group.holidayId,
                                departureUserId: departure ? group.from.userId : null,
                              }}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
