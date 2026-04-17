"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from "lucide-react";

import { AuthAlert } from "@/components/AuthAlert";
import { AuthCampusFields, AuthProfileIdentityFields, AuthProfileDetailsState } from "@/components/AuthProfileFormFields";
import { AuthField } from "@/components/AuthField";
import { AuthSection } from "@/components/AuthSection";
import { AuthShell } from "@/components/AuthShell";
import { GoogleMark } from "@/app/_components/GoogleMark";
import { createClient } from "@/utils/supabase/client";
import { normalizePhoneNumber, validateRequiredPhoneNumber } from "@/lib/phone";
import { formatOwnerVehiclePlateInput, validateOwnerVehiclePlate } from "@/lib/vehiclePlate";
import {
  DOMAIN_RESTRICTION_MESSAGE,
  GROUP_EMAIL_BLOCK_MESSAGE,
  checkAuthEmailStatus,
  isAllowedAuthEmail,
  normalizeInstitutionalEmail,
} from "@/lib/authEmail";

type SignupFormState = AuthProfileDetailsState & {
  email: string;
  password: string;
};

type SignupFieldErrors = Partial<Record<keyof SignupFormState | "acceptedPolicies", string>>;

const initialFormState: SignupFormState = {
  email: "",
  password: "",
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

const SIGNUP_STEPS = [
  { label: "Account", detail: "Email and method" },
  { label: "Profile", detail: "Basic details" },
  { label: "Campus", detail: "Stay and vehicle" },
];

function isVehicleAlreadyRegisteredError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("vehicle");
}

