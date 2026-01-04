import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertCircle, XCircle, FileText, User, Briefcase, Phone, Home, CreditCard, Users } from "lucide-react";

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface HRProfile {
  user_id: string;
  employee_id: string | null;
  job_title: string | null;
  start_date: string | null;
  base_salary: number | null;
  employment_status: string;
}

interface OnboardingDocument {
  user_id: string;
  full_name: string | null;
  date_of_birth: string | null;
  phone_number: string | null;
  personal_email: string | null;
  address: string | null;
  proof_of_id_1_path: string | null;
  proof_of_id_1_type: string | null;
  proof_of_id_2_path: string | null;
  proof_of_id_2_type: string | null;
  photograph_path: string | null;
  bank_name: string | null;
  account_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_email: string | null;
  form_status: string;
}

interface DocumentationField {
  key: string;
  label: string;
  category: 'hr' | 'personal' | 'id' | 'bank' | 'emergency';
  icon: React.ReactNode;
}

const DOCUMENTATION_FIELDS: DocumentationField[] = [
  // HR Profile fields
  { key: 'employee_id', label: 'Employee ID', category: 'hr', icon: <Briefcase className="h-3 w-3" /> },
  { key: 'job_title', label: 'Job Title', category: 'hr', icon: <Briefcase className="h-3 w-3" /> },
  { key: 'start_date', label: 'Start Date', category: 'hr', icon: <Briefcase className="h-3 w-3" /> },
  { key: 'base_salary', label: 'Base Salary', category: 'hr', icon: <Briefcase className="h-3 w-3" /> },
  
  // Personal Details
  { key: 'full_name', label: 'Full Name', category: 'personal', icon: <User className="h-3 w-3" /> },
  { key: 'date_of_birth', label: 'Date of Birth', category: 'personal', icon: <User className="h-3 w-3" /> },
  { key: 'phone_number', label: 'Phone Number', category: 'personal', icon: <Phone className="h-3 w-3" /> },
  { key: 'personal_email', label: 'Personal Email', category: 'personal', icon: <User className="h-3 w-3" /> },
  { key: 'address', label: 'Address', category: 'personal', icon: <Home className="h-3 w-3" /> },
  { key: 'photograph_path', label: 'Photograph', category: 'personal', icon: <User className="h-3 w-3" /> },
  
  // ID Documents
  { key: 'proof_of_id_1', label: 'ID Document 1', category: 'id', icon: <FileText className="h-3 w-3" /> },
  { key: 'proof_of_id_2', label: 'ID Document 2', category: 'id', icon: <FileText className="h-3 w-3" /> },
  
  // Bank Details
  { key: 'bank_name', label: 'Bank Name', category: 'bank', icon: <CreditCard className="h-3 w-3" /> },
  { key: 'account_number', label: 'Account Number', category: 'bank', icon: <CreditCard className="h-3 w-3" /> },
  
  // Emergency Contact
  { key: 'emergency_contact_name', label: 'Emergency Contact', category: 'emergency', icon: <Users className="h-3 w-3" /> },
  { key: 'emergency_contact_relationship', label: 'Relationship', category: 'emergency', icon: <Users className="h-3 w-3" /> },
  { key: 'emergency_contact_phone', label: 'Emergency Phone', category: 'emergency', icon: <Phone className="h-3 w-3" /> },
  { key: 'emergency_contact_email', label: 'Emergency Email', category: 'emergency', icon: <Users className="h-3 w-3" /> },
];

const CATEGORY_LABELS: Record<string, string> = {
  'hr': 'HR Profile',
  'personal': 'Personal Details',
  'id': 'ID Documents',
  'bank': 'Bank Details',
  'emergency': 'Emergency Contact'
};

