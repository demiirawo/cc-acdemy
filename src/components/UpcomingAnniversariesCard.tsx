import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award } from "lucide-react";
import { format, parseISO, addDays, isSameDay, setYear, differenceInYears } from "date-fns";
interface HRProfile {
  user_id: string;
  start_date: string | null;
}
interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}
export function UpcomingAnniversariesCard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = addDays(today, 30);

  // Fetch HR profiles for start dates
  const {
    data: hrProfiles = [],
    isLoading: loadingHR
  } = useQuery({
    queryKey: ["staff-anniversaries"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("hr_profiles").select("user_id, start_date").not("start_date", "is", null);
      if (error) throw error;
      return data as HRProfile[];
    }
  });

  // Fetch user profiles for display names
  const {
    data: userProfiles = []
  } = useQuery({
    queryKey: ["user-profiles-for-anniversaries"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("profiles").select("user_id, display_name, email");
      if (error) throw error;
      return data as UserProfile[];
    }
  });
  const getStaffName = (userId: string) => {
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email || "Unknown";
  };

  // Calculate upcoming anniversaries
  const upcomingAnniversaries = hrProfiles.filter(profile => profile.start_date).map(profile => {
    const startDate = parseISO(profile.start_date!);
    // Set the anniversary to this year
    let nextAnniversary = setYear(startDate, today.getFullYear());

    // If the anniversary has already passed this year, use next year
    if (nextAnniversary < today && !isSameDay(nextAnniversary, today)) {
      nextAnniversary = setYear(startDate, today.getFullYear() + 1);
    }
    const yearsOfService = differenceInYears(nextAnniversary, startDate);
    return {
      ...profile,
      nextAnniversary,
      yearsOfService,
      daysUntil: Math.ceil((nextAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    };
  }).filter(profile => profile.nextAnniversary >= today && profile.nextAnniversary <= thirtyDaysFromNow && profile.yearsOfService > 0).sort((a, b) => a.nextAnniversary.getTime() - b.nextAnniversary.getTime());
  if (loadingHR) {
    return <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-amber-500" />
            Upcoming Anniversaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>;
  }
  return <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          
          Upcoming Anniversaries
        </CardTitle>
        <p className="text-sm text-muted-foreground">Work anniversaries in the next 30 days</p>
      </CardHeader>
      <CardContent className="pt-0">
        {upcomingAnniversaries.length === 0 ? <div className="text-center py-6 text-muted-foreground">
            <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming work anniversaries</p>
          </div> : <div className="space-y-3">
            {upcomingAnniversaries.map(profile => <div key={profile.user_id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Award className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium">{getStaffName(profile.user_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(profile.nextAnniversary, 'dd MMMM')} • {profile.yearsOfService} year{profile.yearsOfService !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {profile.daysUntil === 0 ? <span className="text-sm font-medium text-amber-600">Today! 🎉</span> : <span className="text-sm text-muted-foreground">
                      {profile.daysUntil} day{profile.daysUntil !== 1 ? 's' : ''}
                    </span>}
                </div>
              </div>)}
          </div>}
      </CardContent>
    </Card>;
}