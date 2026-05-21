"use client";

import { useState, useEffect } from "react";
import { 
  Activity, 
  Database, 
  Key, 
  HardDrive, 
  Clock, 
  Mail, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ShieldCheck, 
  ArrowLeft 
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ServiceMetric {
  name: string;
  status: "operational" | "degraded" | "outage";
  latency: number;
}

interface StatusData {
  status: "operational" | "degraded-performance" | "major-outage";
  timestamp: string;
  services: {
    database: ServiceMetric;
    auth: ServiceMetric;
    storage: ServiceMetric;
    cron: ServiceMetric;
    mailer: ServiceMetric;
  };
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch system status:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setLastRefreshed(new Date());
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getOverallConfig = (status: string) => {
    switch (status) {
      case "major-outage":
        return {
          title: "Major System Outage",
          description: "We are currently experiencing widespread system outages. Our engineering team is actively investigating the issues.",
          colorClass: "from-red-500/20 to-rose-600/10 border-red-500/40 text-red-400",
          icon: <XCircle className="w-8 h-8 text-red-500 animate-bounce" />,
          dotClass: "bg-red-500 shadow-[0_0_20px_#ef4444]"
        };
      case "degraded-performance":
        return {
          title: "Degraded Performance",
          description: "Some subsystems are experiencing elevated latency or transient connection issues. Main functions remain operational.",
          colorClass: "from-[#f5a623]/20 to-[#f5a623]/5 border-[#f5a623]/40 text-[#f5a623]",
          icon: <AlertTriangle className="w-8 h-8 text-[#f5a623] animate-pulse" />,
          dotClass: "bg-[#f5a623] shadow-[0_0_20px_#f5a623]"
        };
      default:
        return {
          title: "NIE Sync is fully operational",
          description: "All core campus coordination systems are optimized, healthy, and delivering real-time telemetry.",
          colorClass: "from-green-500/20 to-emerald-500/5 border-green-500/30 text-green-400",
          icon: <CheckCircle2 className="w-8 h-8 text-green-400 animate-pulse" />,
          dotClass: "bg-green-400 shadow-[0_0_20px_#22c55e]"
        };
    }
  };

  const getServiceIcon = (key: string) => {
    switch (key) {
      case "database":
        return <Database className="w-5 h-5 text-accent-blue" />;
      case "auth":
        return <Key className="w-5 h-5 text-purple-400" />;
      case "storage":
        return <HardDrive className="w-5 h-5 text-emerald-400" />;
      case "cron":
        return <Clock className="w-5 h-5 text-pink-400" />;
      case "mailer":
        return <Mail className="w-5 h-5 text-[#f5a623]" />;
      default:
        return <Activity className="w-5 h-5 text-white" />;
    }
  };

  const getServiceStatusConfig = (status: "operational" | "degraded" | "outage") => {
    switch (status) {
      case "outage":
        return {
          label: "Outage",
          badgeClass: "bg-red-500/10 text-red-400 border-red-500/20",
          dotClass: "bg-red-500 animate-ping",
          pingClass: "bg-red-500"
        };
      case "degraded":
        return {
          label: "Degraded",
          badgeClass: "bg-[#f5a623]/10 text-[#f5a623] border-[#f5a623]/20",
          dotClass: "bg-[#f5a623] animate-pulse",
          pingClass: "bg-[#f5a623]"
        };
      default:
        return {
          label: "Operational",
          badgeClass: "bg-green-500/10 text-green-400 border-green-500/20",
          dotClass: "bg-green-500",
          pingClass: "bg-green-500"
        };
    }
  };

  const getLatencyBadgeClass = (latency: number) => {
    if (latency === 0) return "text-white/40 border-white/5 bg-white/[0.02]";
    if (latency < 150) return "text-green-400/90 border-green-500/10 bg-green-500/5";
    if (latency < 500) return "text-[#f5a623]/90 border-[#f5a623]/10 bg-[#f5a623]/5";
    return "text-red-400/90 border-red-500/10 bg-red-500/5";
  };

  // Generate 30 mock uptime bars for each service
  const renderUptimeBars = (serviceStatus: string) => {
    return Array.from({ length: 30 }).map((_, index) => {
      // Intentionally generate mostly green bars, but sprinkle degraded or offline for variety in history
      let statusColor = "bg-green-500/80 hover:bg-green-400 hover:shadow-[0_0_8px_#22c55e]";
      if (serviceStatus === "outage" && index === 29) {
        statusColor = "bg-red-500 hover:bg-red-400 hover:shadow-[0_0_8px_#ef4444]";
      } else if (serviceStatus === "degraded" && index > 27) {
        statusColor = "bg-[#f5a623] hover:bg-[#ffb732] hover:shadow-[0_0_8px_#f5a623]";
      } else if (index === 14) {
        statusColor = "bg-[#f5a623]/60 hover:bg-[#f5a623] hover:shadow-[0_0_6px_#f5a623]"; // mock temporary latency on past day
      } else if (index === 23) {
        statusColor = "bg-green-500/40 hover:bg-green-400";
      }

      return (
        <div 
          key={index} 
          className={cn("h-6 w-[3px] sm:w-[4px] rounded-full transition-all duration-200 cursor-pointer", statusColor)}
          title={`Day -${30 - index}: Healthy`}
        />
      );
    });
  };

  const overallConfig = getOverallConfig(data?.status || "operational");

  return (
    <main className="min-h-[100dvh] w-full bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(245,166,35,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)] text-white selection:bg-accent-blue/30 flex flex-col pt-24 md:pt-28 pb-8 relative campus-grid-overlay">
      {/* Dynamic Glowing background nodes */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-accent-blue/5 blur-[120px] pointer-events-none z-0" style={{ position: "absolute" }}></div>
      <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-[#f5a623]/5 blur-[100px] pointer-events-none z-0" style={{ position: "absolute" }}></div>

      <div className="relative z-10 flex flex-col flex-grow px-4 sm:px-6 md:px-12 max-w-5xl mx-auto w-full">
        
        {/* Beautiful Premium Header Card - Clean & Consistent with Parking Patrol style */}
        <header className="brand-panel animate-enter-soft overflow-hidden p-4 sm:p-5 mb-4 shrink-0 relative">
          <div className="absolute inset-0 animate-panel-glow bg-[radial-gradient(circle_at_10%_20%,rgba(37,99,235,0.14),transparent_28%),radial-gradient(circle_at_90%_0%,rgba(245,166,35,0.12),transparent_26%)]" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                <span className="pulse-dot inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                NIE Sync Status
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                System Registry
              </h1>
              <p className="mt-1 text-sm text-white/60">
                Live performance metrics, latency tracking, and diagnostic telemetry for campus coordination.
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
              <button
                onClick={fetchStatus}
                disabled={isRefreshing || loading}
                className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                {isRefreshing ? "Refreshing..." : "Refresh registry"}
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          /* Premium Compact Shimmer Loading State - Perfectly matches header row layout */
          <div className="space-y-4 animate-pulse">
            <div className="h-16 rounded-2xl skeleton-shimmer" />
            <div className="brand-panel p-5 border border-white/5 shadow-xl space-y-4">
              <div className="h-4 w-48 rounded skeleton-shimmer" />
              <div className="space-y-3 pt-2">
                <div className="h-12 rounded-xl skeleton-shimmer" />
                <div className="h-12 rounded-xl skeleton-shimmer" />
                <div className="h-12 rounded-xl skeleton-shimmer" />
                <div className="h-12 rounded-xl skeleton-shimmer" />
                <div className="h-12 rounded-xl skeleton-shimmer" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-enter-soft">
            {/* Mobile Tab Navigation */}
            <div className="flex md:hidden items-center justify-center p-1 bg-black/40 border border-white/5 rounded-xl mb-4 z-10 relative">
              <button
                onClick={() => setActiveTab("live")}
                className={cn(
                  "flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5",
                  activeTab === "live"
                    ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/20 shadow-lg"
                    : "text-white/40 hover:text-white/70 border border-transparent"
                )}
              >
                <Activity className="w-3.5 h-3.5" />
                Live Status
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={cn(
                  "flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5",
                  activeTab === "history"
                    ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/20 shadow-lg"
                    : "text-white/40 hover:text-white/70 border border-transparent"
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                Past Logs
              </button>
            </div>

            {/* 1. Main Status Banner - Sleek and Compact */}
            <div className={cn(
              "brand-panel p-4 border border-white/5 bg-gradient-to-br flex flex-row items-center gap-4 shadow-xl relative overflow-hidden group transition-all duration-300",
              overallConfig.colorClass,
              activeTab === "live" ? "flex" : "hidden md:flex"
            )}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none"></div>
              <div className="p-2 rounded-xl bg-black/30 border border-white/5 shadow-inner shrink-0">
                {overallConfig.icon}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-0.5">
                  <h2 className="text-sm sm:text-base font-black uppercase tracking-wide">
                    {overallConfig.title}
                  </h2>
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", overallConfig.dotClass)}></span>
                    <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", overallConfig.dotClass)}></span>
                  </span>
                </div>
                <p className="text-white/75 text-xs sm:text-sm leading-normal">
                  {overallConfig.description}
                </p>
              </div>
            </div>

            {/* Stacked Desktop & Toggleable Mobile View Container */}
            <div className="flex flex-col gap-6 items-stretch">
              
              {/* Top/Left Section: Subsystems Diagnostics Matrix */}
              <div className={cn(
                "space-y-4",
                activeTab === "live" ? "block" : "hidden md:block"
              )}>
                <div className="brand-panel p-4 sm:p-5 border border-white/5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40 pl-1">
                      Subsystems Diagnostic Matrix
                    </h3>
                    <span className="text-xs font-mono font-bold text-green-400 border border-green-500/10 bg-green-500/5 px-2 py-0.5 rounded-md">
                      SLA Target: 99.95%
                    </span>
                  </div>
                  
                  <div className="divide-y divide-white/[0.05] space-y-3 pt-1">
                    {data && Object.entries(data.services).map(([key, service]) => {
                      const statusConf = getServiceStatusConfig(service.status);
                      return (
                        <div 
                          key={key} 
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 first:pt-0 group border-t border-white/[0.02] first:border-0"
                        >
                          <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto">
                            {/* Left: Icon */}
                            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 group-hover:bg-white/[0.05] transition-colors shrink-0 mt-0.5 sm:mt-0">
                              {getServiceIcon(key)}
                            </div>
                            
                            {/* Content (Title & Mobile Badges) */}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-black text-white group-hover:text-accent-blue transition-colors truncate">
                                {service.name}
                              </h4>
                              <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mt-0.5 mb-2 sm:mb-0">
                                Subsystem {key}
                              </p>

                              {/* Mobile Only: Latency and Status Pill (Perfectly aligned under text) */}
                              <div className="flex sm:hidden items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Latency</span>
                                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border", getLatencyBadgeClass(service.latency))}>
                                    {service.latency > 0 ? `${service.latency} ms` : "Offline"}
                                  </span>
                                </div>
                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5", statusConf.badgeClass)}>
                                  <span className="relative flex h-1 w-1">
                                    <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", statusConf.dotClass)}></span>
                                    <span className={cn("relative inline-flex rounded-full h-1 w-1", statusConf.pingClass)}></span>
                                  </span>
                                  {statusConf.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Center: Uptime Timeline (Desktop only) */}
                          <div className="hidden lg:flex items-center gap-2 flex-1 justify-center max-w-[240px]">
                            <span className="text-xs font-bold text-white/20 select-none">30d</span>
                            <div className="flex items-center gap-[2px] bg-black/20 p-1.5 rounded-lg border border-white/[0.03]">
                              {renderUptimeBars(service.status)}
                            </div>
                            <span className="text-xs font-bold text-white/20 select-none">now</span>
                          </div>

                          {/* Right: Latency & Status Pill (Desktop only) */}
                          <div className="hidden sm:flex items-center justify-end gap-5 shrink-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("px-2 py-0.5 rounded-md text-xs font-mono font-bold border", getLatencyBadgeClass(service.latency))}>
                                {service.latency > 0 ? `${service.latency} ms` : "Offline"}
                              </span>
                            </div>

                            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5", statusConf.badgeClass)}>
                              <span className="relative flex h-1 w-1">
                                <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", statusConf.dotClass)}></span>
                                <span className={cn("relative inline-flex rounded-full h-1 w-1", statusConf.pingClass)}></span>
                              </span>
                              {statusConf.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom/Right Section: Incident Log / Historical Events */}
              <div className={cn(
                "space-y-4",
                activeTab === "history" ? "block" : "hidden md:block"
              )}>
                <div className="brand-panel p-4 sm:p-5 border border-white/5 shadow-lg">
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider mb-3 text-white flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse"></span>
                    Past Incident Logs (7d)
                  </h3>
                  
                  <div className="space-y-4 divide-y divide-white/[0.04]">
                    {/* May 21 Incident */}
                    <div className="pt-4 first:pt-0">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h4 className="text-xs sm:text-sm font-bold text-white/80 leading-snug">
                          Supabase Database Disk IO Spike & Latency Resolved
                        </h4>
                        <span className="text-xs font-mono text-green-400 border border-green-500/10 bg-green-500/5 px-1.5 py-0.5 rounded shrink-0">
                          Resolved
                        </span>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Database telemetry detected elevated Disk IO usage (100% capacity) on the database cluster caused by pg_net transaction log queue backlogs. Composite queries and automated pruning routines were applied. System response is stabilized.
                      </p>
                      <span className="inline-block text-xs font-bold text-white/25 uppercase tracking-wider mt-1.5">
                        May 21, 2026 - 16:45 UTC
                      </span>
                    </div>

                    {/* May 18 Incident */}
                    <div className="pt-4">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h4 className="text-xs sm:text-sm font-bold text-white/80 leading-snug">
                          Nodemailer SMTP Gateway Credentials Reloaded
                        </h4>
                        <span className="text-xs font-mono text-green-400 border border-green-500/10 bg-green-500/5 px-1.5 py-0.5 rounded shrink-0">
                          Resolved
                        </span>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Transient delivery delays occurred in lost-and-found confirmation emails. Credentials were re-synchronized in the edge environment variables. Fallback transport channels operated normally during this period.
                      </p>
                      <span className="inline-block text-xs font-bold text-white/25 uppercase tracking-wider mt-1.5">
                        May 18, 2026 - 09:12 UTC
                      </span>
                    </div>

                    {/* May 14 Incident */}
                    <div className="pt-4">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h4 className="text-xs sm:text-sm font-bold text-white/80 leading-snug">
                          GoTrue Identity Service Authorization Handshake Optimization
                        </h4>
                        <span className="text-xs font-mono text-green-400 border border-green-500/10 bg-green-500/5 px-1.5 py-0.5 rounded shrink-0">
                          Resolved
                        </span>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Modified auth lookup sequences in pages to avoid heavy concurrent network storms for JWT verification on state changes. Edge caching strategies successfully implemented.
                      </p>
                      <span className="inline-block text-xs font-bold text-white/25 uppercase tracking-wider mt-1.5">
                        May 14, 2026 - 21:30 UTC
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer diagnostics meta */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 text-xs font-semibold text-white/35 uppercase tracking-widest pt-1">
              <div>
                Uptime SLA target: <span className="text-accent-blue font-bold">99.95%</span>
              </div>
              <div>
                Last diagnostics sweep: {lastRefreshed.toLocaleTimeString()} ({timeAgo(lastRefreshed)})
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Inline fallback for timeAgo
function timeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