export function StaffDocumentationMatrix() {
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [onboardingDocs, setOnboardingDocs] = useState<OnboardingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .order('display_name');

      if (profilesError) throw profilesError;
      setUserProfiles(profilesData || []);

      // Fetch all HR profiles
      const { data: hrData, error: hrError } = await supabase
        .from('hr_profiles')
        .select('user_id, employee_id, job_title, start_date, base_salary, employment_status');

      if (hrError) throw hrError;
      setHRProfiles(hrData || []);

      // Fetch all onboarding documents
      const { data: onboardingData, error: onboardingError } = await supabase
        .from('staff_onboarding_documents')
        .select('*');

      if (onboardingError) throw onboardingError;
      setOnboardingDocs(onboardingData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load documentation data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getHRProfile = (userId: string): HRProfile | undefined => {
    return hrProfiles.find(hr => hr.user_id === userId);
  };

  const getOnboardingDoc = (userId: string): OnboardingDocument | undefined => {
    return onboardingDocs.find(doc => doc.user_id === userId);
  };

  const getFieldValue = (userId: string, fieldKey: string): boolean => {
    const hrProfile = getHRProfile(userId);
    const onboardingDoc = getOnboardingDoc(userId);

    // HR Profile fields
    if (fieldKey === 'employee_id') return !!hrProfile?.employee_id;
    if (fieldKey === 'job_title') return !!hrProfile?.job_title;
    if (fieldKey === 'start_date') return !!hrProfile?.start_date;
    if (fieldKey === 'base_salary') return !!hrProfile?.base_salary;

    // Combined ID fields
    if (fieldKey === 'proof_of_id_1') {
      return !!(onboardingDoc?.proof_of_id_1_path && onboardingDoc?.proof_of_id_1_type);
    }
    if (fieldKey === 'proof_of_id_2') {
      return !!(onboardingDoc?.proof_of_id_2_path && onboardingDoc?.proof_of_id_2_type);
    }

    // Onboarding document fields
    if (onboardingDoc) {
      const value = onboardingDoc[fieldKey as keyof OnboardingDocument];
      return !!value;
    }

    return false;
  };

  const getStaffCompletionStats = (userId: string) => {
    let complete = 0;
    let total = DOCUMENTATION_FIELDS.length;

    DOCUMENTATION_FIELDS.forEach(field => {
      if (getFieldValue(userId, field.key)) {
        complete++;
      }
    });

    return { complete, total, percentage: Math.round((complete / total) * 100) };
  };

  const getCategoryCompletionForUser = (userId: string, category: string) => {
    const categoryFields = DOCUMENTATION_FIELDS.filter(f => f.category === category);
    let complete = 0;
    categoryFields.forEach(field => {
      if (getFieldValue(userId, field.key)) complete++;
    });
    return { complete, total: categoryFields.length };
  };

  const getFieldsByCategory = () => {
    const categories: Record<string, DocumentationField[]> = {};
    DOCUMENTATION_FIELDS.forEach(field => {
      if (!categories[field.category]) {
        categories[field.category] = [];
      }
      categories[field.category].push(field);
    });
    return categories;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const fieldsByCategory = getFieldsByCategory();
  const categoryOrder = ['hr', 'personal', 'id', 'bank', 'emergency'];

  // Calculate overall stats
  const totalGaps = userProfiles.reduce((acc, user) => {
    const stats = getStaffCompletionStats(user.user_id);
    return acc + (stats.total - stats.complete);
  }, 0);

  const usersWithGaps = userProfiles.filter(user => {
    const stats = getStaffCompletionStats(user.user_id);
    return stats.complete < stats.total;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Documentation Matrix</h3>
          <p className="text-sm text-muted-foreground">
            Overview of all staff documentation status
          </p>
        </div>
        <div className="flex items-center gap-4">
          {usersWithGaps > 0 ? (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {usersWithGaps} staff with gaps
            </Badge>
          ) : (
            <Badge variant="default" className="flex items-center gap-1 bg-green-600">
              <CheckCircle2 className="h-3 w-3" />
              All complete
            </Badge>
          )}
          <Badge variant="outline">
            {totalGaps} missing items
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-background z-20">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium sticky left-0 bg-background z-30 min-w-[200px]">
                      Staff Member
                    </th>
                    <th className="text-center p-3 font-medium min-w-[80px]">
                      Progress
                    </th>
                    {categoryOrder.map(category => (
                      <th 
                        key={category} 
                        colSpan={fieldsByCategory[category]?.length || 0}
                        className="text-center p-2 font-medium border-l bg-muted/50"
                      >
                        <span className="text-xs">{CATEGORY_LABELS[category]}</span>
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b bg-muted/30">
                    <th className="sticky left-0 bg-muted/30 z-30"></th>
                    <th></th>
                    {categoryOrder.flatMap(category =>
                      (fieldsByCategory[category] || []).map((field, idx) => (
                        <th 
                          key={field.key} 
                          className={`text-center p-2 min-w-[40px] ${idx === 0 ? 'border-l' : ''}`}
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="flex items-center justify-center">
                                  {field.icon}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{field.label}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {userProfiles.map(user => {
                    const stats = getStaffCompletionStats(user.user_id);
                    const hrProfile = getHRProfile(user.user_id);
                    
                    return (
                      <tr key={user.user_id} className="border-b hover:bg-muted/50">
                        <td className="p-3 sticky left-0 bg-background z-10">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {user.display_name || 'No name'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                            {hrProfile && (
                              <Badge 
                                variant="outline" 
                                className="text-xs mt-1 w-fit"
                              >
                                {hrProfile.employment_status.replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div 
                              className={`text-sm font-medium ${
                                stats.percentage === 100 
                                  ? 'text-green-600' 
                                  : stats.percentage >= 50 
                                    ? 'text-amber-600' 
                                    : 'text-red-600'
                              }`}
                            >
                              {stats.percentage}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {stats.complete}/{stats.total}
                            </div>
                          </div>
                        </td>
                        {categoryOrder.flatMap(category =>
                          (fieldsByCategory[category] || []).map((field, idx) => {
                            const hasValue = getFieldValue(user.user_id, field.key);
                            return (
                              <td 
                                key={`${user.user_id}-${field.key}`}
                                className={`text-center p-2 ${idx === 0 ? 'border-l' : ''}`}
                              >
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      {hasValue ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {field.label}: {hasValue ? 'Complete' : 'Missing'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-400" />
          <span>Missing</span>
        </div>
      </div>
    </div>
  );
}