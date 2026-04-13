"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Car, Edit3, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";
import {
  formatOwnerVehiclePlateInput,
  getOwnerVehiclePlateFormatsHint,
  validateOwnerVehiclePlate,
} from "@/lib/vehiclePlate";

type ProfileVehicleRow = {
  has_vehicle: boolean | null;
  vehicle_no: string | null;
  vehicle_type: string | null;
  vehicle_brand_model: string | null;
  vehicle_color: string | null;
};

type AdditionalVehicleRow = {
  id: string;
  vehicle_no: string;
  vehicle_type: string | null;
  vehicle_brand_model: string | null;
  vehicle_color: string | null;
};

type AdditionalVehicleDraft = {
  vehicleNo: string;
  vehicleType: string;
  vehicleBrandModel: string;
  vehicleColor: string;
};

type VehiclesSnapshot = {
  hasVehicle: boolean;
  primaryVehicleNo: string;
  primaryVehicleType: string;
  primaryVehicleBrandModel: string;
  primaryVehicleColor: string;
  additionalVehicles: AdditionalVehicleDraft[];
};

const EMPTY_VEHICLE_DRAFT: AdditionalVehicleDraft = {
  vehicleNo: "",
  vehicleType: "",
  vehicleBrandModel: "",
  vehicleColor: "",
};

function snapshotFromRows(
  primary: ProfileVehicleRow | null,
  extras: AdditionalVehicleRow[]
): VehiclesSnapshot {
  const hasPrimaryVehicle = Boolean(String(primary?.vehicle_no || "").trim());
  return {
    hasVehicle: Boolean(primary?.has_vehicle || hasPrimaryVehicle || extras.length > 0),
    primaryVehicleNo: String(primary?.vehicle_no || ""),
    primaryVehicleType: String(primary?.vehicle_type || ""),
    primaryVehicleBrandModel: String(primary?.vehicle_brand_model || ""),
    primaryVehicleColor: String(primary?.vehicle_color || ""),
    additionalVehicles: extras.map((vehicle) => ({
      vehicleNo: String(vehicle.vehicle_no || ""),
      vehicleType: String(vehicle.vehicle_type || ""),
      vehicleBrandModel: String(vehicle.vehicle_brand_model || ""),
      vehicleColor: String(vehicle.vehicle_color || ""),
    })),
  };
}

