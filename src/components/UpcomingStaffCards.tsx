import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Gift, Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isBefore, isAfter, parseISO, setYear } from "date-fns";

interface Holiday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  absence_type: string;
  status: string;
  display_name?: string;
}

interface Anniversary {
  user_id: string;
  start_date: string;
  display_name?: string;
  years?: number;
}

interface Birthday {
  user_id: string;
  date_of_birth: string;
  full_name?: string;
  display_name?: string;
}

export function UpcomingStaffCards() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const today = new Date();
      const thirtyDaysFromNow = addDays(today, 30);
      
      // Fetch profiles for display names
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name');
      
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p.display_name]) || []);

      // Fetch upcoming holidays (approved or pending, starting within 30 days)
      const { data: holidaysData } = await supabase
        .from('staff_holidays')
        .select('id, user_id, start_date, end_date, absence_type, status')
        .in('status', ['approved', 'pending'])
        .gte('start_date', format(today, 'yyyy-MM-dd'))
        .lte('start_date', format(thirtyDaysFromNow, 'yyyy-MM-dd'))
        .order('start_date', { ascending: true })
        .limit(5);

      const enrichedHolidays = holidaysData?.map(h => ({
        ...h,
        display_name: profilesMap.get(h.user_id) || 'Unknown'
      })) || [];
      setHolidays(enrichedHolidays);

      // Fetch HR profiles for anniversaries
      const { data: hrProfilesData } = await supabase
        .from('hr_profiles')
        .select('user_id, start_date')
        .not('start_date', 'is', null);

      // Filter and sort anniversaries coming up in the next 30 days
      const upcomingAnniversaries: Anniversary[] = [];
      hrProfilesData?.forEach(profile => {
        if (!profile.start_date) return;
        
        const startDate = parseISO(profile.start_date);
        const thisYearAnniversary = setYear(startDate, today.getFullYear());
        const nextYearAnniversary = setYear(startDate, today.getFullYear() + 1);
        
        let upcomingDate = thisYearAnniversary;
        if (isBefore(thisYearAnniversary, today)) {
          upcomingDate = nextYearAnniversary;
        }
        
        if (isBefore(upcomingDate, thirtyDaysFromNow) && !isBefore(upcomingDate, today)) {
          const years = upcomingDate.getFullYear() - startDate.getFullYear();
          upcomingAnniversaries.push({
            user_id: profile.user_id,
            start_date: format(upcomingDate, 'yyyy-MM-dd'),
            display_name: profilesMap.get(profile.user_id) || 'Unknown',
            years
          });
        }
      });
      
      upcomingAnniversaries.sort((a, b) => a.start_date.localeCompare(b.start_date));
      setAnniversaries(upcomingAnniversaries.slice(0, 5));

      // Fetch onboarding documents for birthdays
      const { data: onboardingData } = await supabase
        .from('staff_onboarding_documents')
        .select('user_id, date_of_birth, full_name')
        .not('date_of_birth', 'is', null);

      // Filter and sort birthdays coming up in the next 30 days
      const upcomingBirthdays: Birthday[] = [];
      onboardingData?.forEach(doc => {
        if (!doc.date_of_birth) return;
        
        const dob = parseISO(doc.date_of_birth);
        const thisYearBirthday = setYear(dob, today.getFullYear());
        const nextYearBirthday = setYear(dob, today.getFullYear() + 1);
        
        let upcomingDate = thisYearBirthday;
        if (isBefore(thisYearBirthday, today)) {
          upcomingDate = nextYearBirthday;
        }
        
        if (isBefore(upcomingDate, thirtyDaysFromNow) && !isBefore(upcomingDate, today)) {
          upcomingBirthdays.push({
            user_id: doc.user_id,
            date_of_birth: format(upcomingDate, 'yyyy-MM-dd'),
            full_name: doc.full_name || undefined,
            display_name: profilesMap.get(doc.user_id) || doc.full_name || 'Unknown'
          });
        }
      });
      
      upcomingBirthdays.sort((a, b) => a.date_of_birth.localeCompare(b.date_of_birth));
      setBirthdays(upcomingBirthdays.slice(0, 5));

    } catch (error) {
      console.error('Error fetching upcoming staff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return format(parseISO(dateString), 'EEE, MMM d');
  };

  const getAbsenceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      holiday: 'Holiday',
      sick: 'Sick Leave',
      personal: 'Personal',
      maternity: 'Maternity',
      paternity: 'Paternity',
      unpaid: 'Unpaid',
      other: 'Other'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-5 bg-muted rounded animate-pulse w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-10 bg-muted rounded animate-pulse"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Upcoming Staff Holidays */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            Upcoming Staff Holidays
          </CardTitle>
        </CardHeader>
        <CardContent>
          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No upcoming holidays
            </p>
          ) : (
            <div className="space-y-3">
              {holidays.map((holiday) => (
                <div
                  key={holiday.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-sm">{holiday.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getAbsenceTypeLabel(holiday.absence_type)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatDate(holiday.start_date)}</p>
                    {holiday.start_date !== holiday.end_date && (
                      <p className="text-xs text-muted-foreground">
                        to {formatDate(holiday.end_date)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Staff Anniversaries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-primary" />
            Upcoming Staff Anniversaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anniversaries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No upcoming anniversaries
            </p>
          ) : (
            <div className="space-y-3">
              {anniversaries.map((anniversary) => (
                <div
                  key={anniversary.user_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-sm">{anniversary.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {anniversary.years} {anniversary.years === 1 ? 'year' : 'years'}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{formatDate(anniversary.start_date)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Staff Birthdays */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cake className="h-4 w-4 text-primary" />
            Upcoming Staff Birthdays
          </CardTitle>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No upcoming birthdays
            </p>
          ) : (
            <div className="space-y-3">
              {birthdays.map((birthday) => (
                <div
                  key={birthday.user_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <p className="font-medium text-sm">{birthday.display_name}</p>
                  <p className="text-sm font-medium">{formatDate(birthday.date_of_birth)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
