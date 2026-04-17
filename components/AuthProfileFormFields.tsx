"use client";

import PhoneInput from "react-phone-number-input";

import { AuthField } from "@/components/AuthField";
import { getOwnerVehiclePlateFormatsHint } from "@/lib/vehiclePlate";

export const BATCH_OPTIONS = [
  "ISE",
  "CSE",
  "CSE(AI/ML)",
  "MECHANICAL",
  "CIVIL",
  "ECE",
  "EEE",
  "OTHER",
];

export const YEAR_OPTIONS = ["I Year", "II Year", "III Year", "IV Year"];

export const HOSTEL_OPTIONS = [
  "NIE North Boys Hostel",
  "NIE South Boys Hostel",
  "NIE Girls Hostel",
  "Other Affiliated Hostel",
];

export type AuthProfileDetailsState = {
  userType: "Student" | "Faculty";
  firstName: string;
  lastName: string;
  usn: string;
  batch: string;
  year: string;
  phone: string;
  role: "Day Scholar" | "Hostelite" | "Faculty";
  campus: string;
  hostelName: string;
  roomNo: string;
  hasVehicle: "Yes" | "No";
  vehicleNo: string;
};

export type AuthProfileFieldName = keyof AuthProfileDetailsState;

type FieldErrors = Partial<Record<AuthProfileFieldName | "acceptedPolicies" | "email" | "password", string>>;

type SharedProps = {
  formData: AuthProfileDetailsState;
  fieldErrors: FieldErrors;
};

type IdentityFieldsProps = SharedProps & {
  onInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onPhoneChange: (value: string) => void;
  onPhoneBlur: () => void;
  onUserTypeChange: (userType: "Student" | "Faculty") => void;
  isUserTypeLocked?: boolean;
  isUsnLocked?: boolean;
};

type CampusFieldsProps = SharedProps & {
  onInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onRoleChange: (role: "Day Scholar" | "Hostelite") => void;
  onVehicleChoice: (value: "Yes" | "No") => void;
};

export function AuthProfileIdentityFields({
  formData,
  fieldErrors,
  onInputChange,
  onPhoneChange,
  onPhoneBlur,
  onUserTypeChange,
  isUserTypeLocked = false,
  isUsnLocked = false,
}: IdentityFieldsProps) {
  return (
    <>
      <AuthField label="I am joining as" error={fieldErrors.userType}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["Student", "Faculty"] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={isUserTypeLocked}
              onClick={() => onUserTypeChange(type)}
              className={`focus-ring auth-choice ${formData.userType === type ? "is-active" : ""}`}
              aria-pressed={formData.userType === type}
            >
              {type}
            </button>
          ))}
        </div>
      </AuthField>

      <div className="grid gap-4 md:grid-cols-2">
        <AuthField label="First name" htmlFor="firstName" error={fieldErrors.firstName}>
          <input
            id="firstName"
            name="firstName"
            type="text"
            value={formData.firstName}
            onChange={onInputChange}
            autoComplete="given-name"
            placeholder="First name"
            aria-invalid={Boolean(fieldErrors.firstName)}
            className="auth-input focus-ring"
          />
        </AuthField>
        <AuthField label="Last name" htmlFor="lastName" error={fieldErrors.lastName}>
          <input
            id="lastName"
            name="lastName"
            type="text"
            value={formData.lastName}
            onChange={onInputChange}
            autoComplete="family-name"
            placeholder="Last name"
            aria-invalid={Boolean(fieldErrors.lastName)}
            className="auth-input focus-ring"
          />
        </AuthField>
      </div>

      {formData.userType === "Student" ? (
        <>
          <AuthField
            label="USN"
            htmlFor="usn"
            helper="Check this carefully. USN is treated as a fixed identity value."
            error={fieldErrors.usn}
          >
            <input
              id="usn"
              name="usn"
              type="text"
              value={formData.usn}
              onChange={onInputChange}
              disabled={isUsnLocked}
              placeholder="4NI20CS000"
              aria-invalid={Boolean(fieldErrors.usn)}
              className="auth-input focus-ring uppercase disabled:opacity-65"
            />
          </AuthField>

          <div className="grid gap-4 md:grid-cols-2">
            <AuthField label="Batch / branch" htmlFor="batch" error={fieldErrors.batch}>
              <select
                id="batch"
                name="batch"
                value={formData.batch}
                onChange={onInputChange}
                aria-invalid={Boolean(fieldErrors.batch)}
                className="auth-select focus-ring"
              >
                <option value="" className="bg-campus-black">
                  Select batch
                </option>
                {BATCH_OPTIONS.map((batch) => (
                  <option key={batch} value={batch} className="bg-campus-black">
                    {batch}
                  </option>
                ))}
              </select>
            </AuthField>
            <AuthField label="Current year" htmlFor="year" error={fieldErrors.year}>
              <select
                id="year"
                name="year"
                value={formData.year}
                onChange={onInputChange}
                aria-invalid={Boolean(fieldErrors.year)}
                className="auth-select focus-ring"
              >
                <option value="" className="bg-campus-black">
                  Select year
                </option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year} className="bg-campus-black">
                    {year}
                  </option>
                ))}
              </select>
            </AuthField>
          </div>
        </>
      ) : null}

      <AuthField label="Phone number" htmlFor="phone" error={fieldErrors.phone}>
        <PhoneInput
          international
          defaultCountry="IN"
          value={formData.phone}
          onChange={(value) => onPhoneChange(value || "")}
          onBlur={onPhoneBlur}
          name="phone"
          autoComplete="tel"
          inputMode="tel"
          aria-invalid={Boolean(fieldErrors.phone)}
          className="PhoneInputOverride auth-input focus-ring"
        />
      </AuthField>
    </>
  );
}