export default function ProfileVehiclesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [userId, setUserId] = useState("");

  const [hasVehicle, setHasVehicle] = useState(false);
  const [primaryVehicleNo, setPrimaryVehicleNo] = useState("");
  const [primaryVehicleType, setPrimaryVehicleType] = useState("");
  const [primaryVehicleBrandModel, setPrimaryVehicleBrandModel] = useState("");
  const [primaryVehicleColor, setPrimaryVehicleColor] = useState("");
  const [additionalVehicles, setAdditionalVehicles] = useState<AdditionalVehicleDraft[]>([]);
  const [snapshot, setSnapshot] = useState<VehiclesSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    const loadVehicles = async () => {
      setIsLoading(true);
      setError("");

      try {
        const { user, errorMessage } = await resolveClientUser(supabase);

        if (!active) return;

        if (!user) {
          if (errorMessage) {
            setError(errorMessage);
          }
          setUserId("");
          return;
        }
        setUserId(user.id);

        const [{ data: primaryData, error: primaryError }, { data: additionalData, error: additionalError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("has_vehicle, vehicle_no, vehicle_type, vehicle_brand_model, vehicle_color")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("profile_vehicles")
              .select("id, vehicle_no, vehicle_type, vehicle_brand_model, vehicle_color")
              .eq("profile_id", user.id)
              .order("created_at", { ascending: true }),
          ]);

        if (!active) return;

        if (primaryError) throw primaryError;
        if (additionalError && additionalError.code !== "42P01") throw additionalError;

        const nextSnapshot = snapshotFromRows(
          (primaryData || null) as ProfileVehicleRow | null,
          (additionalData || []) as AdditionalVehicleRow[]
        );
        setSnapshot(nextSnapshot);
        setHasVehicle(nextSnapshot.hasVehicle);
        setPrimaryVehicleNo(nextSnapshot.primaryVehicleNo);
        setPrimaryVehicleType(nextSnapshot.primaryVehicleType);
        setPrimaryVehicleBrandModel(nextSnapshot.primaryVehicleBrandModel);
        setPrimaryVehicleColor(nextSnapshot.primaryVehicleColor);
        setAdditionalVehicles(nextSnapshot.additionalVehicles);
        setIsEditing(false);
      } catch (loadError: any) {
        if (!active) return;
        setError(loadError?.message || "Unable to load vehicles.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadVehicles();
    return () => {
      active = false;
    };
  }, [supabase]);

  const startEditing = () => {
    setSuccess("");
    setError("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (!snapshot) return;
    setHasVehicle(snapshot.hasVehicle);
    setPrimaryVehicleNo(snapshot.primaryVehicleNo);
    setPrimaryVehicleType(snapshot.primaryVehicleType);
    setPrimaryVehicleBrandModel(snapshot.primaryVehicleBrandModel);
    setPrimaryVehicleColor(snapshot.primaryVehicleColor);
    setAdditionalVehicles(snapshot.additionalVehicles);
    setIsEditing(false);
    setError("");
  };

  const updateAdditionalVehicleField = (
    index: number,
    field: keyof AdditionalVehicleDraft,
    value: string
  ) => {
    setAdditionalVehicles((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (field === "vehicleNo") {
          return { ...item, vehicleNo: formatOwnerVehiclePlateInput(value) };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const removeAdditionalVehicleField = (index: number) => {
    setAdditionalVehicles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addAdditionalVehicleField = () => {
    setAdditionalVehicles((prev) => [...prev, { ...EMPTY_VEHICLE_DRAFT }]);
  };

  const handleSaveVehicles = async () => {
    if (!userId) return;

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!hasVehicle) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            has_vehicle: false,
            vehicle_no: null,
            vehicle_type: null,
            vehicle_brand_model: null,
            vehicle_color: null,
          })
          .eq("id", userId);
        if (profileError) throw profileError;

        const { error: clearError } = await supabase
          .from("profile_vehicles")
          .delete()
          .eq("profile_id", userId);
        if (clearError && clearError.code !== "42P01") throw clearError;

        const nextSnapshot: VehiclesSnapshot = {
          hasVehicle: false,
          primaryVehicleNo: "",
          primaryVehicleType: "",
          primaryVehicleBrandModel: "",
          primaryVehicleColor: "",
          additionalVehicles: [],
        };
        setSnapshot(nextSnapshot);
        setHasVehicle(false);
        setPrimaryVehicleNo("");
        setPrimaryVehicleType("");
        setPrimaryVehicleBrandModel("");
        setPrimaryVehicleColor("");
        setAdditionalVehicles([]);
        setIsEditing(false);
        setSuccess("Vehicle registry updated.");
        return;
      }

      const primaryValidation = validateOwnerVehiclePlate(primaryVehicleNo, {
        required: true,
        requiredMessage: "Primary vehicle number is required.",
      });
      if (primaryValidation.error) throw new Error(primaryValidation.error);

      const normalizedAdditional = additionalVehicles
        .map((vehicle) => {
          const draft = formatOwnerVehiclePlateInput(vehicle.vehicleNo);
          if (!draft) return null;
          const validation = validateOwnerVehiclePlate(draft, {
            required: true,
            invalidMessage: `Each additional vehicle must be valid. ${getOwnerVehiclePlateFormatsHint()}`,
          });
          if (validation.error) throw new Error(validation.error);
          return {
            vehicle_no: validation.plate,
            vehicle_type: vehicle.vehicleType || null,
            vehicle_brand_model: vehicle.vehicleBrandModel.trim() || null,
            vehicle_color: vehicle.vehicleColor.trim() || null,
          };
        })
        .filter(
          (
            vehicle
          ): vehicle is {
            vehicle_no: string;
            vehicle_type: string | null;
            vehicle_brand_model: string | null;
            vehicle_color: string | null;
          } => Boolean(vehicle)
        );

      const deDup = new Set<string>();
      for (const vehicle of normalizedAdditional) {
        if (vehicle.vehicle_no === primaryValidation.plate) {
          throw new Error("Primary and additional vehicles cannot be the same.");
        }
        if (deDup.has(vehicle.vehicle_no)) {
          throw new Error("Duplicate additional vehicles are not allowed.");
        }
        deDup.add(vehicle.vehicle_no);
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          has_vehicle: true,
          vehicle_no: primaryValidation.plate,
          vehicle_type: primaryVehicleType || null,
          vehicle_brand_model: primaryVehicleBrandModel.trim() || null,
          vehicle_color: primaryVehicleColor.trim() || null,
        })
        .eq("id", userId);
      if (profileError) throw profileError;

      const { error: clearError } = await supabase
        .from("profile_vehicles")
        .delete()
        .eq("profile_id", userId);
      if (clearError && clearError.code !== "42P01") throw clearError;

      if (normalizedAdditional.length > 0) {
        const { error: insertError } = await supabase.from("profile_vehicles").insert(
          normalizedAdditional.map((vehicle) => ({
            profile_id: userId,
            ...vehicle,
          }))
        );
        if (insertError) throw insertError;
      }

      const nextSnapshot: VehiclesSnapshot = {
        hasVehicle: true,
        primaryVehicleNo: primaryValidation.plate,
        primaryVehicleType: primaryVehicleType || "",
        primaryVehicleBrandModel: primaryVehicleBrandModel || "",
        primaryVehicleColor: primaryVehicleColor || "",
        additionalVehicles: normalizedAdditional.map((vehicle) => ({
          vehicleNo: vehicle.vehicle_no,
          vehicleType: vehicle.vehicle_type || "",
          vehicleBrandModel: vehicle.vehicle_brand_model || "",
          vehicleColor: vehicle.vehicle_color || "",
        })),
      };
      setSnapshot(nextSnapshot);
      setIsEditing(false);
      setSuccess("Vehicle registry updated.");
    } catch (err: any) {
      setError(err?.message || "Unable to save vehicles.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.45)] md:p-7"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Profile</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight md:text-4xl">Your Vehicles</h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary md:text-base">
            Review your registered vehicles first, then edit when needed.
          </p>
        </motion.header>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm text-green-200">
            {success}
          </div>
        ) : null}

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/60" />
            </div>
          ) : !isEditing ? (
            <div className="space-y-4">
              {hasVehicle && primaryVehicleNo ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-text-secondary">
                    Primary Vehicle
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold uppercase tracking-[0.16em] text-white">
                    {primaryVehicleNo}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
                    {primaryVehicleType ? <span>Type: {primaryVehicleType}</span> : null}
                    {primaryVehicleBrandModel ? <span>Model: {primaryVehicleBrandModel}</span> : null}
                    {primaryVehicleColor ? <span>Color: {primaryVehicleColor}</span> : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center">
                  <Car className="mx-auto h-6 w-6 text-white/35" />
                  <p className="mt-2 text-sm text-white/75">No vehicles registered yet.</p>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-text-secondary">
                  Additional Vehicles
                </p>
                {additionalVehicles.length === 0 ? (
                  <p className="mt-2 text-sm text-white/65">No additional vehicles.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {additionalVehicles.map((vehicle, index) => (
                      <div
                        key={`saved-vehicle-${index}`}
                        className="rounded-xl border border-white/10 bg-black/35 px-3 py-2"
                      >
                        <p className="font-mono text-sm font-semibold uppercase tracking-[0.12em] text-white">
                          {vehicle.vehicleNo}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/65">
                          {vehicle.vehicleType ? <span>Type: {vehicle.vehicleType}</span> : null}
                          {vehicle.vehicleBrandModel ? (
                            <span>Model: {vehicle.vehicleBrandModel}</span>
                          ) : null}
                          {vehicle.vehicleColor ? <span>Color: {vehicle.vehicleColor}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] transition-colors hover:bg-white/20"
              >
                <Edit3 className="h-4 w-4" />
                {hasVehicle ? "Edit Vehicles" : "Add Vehicles"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
                  Do You Use A Vehicle On Campus?
                </p>
                <div className="grid grid-cols-2 gap-2 sm:max-w-[260px]">
                  {[
                    { label: "No", value: false },
                    { label: "Yes", value: true },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setHasVehicle(opt.value)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                        hasVehicle === opt.value
                          ? "border-accent-blue/40 bg-accent-blue/20 text-white"
                          : "border-white/10 bg-black/30 text-white/75 hover:bg-white/[0.08]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {hasVehicle ? (
                <>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-text-secondary">
                      Primary Vehicle
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={primaryVehicleNo}
                          onChange={(event) =>
                            setPrimaryVehicleNo(formatOwnerVehiclePlateInput(event.target.value))
                          }
                          placeholder="KA-09-AB-1234 or 22-BH-1234-AA"
                          className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-center font-mono text-lg tracking-[0.14em] uppercase outline-none transition-colors focus:border-accent-blue/50"
                        />
                        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                          {getOwnerVehiclePlateFormatsHint()}
                        </p>
                      </div>
                      <input
                        type="text"
                        value={primaryVehicleType}
                        onChange={(event) => setPrimaryVehicleType(event.target.value)}
                        placeholder="Type (2-Wheeler / 4-Wheeler)"
                        className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm outline-none transition-colors focus:border-accent-blue/50"
                      />
                      <input
                        type="text"
                        value={primaryVehicleColor}
                        onChange={(event) => setPrimaryVehicleColor(event.target.value)}
                        placeholder="Color"
                        className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm outline-none transition-colors focus:border-accent-blue/50"
                      />
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={primaryVehicleBrandModel}
                          onChange={(event) => setPrimaryVehicleBrandModel(event.target.value)}
                          placeholder="Brand / Model"
                          className="w-full rounded-xl border border-white/10 bg-black/35 p-3 text-sm outline-none transition-colors focus:border-accent-blue/50"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-text-secondary">
                        Additional Vehicles
                      </p>
                      <button
                        type="button"
                        onClick={addAdditionalVehicleField}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-white/[0.1]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {additionalVehicles.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/65">
                          No additional vehicles added.
                        </div>
                      ) : (
                        additionalVehicles.map((vehicle, index) => (
                          <div
                            key={`vehicle-${index}`}
                            className="rounded-xl border border-white/10 bg-black/35 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/65">
                                Vehicle {index + 2}
                              </p>
                              <button
                                type="button"
                                onClick={() => removeAdditionalVehicleField(index)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
                                aria-label={`Remove vehicle ${index + 2}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={vehicle.vehicleNo}
                                onChange={(event) =>
                                  updateAdditionalVehicleField(index, "vehicleNo", event.target.value)
                                }
                                placeholder="KA-09-AB-1234"
                                className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-sm uppercase tracking-[0.1em] outline-none transition-colors focus:border-accent-blue/50"
                              />
                              <input
                                type="text"
                                value={vehicle.vehicleType}
                                onChange={(event) =>
                                  updateAdditionalVehicleField(index, "vehicleType", event.target.value)
                                }
                                placeholder="Type"
                                className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-sm outline-none transition-colors focus:border-accent-blue/50"
                              />
                              <input
                                type="text"
                                value={vehicle.vehicleBrandModel}
                                onChange={(event) =>
                                  updateAdditionalVehicleField(index, "vehicleBrandModel", event.target.value)
                                }
                                placeholder="Brand / Model"
                                className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-sm outline-none transition-colors focus:border-accent-blue/50"
                              />
                              <input
                                type="text"
                                value={vehicle.vehicleColor}
                                onChange={(event) =>
                                  updateAdditionalVehicleField(index, "vehicleColor", event.target.value)
                                }
                                placeholder="Color"
                                className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-sm outline-none transition-colors focus:border-accent-blue/50"
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center">
                  <Car className="mx-auto h-6 w-6 text-white/35" />
                  <p className="mt-2 text-sm text-white/75">
                    Vehicle tracking will stay disabled for your profile.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveVehicles}
                  disabled={isSaving || !userId}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] transition-colors hover:bg-white/20 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? "Saving..." : "Save Vehicles"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] transition-colors hover:bg-white/[0.1] disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
