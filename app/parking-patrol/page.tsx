import { Camera, AlertTriangle, CheckCircle, CarFront, FileWarning } from "lucide-react";

export default function ParkingPatrol() {
  const violations = [
    { id: 1, plate: "KA09 AB 1234", location: "Lot B (Faculty Only)", time: "10 mins ago", status: "notified" },
    { id: 2, plate: "DL04 CC 5678", location: "Fire Lane - Main Gate", time: "45 mins ago", status: "towed" },
    { id: 3, plate: "MH12 DE 9012", location: "Student Lot 4", time: "2 hours ago", status: "resolved" },
    { id: 4, plate: "KA01 XY 3344", location: "Handicap Spot (No Permit)", time: "3 hours ago", status: "notified" },
  ];

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-amber/30 flex flex-col">
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
            
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 border-2 border-dashed border-white/10 rounded-sm bg-white/5 hover:bg-white/10 hover:border-accent-amber/30 transition-all cursor-pointer">
              <div className="w-20 h-20 bg-accent-amber/10 rounded-full flex items-center justify-center mb-6">
                <CarFront className="w-10 h-10 text-accent-amber" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Report a Violation</h3>
              <p className="text-text-secondary max-w-sm mx-auto mb-8">
                Take a clear photo of the license plate and vehicle context to securely report unpermitted parking.
              </p>
              <button className="bg-white/10 text-white hover:bg-white/20 border border-white/20 font-medium px-8 py-3 rounded-sm transition-colors">
                Upload Photo manually
              </button>
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
