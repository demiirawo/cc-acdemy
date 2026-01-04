import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Clock, FileText, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";

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
  base_currency: string;
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
  category: string;
  type: 'text' | 'date' | 'currency' | 'file';
}

const DOCUMENTATION_FIELDS: DocumentationField[] = [
  // HR Profile fields
  { key: 'employee_id', label: 'Employee ID', category: 'HR Profile', type: 'text' },
  { key: 'job_title', label: 'Job Title', category: 'HR Profile', type: 'text' },
  { key: 'start_date', label: 'Start Date', category: 'HR Profile', type: 'date' },
  { key: 'base_salary', label: 'Base Salary', category: 'HR Profile', type: 'currency' },
  
  // Personal Details
  { key: 'full_name', label: 'Full Name', category: 'Personal Details', type: 'text' },
  { key: 'date_of_birth', label: 'Date of Birth', category: 'Personal Details', type: 'date' },
  { key: 'phone_number', label: 'Phone Number', category: 'Personal Details', type: 'text' },
  { key: 'personal_email', label: 'Personal Email', category: 'Personal Details', type: 'text' },
  { key: 'address', label: 'Address', category: 'Personal Details', type: 'text' },
  { key: 'photograph_path', label: 'Photograph', category: 'Personal Details', type: 'file' },
  
  // ID Documents
  { key: 'proof_of_id_1', label: 'ID Document 1', category: 'ID Documents', type: 'file' },
  { key: 'proof_of_id_2', label: 'ID Document 2', category: 'ID Documents', type: 'file' },
  
  // Bank Details
  { key: 'bank_name', label: 'Bank Name', category: 'Bank Details', type: 'text' },
  { key: 'account_number', label: 'Account Number', category: 'Bank Details', type: 'text' },
  
  // Emergency Contact
  { key: 'emergency_contact_name', label: 'Emergency Contact Name', category: 'Emergency Contact', type: 'text' },
  { key: 'emergency_contact_relationship', label: 'Relationship', category: 'Emergency Contact', type: 'text' },
  { key: 'emergency_contact_phone', label: 'Emergency Phone', category: 'Emergency Contact', type: 'text' },
  { key: 'emergency_contact_email', label: 'Emergency Email', category: 'Emergency Contact', type: 'text' },
];

const CATEGORY_ORDER = [
  'HR Profile',
  'Personal Details',
  'ID Documents',
  'Bank Details',
  'Emergency Contact'
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  'GBP': '£',
  'USD': '$',
  'EUR': '€',
  'INR': '₹',
  'AED': 'د.إ',
  'AUD': 'A$',
  'CAD': 'C$',
  'PHP': '₱',
  'ZAR': 'R',
  'NGN': '₦',
};