export function AuthCampusFields({
  formData,
  fieldErrors,
  onInputChange,
  onRoleChange,
  onVehicleChoice,
}: CampusFieldsProps) {
  return (
    <>
      {formData.userType === "Student" ? (
        <AuthField label="Student status" error={fieldErrors.role}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["Day Scholar", "Hostelite"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => onRoleChange(role)}
                className={`focus-ring auth-choice ${formData.role === role ? "is-active" : ""}`}
                aria-pressed={formData.role === role}
              >
                {role}
              </button>
            ))}
          </div>
        </AuthField>
      ) : null}

      {formData.userType === "Student" && formData.role === "Hostelite" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <AuthField
            label="Hostel name"
            htmlFor="hostelName"
            helper="Pick the hostel that best matches where you stay."
            error={fieldErrors.hostelName}
            className="md:col-span-2"
          >
            <select
              id="hostelName"
              name="hostelName"
              value={formData.hostelName}
              onChange={onInputChange}
              aria-invalid={Boolean(fieldErrors.hostelName)}
              className="auth-select focus-ring"
            >
              {HOSTEL_OPTIONS.map((hostel) => (
                <option key={hostel} value={hostel} className="bg-campus-black">
                  {hostel === "NIE Girls Hostel" ? "NIE Girls Hostel (Yandahalli)" : hostel}
                </option>
              ))}
            </select>
          </AuthField>

          <AuthField
            label="Room number"
            htmlFor="roomNo"
            helper="Only hostelites need this for verification and recovery."
            error={fieldErrors.roomNo}
            className="md:col-span-2"
          >
            <input
              id="roomNo"
              name="roomNo"
              type="text"
              value={formData.roomNo}
              onChange={onInputChange}
              placeholder="Example: 204-B"
              aria-invalid={Boolean(fieldErrors.roomNo)}
              className="auth-input focus-ring uppercase"
            />
          </AuthField>
        </div>
      ) : (
        <AuthField
          label="Primary campus"
          htmlFor="campus"
          helper="Use the campus you most often use for pickup, recovery, and parking tools."
          error={fieldErrors.campus}
        >
          <select
            id="campus"
            name="campus"
            value={formData.campus}
            onChange={onInputChange}
            aria-invalid={Boolean(fieldErrors.campus)}
            className="auth-select focus-ring"
          >
            <option value="South Campus" className="bg-campus-black">
              South Campus
            </option>
            <option value="North Campus" className="bg-campus-black">
              North Campus
            </option>
          </select>
        </AuthField>
      )}

      <AuthField label="Do you bring a vehicle to campus?" error={fieldErrors.hasVehicle}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["No", "Yes"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onVehicleChoice(option)}
              className={`focus-ring auth-choice ${formData.hasVehicle === option ? "is-active" : ""}`}
              aria-pressed={formData.hasVehicle === option}
            >
              {option}
            </button>
          ))}
        </div>
      </AuthField>

      {formData.hasVehicle === "Yes" ? (
        <AuthField
          label="Vehicle number"
          htmlFor="vehicleNo"
          helper={getOwnerVehiclePlateFormatsHint()}
          error={fieldErrors.vehicleNo}
        >
          <input
            id="vehicleNo"
            name="vehicleNo"
            type="text"
            value={formData.vehicleNo}
            onChange={onInputChange}
            placeholder="KA-09-AB-1234 or 22-BH-1234-AA"
            aria-invalid={Boolean(fieldErrors.vehicleNo)}
            className="auth-input focus-ring font-mono uppercase tracking-[0.18em]"
          />
        </AuthField>
      ) : null}
    </>
  );
}
