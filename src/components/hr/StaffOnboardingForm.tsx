import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, CheckCircle2, AlertCircle, FileText, User } from "lucide-react";
import { format } from "date-fns";
import { normalizePhotoFile } from "@/lib/photoUpload";

type FileField =
  | "proof_of_id_1_path"
  | "proof_of_id_2_path"
  | "proof_of_address_path"
  | "photograph_path";

interface OnboardingFormData {
  id?: string;
  employment_start_date: string;
  full_name: string;
  date_of_birth: string;
  phone_number: string;
  personal_email: string;
  address: string;
  proof_of_id_1_path: string;
  proof_of_id_1_type: string;
  proof_of_id_2_path: string;
  proof_of_id_2_type: string;
  proof_of_address_path: string;
  proof_of_address_type: string;
  photograph_path: string;
  bank_name: string;
  account_number: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  emergency_contact_email: string;
  form_status: string;
}

const ID_TYPES = [
  "National Identification Number (NIN) Slip or National ID Card",
  "International Passport",
  "Permanent Voter's Card (PVC)",
  "Driver's License",
  "Birth Certificate",
];

const ADDRESS_PROOF_TYPES = [
  "Utility Bill (Electricity, Water, or Refuse - within last 3 months)",
  "Tenancy/Lease Agreement",
  "Bank/Credit Card Statement",
  "Affidavit of Residency",
  "Official Letter (Employer, Public Authority, or Educational Institution)",
  "Driver's License",
  "Voter Registration Card",
];

/** Formats the browser can actually paint into an <img>. HEIC is excluded on
 *  purpose: iPhones produce it by default and no major browser renders it. */
const DISPLAYABLE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Returns a human explanation if this file can't be used as a profile photo, or
 * null if it's fine. The decode check is the important half — extension and MIME
 * type can both be right on a file that's still corrupt, which is how a 0-byte
 * "jpeg" got stored and rendered as a blank avatar.
 */
async function describePhotoProblem(file: File): Promise<string | null> {
  const looksDisplayable = DISPLAYABLE_PHOTO_TYPES.includes(file.type.toLowerCase());
  if (!looksDisplayable) {
    const kind = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
      ? "iPhone HEIC photos can't be shown by web browsers"
      : file.type === "application/pdf" || /\.pdf$/i.test(file.name)
        ? "PDFs can't be used as a profile photo"
        : "That file type can't be used as a profile photo";
    return `${kind}. Please upload a JPG or PNG — on an iPhone, Settings → Camera → Formats → Most Compatible saves photos as JPG.`;
  }
  if (file.size > 8 * 1024 * 1024) return "That image is over 8MB — please upload a smaller one.";

  // Prove it actually decodes rather than trusting the file's own labelling.
  const ok = await new Promise<boolean>(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth > 0); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
  return ok ? null : "That image couldn't be opened — it may be damaged. Please try another.";
}