export function StaffDocumentationMatrix() {
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [onboardingDocs, setOnboardingDocs] = useState<OnboardingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
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
        .select('user_id, employee_id, job_title, start_date, base_salary, base_currency, employment_status');

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

  const getFileUrl = (filePath: string | null): string | null => {
    if (!filePath) return null;
    const { data } = supabase.storage.from('onboarding-documents').getPublicUrl(filePath);
    return data?.publicUrl || null;
  };

  const getFieldDisplayValue = (userId: string, field: DocumentationField): { value: string | null; filePath?: string | null; fileType?: string | null } => {
    const hrProfile = getHRProfile(userId);
    const onboardingDoc = getOnboardingDoc(userId);

    // HR Profile fields
    if (field.key === 'employee_id') return { value: hrProfile?.employee_id || null };
    if (field.key === 'job_title') return { value: hrProfile?.job_title || null };
    if (field.key === 'start_date') {
      if (hrProfile?.start_date) {
        try {
          return { value: format(new Date(hrProfile.start_date), 'dd MMM yyyy') };
        } catch {
          return { value: hrProfile.start_date };
        }
      }
      return { value: null };
    }
    if (field.key === 'base_salary') {
      if (hrProfile?.base_salary) {
        const symbol = CURRENCY_SYMBOLS[hrProfile.base_currency] || hrProfile.base_currency;
        return { value: `${symbol}${hrProfile.base_salary.toLocaleString()}` };
      }
      return { value: null };
    }

    // Onboarding document fields
    if (!onboardingDoc) return { value: null };

    // File fields
    if (field.key === 'photograph_path') {
      return { 
        value: onboardingDoc.photograph_path ? 'Uploaded' : null, 
        filePath: onboardingDoc.photograph_path,
        fileType: 'image'
      };
    }
    if (field.key === 'proof_of_id_1') {
      return { 
        value: onboardingDoc.proof_of_id_1_type || null, 
        filePath: onboardingDoc.proof_of_id_1_path,
        fileType: onboardingDoc.proof_of_id_1_path?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'document'
      };
    }
    if (field.key === 'proof_of_id_2') {
      return { 
        value: onboardingDoc.proof_of_id_2_type || null, 
        filePath: onboardingDoc.proof_of_id_2_path,
        fileType: onboardingDoc.proof_of_id_2_path?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'document'
      };
    }

    // Date fields
    if (field.key === 'date_of_birth' && onboardingDoc.date_of_birth) {
      try {
        return { value: format(new Date(onboardingDoc.date_of_birth), 'dd MMM yyyy') };
      } catch {
        return { value: onboardingDoc.date_of_birth };
      }
    }

    // Text fields
    const textValue = onboardingDoc[field.key as keyof OnboardingDocument];
    return { value: typeof textValue === 'string' ? textValue : null };
  };

  const hasFieldValue = (userId: string, fieldKey: string): boolean => {
    const hrProfile = getHRProfile(userId);
    const onboardingDoc = getOnboardingDoc(userId);

    if (fieldKey === 'employee_id') return !!hrProfile?.employee_id;
    if (fieldKey === 'job_title') return !!hrProfile?.job_title;
    if (fieldKey === 'start_date') return !!hrProfile?.start_date;
    if (fieldKey === 'base_salary') return !!hrProfile?.base_salary;

    if (fieldKey === 'proof_of_id_1') {
      return !!(onboardingDoc?.proof_of_id_1_path && onboardingDoc?.proof_of_id_1_type);
    }
    if (fieldKey === 'proof_of_id_2') {
      return !!(onboardingDoc?.proof_of_id_2_path && onboardingDoc?.proof_of_id_2_type);
    }

    if (onboardingDoc) {
      const value = onboardingDoc[fieldKey as keyof OnboardingDocument];
      return !!value;
    }

    return false;
  };

  const getCompletionStats = (userId: string): { completed: number; total: number } => {
    let completed = 0;
    DOCUMENTATION_FIELDS.forEach(field => {
      if (hasFieldValue(userId, field.key)) {
        completed++;
      }
    });
    return { completed, total: DOCUMENTATION_FIELDS.length };
  };

  const handleFileClick = (filePath: string | null, title: string) => {
    if (!filePath) return;
    const url = getFileUrl(filePath);
    if (url) {
      setPreviewImage(url);
      setPreviewTitle(title);
    }
  };

  // Group fields by category
  const fieldsByCategory = DOCUMENTATION_FIELDS.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, DocumentationField[]>);

  const orderedCategories = CATEGORY_ORDER.filter(cat => fieldsByCategory[cat] && fieldsByCategory[cat].length > 0);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (userProfiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No staff members found.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Staff Documentation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-background z-10 p-3 text-left font-medium border-b border-r min-w-[200px]">
                      Documentation Item
                    </th>
                    {userProfiles.map((member) => (
                      <th
                        key={member.user_id}
                        className="p-3 text-center font-medium border-b min-w-[140px]"
                        title={member.display_name || member.email || 'Unknown'}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground truncate max-w-[130px]">
                            {member.display_name || member.email || 'Unknown'}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedCategories.map((categoryName) => (
                    <>
                      {/* Category header row */}
                      <tr key={`category-${categoryName}`} className="bg-muted/50">
                        <td 
                          colSpan={userProfiles.length + 1} 
                          className="sticky left-0 p-2 font-semibold text-sm text-primary border-b"
                        >
                          {categoryName}
                        </td>
                      </tr>
                      {/* Fields within this category */}
                      {fieldsByCategory[categoryName].map((field, fieldIndex) => (
                        <tr key={field.key} className="hover:bg-muted/30">
                          <td className="sticky left-0 bg-background z-10 p-3 border-b border-r">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground w-6">
                                {fieldIndex + 1}.
                              </span>
                              <span className="text-sm">{field.label}</span>
                            </div>
                          </td>
                          {userProfiles.map((member) => {
                            const displayData = getFieldDisplayValue(member.user_id, field);
                            const hasValue = !!displayData.value || !!displayData.filePath;
                            
                            return (
                              <td key={member.user_id} className="p-2 text-center border-b">
                                {hasValue ? (
                                  field.type === 'file' && displayData.filePath ? (
                                    <button
                                      onClick={() => handleFileClick(displayData.filePath!, `${member.display_name} - ${field.label}`)}
                                      className="inline-flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
                                    >
                                      {displayData.fileType === 'image' ? (
                                        <div className="w-10 h-10 rounded overflow-hidden border bg-muted">
                                          <img 
                                            src={getFileUrl(displayData.filePath) || ''} 
                                            alt={field.label}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = 'none';
                                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                          />
                                          <div className="hidden w-full h-full flex items-center justify-center">
                                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                                          <FileText className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      )}
                                      {displayData.value && displayData.value !== 'Uploaded' && (
                                        <span className="text-[10px] text-muted-foreground max-w-[120px] truncate">
                                          {displayData.value}
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30">
                                        <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                                      </div>
                                      <span className="text-xs text-foreground max-w-[120px] truncate" title={displayData.value || ''}>
                                        {displayData.value}
                                      </span>
                                    </div>
                                  )
                                ) : (
                                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                  {/* Progress summary row */}
                  <tr className="bg-muted/30 font-medium">
                    <td className="sticky left-0 bg-background z-10 p-3 border-t-2 border-r font-semibold">
                      Total Progress
                    </td>
                    {userProfiles.map((member) => {
                      const stats = getCompletionStats(member.user_id);
                      const progressPercent = DOCUMENTATION_FIELDS.length > 0 
                        ? Math.round((stats.completed / stats.total) * 100) 
                        : 0;

                      return (
                        <td key={member.user_id} className="p-3 text-center border-t-2">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {stats.completed}/{stats.total}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {previewImage && (
              <img 
                src={previewImage} 
                alt={previewTitle}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}