"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";

import { AuthAlert } from "@/components/AuthAlert";
import { AuthCampusFields, AuthProfileIdentityFields, AuthProfileDetailsState } from "@/components/AuthProfileFormFields";
import { AuthSection } from "@/components/AuthSection";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";
import { normalizePhoneNumber, validateRequiredPhoneNumber } from "@/lib/phone";
import { formatOwnerVehiclePlateInput, validateOwnerVehiclePlate } from "@/lib/vehiclePlate";
import { checkAuthEmailStatus, normalizeInstitutionalEmail } from "@/lib/authEmail";

type ProfileFormState = AuthProfileDetailsState;
type CompleteFieldErrors = Partial<Record<keyof ProfileFormState, string>>;

const COMPLETE_STEPS = [
  { label: "Profile", detail: "Basic details" },
  { label: "Campus", detail: "Stay and vehicle" },
];

const initialFormState: ProfileFormState = {
  userType: "Student",
  firstName: "",
  lastName: "",
  usn: "",
  batch: "",
  year: "",
  phone: "",
  role: "Day Scholar",
  campus: "South Campus",
  hostelName: "NIE North Boys Hostel",
  roomNo: "",
  hasVehicle: "No",
  vehicleNo: "",
};

function isVehicleAlreadyRegisteredError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("vehicle");
}

function isDuplicateProfilePrimaryKeyError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("profiles_pkey");
}