export function StaffOnboardingForm() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  // Snapshot of the stored row, used to work out which details a save changed.
  const savedRef = useRef<Record<string, unknown>>({});
  const [formData, setFormData] = useState<OnboardingFormData>({
    employment_start_date: "",
    full_name: "",
    date_of_birth: "",
    phone_number: "",
    personal_email: "",
    address: "",
    proof_of_id_1_path: "",
    proof_of_id_1_type: "",
    proof_of_id_2_path: "",
    proof_of_id_2_type: "",
    proof_of_address_path: "",
    proof_of_address_type: "",
    photograph_path: "",
    bank_name: "",
    account_number: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
    emergency_contact_email: "",
    form_status: "incomplete",
  });

  useEffect(() => {
    if (user) {
      fetchOnboardingData();
    }
  }, [user]);

  const fetchOnboardingData = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("staff_onboarding_documents")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Remember what was on file, so a save can report which details actually
        // moved rather than listing every field on the form.
        savedRef.current = data as Record<string, unknown>;
        setFormData({
          id: data.id,
          employment_start_date: data.employment_start_date || "",
          full_name: data.full_name || "",
          date_of_birth: data.date_of_birth || "",
          phone_number: data.phone_number || "",
          personal_email: data.personal_email || "",
          address: data.address || "",
          proof_of_id_1_path: data.proof_of_id_1_path || "",
          proof_of_id_1_type: data.proof_of_id_1_type || "",
          proof_of_id_2_path: data.proof_of_id_2_path || "",
          proof_of_id_2_type: data.proof_of_id_2_type || "",
          proof_of_address_path: (data as any).proof_of_address_path || "",
          proof_of_address_type: (data as any).proof_of_address_type || "",
          photograph_path: data.photograph_path || "",
          bank_name: data.bank_name || "",
          account_number: data.account_number || "",
          emergency_contact_name: data.emergency_contact_name || "",
          emergency_contact_relationship: data.emergency_contact_relationship || "",
          emergency_contact_phone: data.emergency_contact_phone || "",
          emergency_contact_email: data.emergency_contact_email || "",
          form_status: data.form_status || "incomplete",
        });
      }
    } catch (error) {
      console.error("Error fetching onboarding data:", error);
      toast.error("Failed to load onboarding data");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof OnboardingFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: FileField
  ) => {
    const input = e.target;
    const rawFile = input.files?.[0];
    if (!rawFile || !user) return;

    // iPhone HEIC photographs convert to JPEG in the browser rather than being
    // rejected — the validator below still guards PDFs and corrupt files.
    let file = rawFile;
    if (field === "photograph_path") {
      try {
        file = await normalizePhotoFile(rawFile);
      } catch (convErr) {
        console.error("HEIC conversion failed:", convErr);
      }
    }

    // Reject anything unusable before it reaches storage. Photographs have to be
    // displayable in a browser, and people were uploading PDFs and iPhone HEICs
    // that saved cleanly and then showed as blank avatars with no clue why.
    if (file.size === 0) {
      toast.error("That file is empty — please choose another.");
      input.value = "";
      return;
    }
    if (field === "photograph_path") {
      const problem = await describePhotoProblem(file);
      if (problem) {
        toast.error(problem);
        input.value = "";
        return;
      }
    }

    setUploading(field);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${field}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("onboarding-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Record the path straight away. Holding it only in local state meant a tab
      // switch, reload or navigation before pressing Save silently discarded it —
      // the file sat in storage but the record showed nothing attached.
      const { data: saved, error: saveError } = await supabase
        .from("staff_onboarding_documents")
        .upsert(
          { user_id: user.id, [field]: fileName },
          { onConflict: "user_id" }
        )
        .select("id")
        .single();

      if (saveError) throw saveError;

      setFormData((prev) => ({
        ...prev,
        [field]: fileName,
        id: prev.id || saved?.id,
      }));
      toast.success("File attached and saved");
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to attach file — please try again");
    } finally {
      setUploading(null);
      // Let the same file be re-selected if the attempt failed.
      input.value = "";
    }
  };

  const viewFile = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("onboarding-documents")
        .createSignedUrl(path, 300);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("No signed URL returned");

      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error("Error opening file:", error);
      toast.error("Could not open the file");
    }
  };

  const calculateProgress = () => {
    const requiredFields = [
      "employment_start_date",
      "full_name",
      "date_of_birth",
      "phone_number",
      "personal_email",
      "address",
      "proof_of_id_1_path",
      "proof_of_id_1_type",
      "proof_of_id_2_path",
      "proof_of_id_2_type",
      "proof_of_address_path",
      "proof_of_address_type",
      "photograph_path",
      "bank_name",
      "account_number",
      "emergency_contact_name",
      "emergency_contact_relationship",
      "emergency_contact_phone",
      "emergency_contact_email",
    ];

    const filledFields = requiredFields.filter(
      (field) => formData[field as keyof OnboardingFormData]
    );

    return Math.round((filledFields.length / requiredFields.length) * 100);
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);

    try {
      const progress = calculateProgress();
      const formStatus = progress === 100 ? "complete" : "incomplete";

      const dataToSave = {
        user_id: user.id,
        employment_start_date: formData.employment_start_date || null,
        full_name: formData.full_name || null,
        date_of_birth: formData.date_of_birth || null,
        phone_number: formData.phone_number || null,
        personal_email: formData.personal_email || null,
        address: formData.address || null,
        proof_of_id_1_path: formData.proof_of_id_1_path || null,
        proof_of_id_1_type: formData.proof_of_id_1_type || null,
        proof_of_id_2_path: formData.proof_of_id_2_path || null,
        proof_of_id_2_type: formData.proof_of_id_2_type || null,
        proof_of_address_path: formData.proof_of_address_path || null,
        proof_of_address_type: formData.proof_of_address_type || null,
        photograph_path: formData.photograph_path || null,
        bank_name: formData.bank_name || null,
        account_number: formData.account_number || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_relationship: formData.emergency_contact_relationship || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
        emergency_contact_email: formData.emergency_contact_email || null,
        form_status: formStatus,
        submitted_at: progress === 100 ? new Date().toISOString() : null,
      };

      if (formData.id) {
        const { error } = await supabase
          .from("staff_onboarding_documents")
          .update(dataToSave)
          .eq("id", formData.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("staff_onboarding_documents")
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setFormData((prev) => ({ ...prev, id: data.id, form_status: formStatus }));
        }
      }

      // Confirm the change to whoever's record it is, and alert admins if the
      // pay account moved. Bank details live here as well as in the contractor
      // invoice form, so this copy needs the same fraud control. Fire-and-forget:
      // a mail problem must never make a successful save look failed.
      const before = savedRef.current;
      const changedFields = Object.keys(dataToSave).filter((key) => {
        if (key === "user_id" || key === "form_status" || key === "submitted_at") return false;
        const was = before?.[key] ?? null;
        const now = (dataToSave as Record<string, unknown>)[key] ?? null;
        return (was ?? "") !== (now ?? "");
      });
      if (changedFields.length > 0) {
        supabase.functions
          .invoke("notify-personal-change", {
            body: { kind: "profile_update", userId: user.id, changedFields },
          })
          .catch((err) => console.error("Failed to notify of profile update:", err));
      }
      savedRef.current = { ...before, ...dataToSave };

      setFormData((prev) => ({ ...prev, form_status: formStatus }));
      toast.success(progress === 100 ? "Onboarding form submitted!" : "Progress saved");
    } catch (error) {
      console.error("Error saving onboarding data:", error);
      toast.error("Failed to save onboarding data");
    } finally {
      setSaving(false);
    }
  };

  const renderFieldStatus = (field: keyof OnboardingFormData) => {
    const value = formData[field];
    if (value) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  const renderFileUpload = (field: FileField, label: string) => {
    const isUploading = uploading === field;
    // A photograph must be displayable; ID and proof-of-address docs are
    // routinely PDFs, so only narrow the picker for the photo field.
    const accept = field === "photograph_path" ? "image/jpeg,image/png,image/webp" : "image/*,.pdf";
    const path = formData[field];
    const hasFile = !!path;
    const fileType = hasFile ? (path.split(".").pop() || "").toUpperCase() : "";

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{label}</Label>
          {renderFieldStatus(field)}
        </div>
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            hasFile ? "border-green-300 bg-green-50" : "border-border hover:border-primary"
          }`}
        >
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground">Uploading...</span>
            </div>
          ) : hasFile ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-green-500" />
              <span className="text-sm text-green-700">
                {fileType ? `${fileType} attached` : "File attached"}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => viewFile(path)}
                  className="text-xs text-primary hover:underline"
                >
                  View file
                </button>
                <label className="cursor-pointer text-xs text-primary hover:underline">
                  <input
                    type="file"
                    className="hidden"
                    accept={accept}
                    onChange={(e) => handleFileUpload(e, field)}
                  />
                  Replace file
                </label>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Drop files here or{" "}
                <span className="text-primary hover:underline">browse</span>
              </span>
              <input
                type="file"
                className="hidden"
                accept={accept}
                onChange={(e) => handleFileUpload(e, field)}
              />
            </label>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progress = calculateProgress();

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Onboarding Form
              </CardTitle>
              <CardDescription>
                Complete all sections to finish your onboarding
              </CardDescription>
            </div>
            <Badge
              variant={
                formData.form_status === "complete" ? "default" : "secondary"
              }
            >
              {formData.form_status === "complete" ? "Complete" : "In Progress"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        </CardContent>
      </Card>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Employment Start Date</Label>
                {renderFieldStatus("employment_start_date")}
              </div>
              <p className="text-xs text-muted-foreground">
                Please confirm the date your employment with Care Cuddle started
              </p>
              <Input
                type="date"
                value={formData.employment_start_date}
                onChange={(e) =>
                  handleInputChange("employment_start_date", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Your Name</Label>
                {renderFieldStatus("full_name")}
              </div>
              <Input
                placeholder="Full name"
                value={formData.full_name}
                onChange={(e) => handleInputChange("full_name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Date of Birth</Label>
                {renderFieldStatus("date_of_birth")}
              </div>
              <Input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) =>
                  handleInputChange("date_of_birth", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Phone Number</Label>
                {renderFieldStatus("phone_number")}
              </div>
              <Input
                placeholder="Phone number"
                value={formData.phone_number}
                onChange={(e) =>
                  handleInputChange("phone_number", e.target.value)
                }
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Personal Email</Label>
                {renderFieldStatus("personal_email")}
              </div>
              <Input
                type="email"
                placeholder="Personal email address"
                value={formData.personal_email}
                onChange={(e) =>
                  handleInputChange("personal_email", e.target.value)
                }
              />
            </div>
          </div>

          <Separator />

          {/* Proof of ID */}
          <div className="space-y-4">
            <div>
              <h4 className="font-medium">Proof of ID</h4>
              <p className="text-sm text-muted-foreground">
                Please provide <strong>two forms of identification</strong> from
                the list below. This is to verify your identity and ensure
                compliance with our recruitment policies. Attach clear copies of
                the selected IDs to this form.
              </p>
              <div className="mt-2 text-sm text-muted-foreground">
                <p className="font-medium">
                  Accepted Forms of Identification (Please select and attach any
                  two):
                </p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  {ID_TYPES.map((type, index) => (
                    <li key={index}>{type}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>First ID Type</Label>
                  {renderFieldStatus("proof_of_id_1_type")}
                </div>
                <Select
                  value={formData.proof_of_id_1_type}
                  onValueChange={(value) =>
                    handleInputChange("proof_of_id_1_type", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {renderFileUpload("proof_of_id_1_path", "First ID Document")}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Second ID Type</Label>
                  {renderFieldStatus("proof_of_id_2_type")}
                </div>
                <Select
                  value={formData.proof_of_id_2_type}
                  onValueChange={(value) =>
                    handleInputChange("proof_of_id_2_type", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {renderFileUpload("proof_of_id_2_path", "Second ID Document")}
              </div>
            </div>
          </div>

          <Separator />

          {/* Address */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Address</Label>
              {renderFieldStatus("address")}
            </div>
            <p className="text-xs text-muted-foreground">
              Please provide your full residential address below. Ensure all
              details are accurate and complete.
            </p>
            <Textarea
              placeholder="Full residential address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              rows={3}
            />
          </div>

          <Separator />

          {/* Proof of Address */}
          <div className="space-y-4">
            <div>
              <h4 className="font-medium">Proof of Address</h4>
              <p className="text-sm text-muted-foreground">
                Please provide a proof of address from the list below, this is to verify your location and ensure compliance with our recruitment policies. Please attach clear copies of any of the below:
              </p>
              <div className="mt-2 text-sm text-muted-foreground">
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>Utility Bills:</strong> Electricity (PHCN bill), water bill, or refuse disposal bill, usually required to be recent (e.g., within the last three months).</li>
                  <li><strong>Tenancy/Lease Agreement:</strong> A signed rental or mortgage agreement for the current residence.</li>
                  <li><strong>Bank/Credit Card Statement:</strong> A recent bank or credit card statement showing your name and address.</li>
                  <li><strong>Affidavit of Residency:</strong> A sworn, legally binding statement confirmed by a Commissioner for Oaths or Notary Public, often used when standard bills are unavailable.</li>
                  <li><strong>Official Letters:</strong> Letters from an employer, a public authority, or a recognized educational institution.</li>
                  <li><strong>Government-issued IDs (in some cases):</strong> A valid driver's license can sometimes serve as both proof of ID and address.</li>
                  <li><strong>Voter Registration Card.</strong></li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Proof of Address Type</Label>
                  {renderFieldStatus("proof_of_address_type")}
                </div>
                <Select
                  value={formData.proof_of_address_type}
                  onValueChange={(value) =>
                    handleInputChange("proof_of_address_type", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select proof of address type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADDRESS_PROOF_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderFileUpload("proof_of_address_path", "Proof of Address Document")}
            </div>
          </div>

          <Separator />

          {/* Photograph */}
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Please provide a clear photograph of yourself
            </p>
            {renderFileUpload("photograph_path", "Photograph")}
          </div>
        </CardContent>
      </Card>

      {/* Payroll */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll</CardTitle>
          <CardDescription>
            Please be informed that staff salaries are paid on the{" "}
            <strong>1st of each month</strong>. To ensure timely and accurate
            payment, kindly check that your bank details are correct and
            up-to-date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Name of Bank</Label>
                {renderFieldStatus("bank_name")}
              </div>
              <Input
                placeholder="Bank name"
                value={formData.bank_name}
                onChange={(e) => handleInputChange("bank_name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Account Number</Label>
                {renderFieldStatus("account_number")}
              </div>
              <Input
                placeholder="Account number"
                value={formData.account_number}
                onChange={(e) =>
                  handleInputChange("account_number", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Emergency Contact</CardTitle>
          <CardDescription>
            In case of an emergency, it is important for us to have contact
            information for someone who can be reached promptly. Please provide
            the details of your emergency contact below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Emergency Contact Name</Label>
                {renderFieldStatus("emergency_contact_name")}
              </div>
              <Input
                placeholder="Contact name"
                value={formData.emergency_contact_name}
                onChange={(e) =>
                  handleInputChange("emergency_contact_name", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Emergency Contact Relationship</Label>
                {renderFieldStatus("emergency_contact_relationship")}
              </div>
              <Input
                placeholder="e.g., Parent, Spouse, Sibling"
                value={formData.emergency_contact_relationship}
                onChange={(e) =>
                  handleInputChange(
                    "emergency_contact_relationship",
                    e.target.value
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Emergency Contact Phone Number</Label>
                {renderFieldStatus("emergency_contact_phone")}
              </div>
              <Input
                placeholder="Phone number"
                value={formData.emergency_contact_phone}
                onChange={(e) =>
                  handleInputChange("emergency_contact_phone", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Emergency Contact Email</Label>
                {renderFieldStatus("emergency_contact_email")}
              </div>
              <Input
                type="email"
                placeholder="Email address"
                value={formData.emergency_contact_email}
                onChange={(e) =>
                  handleInputChange("emergency_contact_email", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : progress === 100 ? (
            "Submit Form"
          ) : (
            "Save Progress"
          )}
        </Button>
      </div>
    </div>
  );
}
