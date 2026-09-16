import { useState } from "react";
import { Mail, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StaffColour } from "@/lib/staffColours";

/**
 * Where the client page keeps the password a visitor typed at the gate.
 *
 * The photographs sit in the private onboarding bucket, so the page has to
 * prove who is asking before it can show them. Signed-in staff prove it with
 * their session; a client has only the page password, which is why it is kept
 * for the tab — otherwise the faces would disappear on every refresh. It is
 * the visitor's own password, in their own tab, and it goes when the tab does.
 */
export const clientPagePasswordKey = (clientName: string) => `cc-client-page-pw:${clientName}`;

/** What the gated endpoint returns for one member of a client's team. */
export interface ClientTeamDetail {
  user_id: string;
  photo_url: string | null;
  work_phone: string | null;
  employment_end_date: string | null;
}

export interface ClientTeamMember {
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Signed for the hour by the endpoint; absent for a viewer it won't vouch for. */
  photoUrl: string | null;
  /** Their colour on this client's rota, so a face matches a name on the grid. */
  colour?: StaffColour;
  onShift: boolean;
}

// The same collation the rota colours use, so the order matches the legend.
const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

export function ClientTeamCard({ members }: { members: ClientTeamMember[] }) {
  // A signed URL can expire or a file can go missing; either way the card
  // falls back to initials rather than showing a broken image.
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  if (members.length === 0) return null;

  // Whoever is working right now comes first, so the person a client can
  // reach today is the first card rather than wherever the alphabet puts them.
  const sorted = [...members].sort((a, b) => {
    if (a.onShift !== b.onShift) return a.onShift ? -1 : 1;
    return COLLATOR.compare(a.name, b.name);
  });

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="text-lg sm:text-xl">The Team</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {sorted.map((member) => {
            const photo = broken[member.user_id] ? null : member.photoUrl;
            return (
              <div
                key={member.user_id}
                className={cn(
                  "group relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100",
                  "shadow-sm ring-1 ring-black/5 transition-all duration-200",
                  "hover:shadow-lg hover:-translate-y-0.5",
                  member.onShift && "ring-[3px] ring-green-600 shadow-green-100",
                )}
              >
                {/* Black and white, so photographs taken in fifty different
                    rooms, at fifty different times of day, read as one team. */}
                {photo ? (
                  <img
                    src={photo}
                    alt={member.name}
                    loading="lazy"
                    onError={() => setBroken((b) => ({ ...b, [member.user_id]: true }))}
                    className="absolute inset-0 h-full w-full object-cover object-top grayscale"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-200" />
                )}

                {member.onShift && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-green-700 shadow-sm backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    On shift
                  </span>
                )}

                {/* The picture fades into the card rather than stopping at an
                    edge, and the details sit in the settled part of the fade
                    so they stay readable whatever the photograph is like. */}
                <div className="absolute inset-x-0 bottom-0 pt-10 bg-gradient-to-t from-white via-white/95 to-transparent">
                  <div className="px-2 pb-2 text-center">
                    <div className={cn("text-xs font-semibold leading-tight", member.colour?.text)}>
                      {member.name}
                    </div>
                    <div className="mt-0.5 space-y-0.5 text-[10px] leading-snug text-gray-500">
                      {member.email && (
                        <a
                          href={`mailto:${member.email}`}
                          className="flex items-start justify-center gap-1 min-w-0 hover:text-gray-900 hover:underline"
                        >
                          <Mail className="h-2.5 w-2.5 flex-shrink-0 mt-[3px]" />
                          <span className="break-all text-left">{member.email}</span>
                        </a>
                      )}
                      {/* Nothing at all when there is no work number. */}
                      {member.phone && (
                        <a
                          href={`tel:${member.phone}`}
                          className="flex items-center justify-center gap-1 hover:text-gray-900 hover:underline"
                        >
                          <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                          <span>{member.phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
