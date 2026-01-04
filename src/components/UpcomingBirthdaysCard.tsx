import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cake } from "lucide-react";
import { format, parseISO, addDays, isSameDay, setYear } from "date-fns";

interface StaffOnboarding {
  user_id: string;
  date_of_birth: string | null;
  full_name: string | null;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export function UpcomingBirthdaysCard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = addDays(today, 30);

  // Fetch staff onboarding data for birthdays
  const { data: staffData = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-birthdays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_onboarding_documents")
        .select("user_id, date_of_birth, full_name")
        .not("date_of_birth", "is", null);
      
      if (error) throw error;
      return data as StaffOnboarding[];
    }
  });

  // Fetch user profiles for display names
  const { data: userProfiles = [] } = useQuery({
    queryKey: ["user-profiles-for-birthdays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email");
      
      if (error) throw error;
      return data as UserProfile[];
    }
  });

  const getStaffName = (userId: string, fullName: string | null) => {
    if (fullName) return fullName;
    const profile = userProfiles.find(p => p.user_id === userId);
    return profile?.display_name || profile?.email || "Unknown";
  };

  // Calculate upcoming birthdays
  const upcomingBirthdays = staffData
    .filter(staff => staff.date_of_birth)
    .map(staff => {
      const dob = parseISO(staff.date_of_birth!);
      // Set the birthday to this year
      let nextBirthday = setYear(dob, today.getFullYear());
      
      // If the birthday has already passed this year, use next year
      if (nextBirthday < today && !isSameDay(nextBirthday, today)) {
        nextBirthday = setYear(dob, today.getFullYear() + 1);
      }
      
      return {
        ...staff,
        nextBirthday,
        daysUntil: Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      };
    })
    .filter(staff => staff.nextBirthday >= today && staff.nextBirthday <= thirtyDaysFromNow)
    .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime());

  if (loadingStaff) {
    return (
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cake className="h-5 w-5 text-pink-500" />
            Upcoming Birthdays
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cake className="h-5 w-5 text-pink-500" />
          Upcoming Birthdays
        </CardTitle>
        <p className="text-sm text-muted-foreground">Next 30 days</p>
      </CardHeader>
      <CardContent className="pt-0">
        {upcomingBirthdays.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Cake className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming birthdays</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingBirthdays.map((staff) => (
              <div 
                key={staff.user_id} 
                className="flex items-center justify-between p-3 rounded-lg bg-pink-50 dark:bg-pink-950/20"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center">
                    <Cake className="h-5 w-5 text-pink-500" />
                  </div>
                  <div>
                    <p className="font-medium">{getStaffName(staff.user_id, staff.full_name)}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(staff.nextBirthday, 'dd MMMM')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {staff.daysUntil === 0 ? (
                    <span className="text-sm font-medium text-pink-600">Today! 🎂</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {staff.daysUntil} day{staff.daysUntil !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
