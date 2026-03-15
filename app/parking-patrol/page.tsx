"use client";

import { Camera, AlertTriangle, CheckCircle, CarFront, FileWarning } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const VEHICLE_PLATE_REGEX = /^[A-Z]{2}-\d{2}-[A-Z]{1,3}-\d{4}$/;

function formatVehicleNumber(value: string) {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
  const match = cleaned.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,3})(\d{0,4})$/);

  if (!match) return "";

  return [match[1], match[2], match[3], match[4]].filter(Boolean).join("-");
}
export default function ParkingPatrol() {
  const [vehicleNo, setVehicleNo] = useState("");
  const [error, setError] = useState(false);
  const [isWiggling, setIsWiggling] = useState(false);

  const violations = [
    { id: 1, plate: "KA09 AB 1234", location: "Lot B (Faculty Only)", time: "10 mins ago", status: "notified" },
    { id: 2, plate: "DL04 CC 5678", location: "Fire Lane - Main Gate", time: "45 mins ago", status: "towed" },
    { id: 3, plate: "MH12 DE 9012", location: "Student Lot 4", time: "2 hours ago", status: "resolved" },
    { id: 4, plate: "KA01 XY 3344", location: "Handicap Spot (No Permit)", time: "3 hours ago", status: "notified" },
  ];

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-amber/30 flex flex-col pt-28">
      <div className="relative z-10 flex flex-col flex-grow px-8 md:px-16 pt-32 pb-12 max-w-[1920px] mx-auto w-full">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-white/10 pb-8 mt-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-3 flex items-center gap-4">
              Parking <span className="text-accent-amber">Patrol</span>
            </h1>
            <p className="text-text-secondary text-base max-w-xl">
              Monitor campus parking compliance, report unauthorized vehicles, and keep our driveways clear.
            </p>
          </div>
          <button className="bg-accent-amber text-campus-black hover:bg-[#FFC133] font-bold text-sm px-8 py-3.5 clip-diagonal transition-colors flex items-center gap-2 w-fit">
            <Camera className="w-5 h-5" />
            <span>Scan License Plate</span>
          </button>
        </div>

        {/* Dashboard Panels */}
        <div className="flex flex-col lg:flex-row gap-8 mb-12">

          {/* Main Action Area */}
          <div className="flex-1 glass-card p-8 rounded-sm border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-amber to-transparent"></div>

            <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-sm bg-white/5 transition-all text-white/90">
              <div className="w-20 h-20 bg-accent-amber/10 rounded-full flex items-center justify-center mb-6">
                <CarFront className="w-10 h-10 text-accent-amber" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Report a Violation</h3>
              <p className="text-text-secondary max-w-sm mx-auto mb-8">
                Take a clear photo of the license plate and vehicle context to securely report unpermitted parking.
              </p>
              
              <div className="flex flex-col gap-6 w-full max-w-xs md:max-w-sm mx-auto mt-2">
                
                {/* 1. Enter Vehicle No Group */}
                <div className="flex flex-col gap-1 w-full relative">
                  <motion.div 
                    className="flex flex-col sm:flex-row gap-2"
                    animate={isWiggling ? { x: [-5, 5, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    <input
                      type="text"
                      value={vehicleNo}
                      onChange={(e) => {
                        setVehicleNo(formatVehicleNumber(e.target.value));
                        if (error) setError(false);
                      }}
                      placeholder="KA-09-AB-1234"
                      className={`bg-black/40 border rounded-sm px-4 py-3 text-white placeholder:text-white/30 focus:outline-none transition-colors uppercase w-full font-mono tracking-wider ${
                        error ? "border-red-500 focus:border-red-500" : "border-white/10 focus:border-accent-amber/50"
                      }`}
                    />
                    <button 
                      onClick={() => {
                        if (!VEHICLE_PLATE_REGEX.test(vehicleNo)) {
                          setError(true);
                          setIsWiggling(true);
                          setTimeout(() => setIsWiggling(false), 400);
                        } else {
                          setError(false);
                          // Proceed with submission logic
                        }
                      }}
                      className="bg-accent-amber text-campus-black hover:bg-[#FFC133] font-bold px-6 py-3 rounded-sm transition-colors uppercase tracking-wide text-sm w-full sm:w-auto shrink-0"
                    >
                      Submit
                    </button>
                  </motion.div>
                  <AnimatePresence>
                    {error && (
                      <motion.span
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-red-400 text-xs font-medium text-left absolute -bottom-5"
                      >
                        Use a valid plate format: KA-09-AB-1234.
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-3 opacity-60">
                  <div className="h-px bg-white/20 w-full"></div>
                  <span className="text-xs uppercase tracking-widest text-text-secondary whitespace-nowrap">or</span>
                  <div className="h-px bg-white/20 w-full"></div>
                </div>

                {/* 2. Upload Photo */}
                <button className="bg-white/10 text-white hover:bg-white/20 border border-white/20 font-medium px-8 py-3 rounded-sm transition-colors w-full">
                  Upload Photo manually
                </button>
                
              </div>
            </div>
          </div>

          {/* Stats Sidebar */}
          <div className="w-full lg:w-[400px] flex flex-col gap-6">
            <div className="bg-gradient-to-br from-accent-amber/20 to-transparent border border-accent-amber/30 p-6 rounded-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <FileWarning className="w-6 h-6 text-accent-amber" />
                <span className="text-accent-amber text-xs font-bold uppercase tracking-wider bg-accent-amber/10 px-2.5 py-1 rounded-sm">High Alert</span>
              </div>
              <p className="text-text-secondary text-sm font-medium mb-1">Active Violations</p>
              <p className="text-4xl font-bold text-white tracking-tight">38</p>
            </div>

            <div className="bg-white/5 border border-white/10 p-6 rounded-sm">
              <h3 className="text-lg font-semibold tracking-wide mb-6 flex items-center justify-between">
                <span>Recent Reports</span>
                <span className="w-2 h-2 rounded-full bg-accent-amber animate-pulse"></span>
              </h3>

              <div className="flex flex-col gap-4">
                {violations.map((v) => (
                  <div key={v.id} className="flex flex-col gap-2 pb-4 border-b border-white/5 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-sm tracking-[0.1em] text-white/90 font-bold">{v.plate}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm flex items-center gap-1
                        ${v.status === 'notified' ? 'bg-blue-500/20 text-blue-400' :
                          v.status === 'towed' ? 'bg-red-500/20 text-red-400' :
                            'bg-green-500/20 text-green-400'}`}>
                        {v.status === 'resolved' ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {v.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-text-secondary">
                      <span>{v.location}</span>
                      <span>{v.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
