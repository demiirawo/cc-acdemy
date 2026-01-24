import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, Cake, Award, Calendar, AlertTriangle, Users, Save, Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface NotificationSetting {
  id: string;
  notification_type: string;
  is_enabled: boolean;
  send_time: string;
  days_before: number | null;
  recipient_emails: string[];
  created_at: string;
  updated_at: string;
}

const NOTIFICATION_CONFIG: Record<string, {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  showDaysBefore: boolean;
}> = {
  birthday_today: {
    title: "Staff Birthdays",
    description: "Alert on the day of staff birthdays (combines multiple if same day)",
    icon: <Cake className="h-5 w-5" />,
    color: "text-pink-500",
    showDaysBefore: false,
  },
  anniversary_today: {
    title: "Work Anniversaries",
    description: "Alert on the day of work anniversaries (combines multiple if same day)",
    icon: <Award className="h-5 w-5" />,
    color: "text-purple-500",
    showDaysBefore: false,
  },
  upcoming_holidays: {
    title: "Upcoming Approved Holidays",
    description: "Alert about staff holidays starting within the specified days",
    icon: <Calendar className="h-5 w-5" />,
    color: "text-blue-500",
    showDaysBefore: true,
  },
  pattern_expiring: {
    title: "Shift Patterns Expiring",
    description: "Alert when recurring shift patterns are about to end",
    icon: <AlertTriangle className="h-5 w-5" />,
    color: "text-amber-500",
    showDaysBefore: true,
  },
  holiday_no_client_notification: {
    title: "Holiday Without Client Notification",
    description: "Alert when staff holiday is approaching but client hasn't been notified",
    icon: <Users className="h-5 w-5" />,
    color: "text-red-500",
    showDaysBefore: true,
  },
  shift_change: {
    title: "Shift Changes",
    description: "Real-time alert when shifts or recurring patterns are created, modified, or deleted",
    icon: <Bell className="h-5 w-5" />,
    color: "text-indigo-500",
    showDaysBefore: false,
  },
};

export function AdminNotificationSettings() {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Record<string, NotificationSetting>>({});
  const [isTesting, setIsTesting] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .order("notification_type");
      
      if (error) throw error;
      return data as NotificationSetting[];
    }
  });

  useEffect(() => {
    if (settings) {
      const settingsMap: Record<string, NotificationSetting> = {};
      settings.forEach(s => {
        settingsMap[s.notification_type] = s;
      });
      setLocalSettings(settingsMap);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (setting: Partial<NotificationSetting> & { id: string }) => {
      const { error } = await supabase
        .from("notification_settings")
        .update({
          is_enabled: setting.is_enabled,
          send_time: setting.send_time,
          days_before: setting.days_before,
        })
        .eq("id", setting.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
      toast.success("Settings saved");
    },
    onError: (error) => {
      toast.error("Failed to save settings: " + error.message);
    }
  });

  const handleToggle = (type: string, enabled: boolean) => {
    const setting = localSettings[type];
    if (setting) {
      setLocalSettings(prev => ({
        ...prev,
        [type]: { ...prev[type], is_enabled: enabled }
      }));
      updateMutation.mutate({ id: setting.id, is_enabled: enabled });
    }
  };

  const handleDaysChange = (type: string, days: number) => {
    const setting = localSettings[type];
    if (setting) {
      setLocalSettings(prev => ({
        ...prev,
        [type]: { ...prev[type], days_before: days }
      }));
    }
  };

  const handleTimeChange = (type: string, time: string) => {
    const setting = localSettings[type];
    if (setting) {
      setLocalSettings(prev => ({
        ...prev,
        [type]: { ...prev[type], send_time: time }
      }));
    }
  };

  const handleSave = (type: string) => {
    const setting = localSettings[type];
    if (setting) {
      updateMutation.mutate({
        id: setting.id,
        is_enabled: setting.is_enabled,
        send_time: setting.send_time,
        days_before: setting.days_before,
      });
    }
  };

  const handleTestNotification = async (type: string) => {
    setIsTesting(type);
    try {
      const response = await supabase.functions.invoke("daily-admin-alerts", {
        body: { testType: type }
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (response.data?.success) {
        if (response.data.emailSent) {
          toast.success(`Test email sent for ${NOTIFICATION_CONFIG[type]?.title}`);
        } else {
          toast.info(`No alerts found for ${NOTIFICATION_CONFIG[type]?.title} at this time`);
        }
      } else {
        throw new Error(response.data?.error || "Unknown error");
      }
    } catch (error: any) {
      toast.error("Test failed: " + error.message);
    } finally {
      setIsTesting(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Admin Email Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Admin Email Alerts
        </CardTitle>
        <CardDescription>
          Configure individual email alerts sent to all admin users. Each alert type sends a separate email when triggered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(NOTIFICATION_CONFIG).map(([type, config], index) => {
          const setting = localSettings[type];
          if (!setting) return null;

          return (
            <div key={type}>
              {index > 0 && <Separator className="mb-6" />}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${config.color}`}>
                      {config.icon}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{config.title}</span>
                        <Badge variant={setting.is_enabled ? "default" : "secondary"}>
                          {setting.is_enabled ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {config.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={setting.is_enabled}
                    onCheckedChange={(checked) => handleToggle(type, checked)}
                  />
                </div>

                {setting.is_enabled && (
                  <div className="ml-8 pl-3 border-l-2 border-muted space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`time-${type}`} className="text-sm whitespace-nowrap">
                          Send at:
                        </Label>
                        <Input
                          id={`time-${type}`}
                          type="time"
                          value={setting.send_time?.slice(0, 5) || "07:00"}
                          onChange={(e) => handleTimeChange(type, e.target.value + ":00")}
                          className="w-28"
                        />
                      </div>

                      {config.showDaysBefore && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`days-${type}`} className="text-sm whitespace-nowrap">
                            Days before:
                          </Label>
                          <Input
                            id={`days-${type}`}
                            type="number"
                            min={1}
                            max={30}
                            value={setting.days_before || 7}
                            onChange={(e) => handleDaysChange(type, parseInt(e.target.value) || 7)}
                            className="w-20"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestNotification(type)}
                          disabled={isTesting === type}
                        >
                          {isTesting === type ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Test
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSave(type)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <Separator />
        
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <strong>Note:</strong> Alerts are sent daily at the configured times. The "New Request" alert (holiday, shift cover, etc.) is sent immediately when a request is submitted.
        </div>
      </CardContent>
    </Card>
  );
}