export default function CompleteProfilePage() {
  const router = useRouter();

  const [formData, setFormData] = useState<ProfileFormState>(initialFormState);
  const [accountEmail, setAccountEmail] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CompleteFieldErrors>({});
  const [error, setError] = useState("");
  const [isUserTypeLocked, setIsUserTypeLocked] = useState(false);
  const [isUsnLocked, setIsUsnLocked] = useState(false);

  useEffect(() => {
    const hydrateExistingProfile = async () => {
      const supabase = createClient();
      const { user } = await resolveClientUser(supabase);

      if (!user) {
        router.replace("/login");
        return;
      }

      const normalizedEmail = normalizeInstitutionalEmail(user.email || "");
      setAccountEmail(normalizedEmail);

      try {
        const emailStatus = await checkAuthEmailStatus(normalizedEmail);
        if (!emailStatus.domainAllowed || emailStatus.blocked) {
          await supabase.auth.signOut({ scope: "local" });
          const nextError = emailStatus.blocked ? "blocked-group" : "invalid-domain";
          router.replace(`/login?error=${nextError}`);
          return;
        }
      } catch {
        setError("Unable to verify this account right now. Please try again.");
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name, user_type, usn, batch, year_of_study, phone, role, campus, hostel_name, room_no, has_vehicle, vehicle_no")
        .eq("id", user.id)
        .maybeSingle();

      if (existingProfile) {
        const userType = existingProfile.user_type || (existingProfile.role === "Faculty" ? "Faculty" : "Student");

        setIsUserTypeLocked(Boolean(String(existingProfile.user_type || "").trim()));
        setIsUsnLocked(Boolean(String(existingProfile.usn || "").trim()));
        setFormData({
          userType,
          firstName: existingProfile.first_name || "",
          lastName: existingProfile.last_name || "",
          usn: existingProfile.usn || "",
          batch: existingProfile.batch || "",
          year: existingProfile.year_of_study || "",
          phone: existingProfile.phone || "",
          role: userType === "Faculty" ? "Faculty" : existingProfile.role || "Day Scholar",
          campus: existingProfile.campus || "South Campus",
          hostelName: existingProfile.hostel_name || "NIE North Boys Hostel",
          roomNo: existingProfile.room_no || "",
          hasVehicle: existingProfile.has_vehicle ? "Yes" : "No",
          vehicleNo: existingProfile.vehicle_no || "",
        });
      }

      setIsBootstrapping(false);
    };

    void hydrateExistingProfile();
  }, [router]);

  const stepMeta = useMemo(() => {
    if (currentStep === 1) {
      return {
        title: "Profile",
        description: "Add your basic details.",
      };
    }

    return {
      title: "Campus",
      description: "Add your campus and vehicle details.",
    };
  }, [currentStep]);

  const clearMessages = () => {
    setError("");
    setFieldErrors({});
  };

  const handleUseDifferentAccount = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setError("");

    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
      window.location.assign("/login?session=logged-out");
    } catch (signOutError: any) {
      setError(signOutError.message || "Unable to sign out right now. Please try again.");
      setIsSigningOut(false);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    const nextValue = name === "vehicleNo" ? formatOwnerVehiclePlateInput(value) : value;
    setFormData((current) => ({ ...current, [name]: nextValue }));
    clearMessages();
  };

  const handleUserTypeChange = (userType: "Student" | "Faculty") => {
    if (isUserTypeLocked) return;

    setFormData((current) => {
      if (userType === "Faculty") {
        return {
          ...current,
          userType,
          usn: "",
          batch: "",
          year: "",
          role: "Faculty",
          hostelName: "NIE North Boys Hostel",
          roomNo: "",
        };
      }

      return {
        ...current,
        userType,
        role: current.role === "Faculty" ? "Day Scholar" : current.role,
      };
    });
    clearMessages();
  };

  const validateProfileStep = () => {
    const errors: CompleteFieldErrors = {};

    if (!formData.firstName.trim()) errors.firstName = "Enter your first name.";
    if (!formData.lastName.trim()) errors.lastName = "Enter your last name.";

    const { error: phoneError } = validateRequiredPhoneNumber(formData.phone);
    if (phoneError) errors.phone = phoneError;

    if (formData.userType === "Student") {
      if (!formData.usn.trim()) errors.usn = "USN is required for students.";
      if (!formData.batch) errors.batch = "Select your batch or branch.";
      if (!formData.year) errors.year = "Select your current year.";
    }

    return errors;
  };

  const validateCampusStep = () => {
    const errors: CompleteFieldErrors = {};
    const vehicleValidation =
      formData.hasVehicle === "Yes"
        ? validateOwnerVehiclePlate(formData.vehicleNo, { required: true })
        : { plate: "", error: "" };

    if (formData.userType === "Student" && formData.role === "Hostelite") {
      if (!formData.roomNo.trim()) errors.roomNo = "Enter your hostel room number.";
    } else if (!formData.campus) {
      errors.campus = "Select your primary campus.";
    }

    if (vehicleValidation.error) {
      errors.vehicleNo = vehicleValidation.error;
    }

    return {
      errors,
      normalizedVehicle: vehicleValidation.plate,
    };
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    if (currentStep === 1) {
      const errors = validateProfileStep();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setCurrentStep(2);
      return;
    }

    const profileErrors = validateProfileStep();
    const { errors: campusErrors, normalizedVehicle } = validateCampusStep();
    const { normalizedPhone, error: phoneError } = validateRequiredPhoneNumber(formData.phone);

    if (phoneError) {
      profileErrors.phone = phoneError;
    }

    const combinedErrors = { ...profileErrors, ...campusErrors };
    if (Object.keys(combinedErrors).length > 0) {
      setFieldErrors(combinedErrors);
      setCurrentStep(Object.keys(profileErrors).length > 0 ? 1 : 2);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Authentication verification failed. Please sign in again.");
        return;
      }

      const { data: existingAuthProviderRow } = await supabase
        .from("profiles")
        .select("auth_provider, email_verified")
        .eq("id", user.id)
        .maybeSingle();

      const isStudent = formData.userType === "Student";
      const normalizedRole = isStudent ? formData.role : "Faculty";
      const currentProvider = String(user.app_metadata?.provider || "email").toLowerCase() === "google" ? "google" : "email";
      const existingProvider = String(existingAuthProviderRow?.auth_provider || "").toLowerCase();
      const nextAuthProvider =
        !existingProvider ? currentProvider : existingProvider === "both" || existingProvider === currentProvider ? existingProvider : "both";

      const profilePayload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        user_type: formData.userType,
        usn: isStudent ? formData.usn.trim().toUpperCase() : null,
        batch: isStudent ? formData.batch : null,
        year_of_study: isStudent ? formData.year : null,
        phone: normalizedPhone,
        role: normalizedRole,
        campus: normalizedRole === "Hostelite" ? null : formData.campus,
        hostel_name: normalizedRole === "Hostelite" ? formData.hostelName : null,
        room_no: normalizedRole === "Hostelite" ? formData.roomNo.trim() : null,
        has_vehicle: formData.hasVehicle === "Yes",
        vehicle_no: formData.hasVehicle === "Yes" ? normalizedVehicle : null,
        auth_provider: nextAuthProvider,
        email_verified: currentProvider === "google" ? true : Boolean(existingAuthProviderRow?.email_verified),
      };

      const { data: existingProfileRow, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      let profileError: any = existingProfileError || null;

      if (!profileError && existingProfileRow) {
        const { error: updateProfileError } = await supabase
          .from("profiles")
          .update(profilePayload)
          .eq("id", user.id);
        profileError = updateProfileError;
      } else if (!profileError) {
        const { error: insertProfileError } = await supabase
          .from("profiles")
          .insert([{ id: user.id, ...profilePayload }]);
        profileError = insertProfileError;

        if (profileError && isDuplicateProfilePrimaryKeyError(profileError)) {
          const { error: fallbackUpdateError } = await supabase
            .from("profiles")
            .update(profilePayload)
            .eq("id", user.id);
          profileError = fallbackUpdateError;
        }
      }

      if (profileError) {
        if (isVehicleAlreadyRegisteredError(profileError)) {
          setFieldErrors({ vehicleNo: "This vehicle is already linked to another account." });
          setCurrentStep(2);
        } else {
          setError(`Profile details could not be saved: ${profileError.message}`);
        }
        return;
      }

      // Fire-and-forget welcome email — never blocks navigation
      void fetch("/api/welcome-email", { method: "POST" }).catch(() => {});

      router.push("/lost-and-found");
    } catch (submitError: any) {
      setError(submitError.message || "Unable to save your profile right now.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isBootstrapping) {
    return <div className="auth-shell flex items-center justify-center text-white/50">Loading your profile...</div>;
  }

  return (
    <AuthShell
      title="Complete your profile"
      description="Finish setting up your account."
      size="wide"
      progress={{ currentStep, totalSteps: 2, label: "Profile completion", steps: COMPLETE_STEPS }}
      heroTitle="Finish your profile"
      heroDescription="Add the remaining details to continue."
      heroHighlights={[
        {
          title: "2 simple steps",
          description: "Profile details, then campus details.",
        },
        {
          title: "Same NIE account",
          description: "Finish setup and continue.",
        },
      ]}
      heroStats={[]}
      footer={
        <>
          Signed in as <span className="font-semibold text-white">{accountEmail || "your NIE account"}</span>
          <span className="mx-2 text-white/28">|</span>
          <button
            type="button"
            onClick={() => void handleUseDifferentAccount()}
            disabled={isSigningOut}
            className="auth-inline-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use a different account
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error ? <AuthAlert kind="error">{error}</AuthAlert> : null}
        {accountEmail ? <AuthAlert>Profile details for {accountEmail}</AuthAlert> : null}

        <AuthSection title={stepMeta.title} description={stepMeta.description}>
          <AnimatePresence mode="wait">
            <motion.div
              key={String(currentStep)}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid gap-4"
            >
              {currentStep === 1 ? (
                <AuthProfileIdentityFields
                  formData={formData}
                  fieldErrors={fieldErrors}
                  onInputChange={handleChange}
                  onPhoneChange={(value) => { setFormData((current) => ({ ...current, phone: value })); clearMessages(); }}
                  onPhoneBlur={() => setFormData((current) => ({ ...current, phone: normalizePhoneNumber(current.phone) }))}
                  onUserTypeChange={handleUserTypeChange}
                  isUserTypeLocked={isUserTypeLocked}
                  isUsnLocked={isUsnLocked}
                />
              ) : (
                <AuthCampusFields
                  formData={formData}
                  fieldErrors={fieldErrors}
                  onInputChange={handleChange}
                  onRoleChange={(role) => { setFormData((current) => ({ ...current, role })); clearMessages(); }}
                  onVehicleChoice={(value) => { setFormData((current) => ({ ...current, hasVehicle: value })); clearMessages(); }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            {currentStep > 1 ? (
              <button type="button" onClick={() => { setCurrentStep(1); clearMessages(); }} className="focus-ring auth-secondary-button inline-flex items-center justify-center gap-2 px-5">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}

            <button type="submit" disabled={isLoading} className="focus-ring auth-primary-button inline-flex items-center justify-center gap-2 px-5">
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  <span>{currentStep === 1 ? "Continue" : "Save profile"}</span>
                  <Check className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </AuthSection>
      </form>
    </AuthShell>
  );
}