function isDuplicateProfilePrimaryKeyError(error: any) {
  const details = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return error?.code === "23505" && details.includes("profiles_pkey");
}

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [formData, setFormData] = useState<SignupFormState>(initialFormState);
  const [signupMode, setSignupMode] = useState<"password" | "magiclink">("password");
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const urlError = searchParams.get("error");

    if (urlError === "invalid-domain") {
      setError(DOMAIN_RESTRICTION_MESSAGE);
      router.replace("/signup");
      return;
    }

    if (urlError === "blocked-group") {
      setError(GROUP_EMAIL_BLOCK_MESSAGE);
      router.replace("/signup");
    }
  }, [router, searchParams]);

  const stepMeta = useMemo(() => {
    if (signupMode === "magiclink") {
      return {
        title: "Start with your NIE email",
        description: "Send the sign-up link to your NIE email.",
      };
    }

    if (currentStep === 1) {
      return {
        title: "Account",
        description: "Choose your email and sign-up method.",
      };
    }

    if (currentStep === 2) {
      return {
        title: "Profile",
        description: "Add your basic details.",
      };
    }

    return {
      title: "Campus",
      description: "Add your campus and vehicle details.",
    };
  }, [currentStep, signupMode]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
    setFieldErrors({});
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    const nextValue = name === "vehicleNo" ? formatOwnerVehiclePlateInput(value) : value;
    setFormData((current) => ({ ...current, [name]: nextValue }));
    clearMessages();
  };

  const handleUserTypeChange = (userType: "Student" | "Faculty") => {
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

  const validateAccountStep = () => {
    const errors: SignupFieldErrors = {};
    const normalizedEmail = normalizeInstitutionalEmail(formData.email);

    if (!isAllowedAuthEmail(normalizedEmail)) {
      errors.email = DOMAIN_RESTRICTION_MESSAGE;
    }

    if (signupMode === "password" && formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters long.";
    }

    if (!acceptedPolicies) {
      errors.acceptedPolicies = "Please accept the Terms and Privacy Policy before continuing.";
    }

    return { errors, normalizedEmail };
  };

  const validateProfileStep = () => {
    const errors: SignupFieldErrors = {};

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
    const errors: SignupFieldErrors = {};
    const vehicleValidation =
      formData.hasVehicle === "Yes"
        ? validateOwnerVehiclePlate(formData.vehicleNo, { required: true })
        : { plate: "", error: "" };

    if (formData.userType === "Student" && formData.role === "Hostelite") {
      if (!formData.roomNo.trim()) {
        errors.roomNo = "Enter your hostel room number.";
      }
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

  const handleGoogleAuth = async () => {
    clearMessages();

    if (!acceptedPolicies) {
      setFieldErrors({ acceptedPolicies: "Please accept the Terms and Privacy Policy before continuing." });
      return;
    }

    const supabase = createClient();
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?screen=signup&next=/lost-and-found`,
        queryParams: {
          prompt: "select_account consent",
        },
      },
    });

    if (googleError) {
      if (googleError.message.toLowerCase().includes("invalid domain")) {
        setFieldErrors({ email: DOMAIN_RESTRICTION_MESSAGE });
      } else {
        setError(googleError.message);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    if (signupMode === "password" && currentStep === 1) {
      const { errors, normalizedEmail } = validateAccountStep();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      // Check if account already exists — block at step 1, not at the end
      setIsLoading(true);
      try {
        const emailStatus = await checkAuthEmailStatus(normalizedEmail);

        if (!emailStatus.domainAllowed) {
          setFieldErrors({ email: DOMAIN_RESTRICTION_MESSAGE });
          return;
        }
        if (emailStatus.blocked) {
          setFieldErrors({ email: emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE });
          return;
        }
        if (emailStatus.exists) {
          setFieldErrors({
            email: emailStatus.providers?.includes("google")
              ? "This email already uses Google sign-in. Use Google on the login page instead."
              : "This email already has an account. Sign in instead.",
          });
          return;
        }
      } catch {
        // If check fails, let user proceed — server will catch duplicates later
      } finally {
        setIsLoading(false);
      }

      setCurrentStep(2);
      return;
    }

    if (signupMode === "password" && currentStep === 2) {
      const errors = validateProfileStep();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setCurrentStep(3);
      return;
    }

    const { errors: accountErrors, normalizedEmail } = validateAccountStep();
    if (Object.keys(accountErrors).length > 0) {
      setFieldErrors(accountErrors);
      setCurrentStep(1);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      // For magiclink, check email existence here (password mode checks at step 1)
      if (signupMode === "magiclink") {
        const emailStatus = await checkAuthEmailStatus(normalizedEmail);

        if (!emailStatus.domainAllowed) {
          setFieldErrors({ email: DOMAIN_RESTRICTION_MESSAGE });
          return;
        }
        if (emailStatus.blocked) {
          setFieldErrors({ email: emailStatus.blockedReason || GROUP_EMAIL_BLOCK_MESSAGE });
          return;
        }
        if (emailStatus.exists) {
          setFieldErrors({
            email: emailStatus.providers?.includes("google")
              ? "This email already uses Google sign-in. Use Google on the login page instead."
              : "This email already has an account. Sign in instead.",
          });
          return;
        }
      }

      if (signupMode === "magiclink") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${window.location.origin}/auth/callback?screen=signup&next=/lost-and-found`,
          },
        });

        if (otpError) {
          if (otpError.message.toLowerCase().includes("already")) {
            setFieldErrors({ email: "This email already has an account. Sign in instead." });
          } else {
            setError(otpError.message);
          }
          return;
        }

        setFormData((current) => ({ ...current, email: normalizedEmail }));
        setMagicLinkSent(true);
        setSuccess("A sign-up link has been sent to your NIE email.");
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
        setCurrentStep(Object.keys(profileErrors).length > 0 ? 2 : 3);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: formData.password,
      });

      if (authError) {
        if (authError.message.toLowerCase().includes("already")) {
          setFieldErrors({ email: "This email already has an account. Sign in instead." });
          setCurrentStep(1);
        } else {
          setError(authError.message);
        }
        return;
      }

      if (!authData.user) {
        setError("Account could not be created. Please try again.");
        return;
      }

      if (!authData.session) {
        setError("Email confirmation is still enabled in Supabase. Disable it for the instant signup flow.");
        return;
      }

      const isStudent = formData.userType === "Student";
      const normalizedRole = isStudent ? formData.role : "Faculty";
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
        auth_provider: "email",
        email_verified: false,
      };

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", authData.user.id)
        .maybeSingle();

      let profileError: any = null;

      if (existingProfile) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update(profilePayload)
          .eq("id", authData.user.id);
        profileError = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("profiles")
          .insert([{ id: authData.user.id, ...profilePayload }]);
        profileError = insertError;

        if (profileError && isDuplicateProfilePrimaryKeyError(profileError)) {
          const { error: fallbackUpdateError } = await supabase
            .from("profiles")
            .update(profilePayload)
            .eq("id", authData.user.id);
          profileError = fallbackUpdateError;
        }
      }

      if (profileError) {
        if (isVehicleAlreadyRegisteredError(profileError)) {
          setFieldErrors({ vehicleNo: "This vehicle is already linked to another account." });
          setCurrentStep(3);
        } else {
          setError(`Account created, but profile details could not be saved: ${profileError.message}`);
        }
        return;
      }

      router.push("/lost-and-found");
    } catch (submitError: any) {
      setError(submitError.message || "Unable to create the account right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      description="Create your NIESync account."
      size="wide"
      progress={signupMode === "password" ? { currentStep, totalSteps: 3, label: "Account setup", steps: SIGNUP_STEPS } : undefined}
      heroTitle="Create your NIESync account"
      heroDescription="Use your NIE email and finish the steps."
      heroHighlights={[
        {
          title: "NIE email only",
          description: "Use your `@nie.ac.in` account.",
        },
        {
          title: "3 simple steps",
          description: "Account, profile, and campus details.",
        },
      ]}
      heroStats={[]}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="auth-inline-link font-bold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error ? <AuthAlert kind="error">{error}</AuthAlert> : null}
        {success ? <AuthAlert kind="success">{success}</AuthAlert> : null}

        <AuthSection title={stepMeta.title} description={stepMeta.description}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${signupMode}-${currentStep}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid gap-4"
            >
              {currentStep === 1 ? (
                <>
                  <AuthField label="NIE email" htmlFor="signup-email" helper="Only `@nie.ac.in` accounts can create an account here." error={fieldErrors.email}>
                    <input
                      id="signup-email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={(event) => setFormData((current) => ({ ...current, email: normalizeInstitutionalEmail(event.target.value) }))}
                      placeholder="name@nie.ac.in"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={magicLinkSent}
                      required
                      aria-invalid={Boolean(fieldErrors.email)}
                      className="auth-input focus-ring"
                    />
                  </AuthField>

                  <AuthField label="Sign up method">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => { setSignupMode("password"); setCurrentStep(1); setMagicLinkSent(false); clearMessages(); }} className={`focus-ring auth-choice ${signupMode === "password" ? "is-active" : ""}`}>Email and password</button>
                      <button type="button" onClick={() => { setSignupMode("magiclink"); setCurrentStep(1); setMagicLinkSent(false); clearMessages(); }} className={`focus-ring auth-choice ${signupMode === "magiclink" ? "is-active" : ""}`}>Email link</button>
                    </div>
                  </AuthField>

                  {signupMode === "password" ? (
                    <AuthField label="Password" htmlFor="signup-password" error={fieldErrors.password}>
                      <div className="relative">
                        <input
                          id="signup-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="Minimum 6 characters"
                          autoComplete="new-password"
                          required={signupMode === "password"}
                          aria-invalid={Boolean(fieldErrors.password)}
                          className="auth-input focus-ring pr-12"
                        />
                        <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="focus-ring absolute right-4 top-1/2 -translate-y-1/2 text-white/55 transition hover:text-white">
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </AuthField>
                  ) : (
                    <AuthAlert>We&apos;ll send the sign-up link to your NIE email.</AuthAlert>
                  )}

                  <div className="grid gap-2">
                    <label className="auth-checkbox">
                      <input type="checkbox" checked={acceptedPolicies} onChange={(event) => { setAcceptedPolicies(event.target.checked); clearMessages(); }} className="auth-checkbox-input" />
                      <span>
                        I agree to the{" "}
                        <Link href="/terms-of-service" className="auth-inline-link font-semibold hover:underline">Terms of Service</Link>{" "}
                        and{" "}
                        <Link href="/privacy-policy" className="auth-inline-link font-semibold hover:underline">Privacy Policy</Link>.
                      </span>
                    </label>
                    {fieldErrors.acceptedPolicies ? <p className="auth-error-text">{fieldErrors.acceptedPolicies}</p> : null}
                  </div>

                  <div className="auth-or-divider"><span>Or</span></div>

                  <button type="button" onClick={handleGoogleAuth} className="focus-ring auth-secondary-button inline-flex items-center justify-center gap-3 px-5">
                    <GoogleMark className="h-5 w-5" />
                    <span>Google Workspace (@nie.ac.in)</span>
                  </button>
                </>
              ) : null}

              {signupMode === "password" && currentStep === 2 ? (
                <AuthProfileIdentityFields
                  formData={formData}
                  fieldErrors={fieldErrors}
                  onInputChange={handleChange}
                  onPhoneChange={(value) => { setFormData((current) => ({ ...current, phone: value })); clearMessages(); }}
                  onPhoneBlur={() => setFormData((current) => ({ ...current, phone: normalizePhoneNumber(current.phone) }))}
                  onUserTypeChange={handleUserTypeChange}
                />
              ) : null}

              {signupMode === "password" && currentStep === 3 ? (
                <AuthCampusFields
                  formData={formData}
                  fieldErrors={fieldErrors}
                  onInputChange={handleChange}
                  onRoleChange={(role) => { setFormData((current) => ({ ...current, role })); clearMessages(); }}
                  onVehicleChoice={(value) => { setFormData((current) => ({ ...current, hasVehicle: value })); clearMessages(); }}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            {signupMode === "password" && currentStep > 1 ? (
              <button type="button" onClick={() => { setCurrentStep((value) => value - 1); clearMessages(); }} className="focus-ring auth-secondary-button inline-flex items-center justify-center gap-2 px-5">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}

            {!magicLinkSent ? (
              <button type="submit" disabled={isLoading} className="focus-ring auth-primary-button inline-flex items-center justify-center gap-2 px-5">
                {isLoading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                ) : (
                  <>
                    <span>
                      {signupMode === "magiclink"
                        ? "Send sign-up link"
                        : currentStep < 3
                          ? "Continue"
                          : "Create account"}
                    </span>
                    {signupMode === "password" && currentStep === 3 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </>
                )}
              </button>
            ) : (
              <button type="button" onClick={() => { setMagicLinkSent(false); setSuccess(""); }} className="focus-ring auth-secondary-button px-5">
                Use a different email
              </button>
            )}
          </div>
        </AuthSection>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="auth-shell flex items-center justify-center text-white/50">Loading sign-up...</div>}>
      <SignupContent />
    </Suspense>
  );
}
