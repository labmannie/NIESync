"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, Clock, Tag, Plus, X, UploadCloud, ShieldAlert, CheckCircle2, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

// Default placeholder images for different types
const getPlaceholderImage = (type: string) => {
  switch (type.toLowerCase()) {
    case "electronics":
      return "/mocks/electronics.png";
    case "accessories":
      return "/mocks/accessories.png";
    case "books & stationery":
    case "books":
      return "/mocks/books.png";
    case "keys & ids":
    case "keys":
      return "/mocks/keys.png";
    default:
      return "/mocks/accessories.png";
  }
};

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " mins ago";
  return "just now";
}

type Report = {
  id: string;
  reporter_id: string;
  type: "lost" | "found";
  title: string;
  category: string;
  location: string;
  event_time: string;
  photo_url: string | null;
  additional_details: string;
  status: "active" | "resolved";
  is_deleted: boolean;
  share_name: boolean;
  created_at: string;
};

export default function LostAndFound() {
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [receivedClaims, setReceivedClaims] = useState<any[]>([]);
  const [myClaims, setMyClaims] = useState<any[]>([]);
  
  // UI State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "history">("feed");
  const [historySubTab, setHistorySubTab] = useState<"items" | "received_claims" | "my_claims">("items");
  const [filterType, setFilterType] = useState<"all" | "lost" | "found">("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form State
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<"lost" | "found">("lost");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [shareName, setShareName] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUser(data.user.id);
      }
    });

    fetchReports();

    const channel = supabase
      .channel("laf_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "lost_and_found_reports" }, () => {
        fetchReports();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchReports = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    const { data, error } = await supabase
      .from("lost_and_found_reports")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
      
    if (data) {
      setReports(data as Report[]);
    }

    if (userId) {
      const { data: rClaims } = await supabase
        .from("lost_and_found_claims")
        .select("*, lost_and_found_reports!inner(title, type, category), profiles!claimer_id(first_name, last_name)")
        .eq("lost_and_found_reports.reporter_id", userId)
        .order("created_at", { ascending: false });
      if (rClaims) setReceivedClaims(rClaims);

      const { data: mClaims } = await supabase
        .from("lost_and_found_claims")
        .select("*, lost_and_found_reports(title, type, category)")
        .eq("claimer_id", userId)
        .order("created_at", { ascending: false });
      if (mClaims) setMyClaims(mClaims);
    }
  };

  const handleClaimAction = async (claimId: string, action: "accepted" | "rejected") => {
    try {
      const res = await fetch("/api/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, status: action }),
      });
      if (res.ok) {
        fetchReports();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openForm = (report?: Report) => {
    if (report) {
      setEditingId(report.id);
      setFormType(report.type);
      setTitle(report.title);
      setCategory(report.category);
      // format for datetime-local
      const d = new Date(report.event_time);
      const iso = d.toISOString().slice(0, 16);
      setEventTime(iso);
      setLocation(report.location);
      setDetails(report.additional_details || "");
      setExistingPhotoUrl(report.photo_url);
      setShareName(report.share_name !== false);
    } else {
      setEditingId(null);
      setFormType("lost");
      setTitle("");
      setCategory("Electronics");
      setEventTime("");
      setLocation("");
      setDetails("");
      setExistingPhotoUrl(null);
      setShareName(true);
    }
    setPhotoFile(null);
    setSubmitted(false);
    setIsReportModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    
    // soft delete
    const { error } = await supabase
      .from("lost_and_found_reports")
      .update({ is_deleted: true })
      .eq("id", id);
      
    if (!error) {
      setReports(reports.filter(r => r.id !== id));
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      alert("You must be logged in to report an item.");
      return;
    }
    setSubmitting(true);

    let uploadedPhotoUrl = existingPhotoUrl;

    if (photoFile) {
      const ext = photoFile.name.split('.').pop();
      const filePath = `${currentUser}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { data, error: uploadError } = await supabase.storage.from('lost-and-found').upload(filePath, photoFile);
      
      if (data) {
        const { data: publicData } = supabase.storage.from('lost-and-found').getPublicUrl(data.path);
        uploadedPhotoUrl = publicData.publicUrl;
      } else {
        console.error("Upload error:", uploadError);
      }
    }

    const payload = {
      reporter_id: currentUser,
      type: formType,
      title,
      category,
      location,
      event_time: new Date(eventTime).toISOString(),
      additional_details: details,
      photo_url: uploadedPhotoUrl,
      share_name: shareName
    };

    if (editingId) {
      const { error } = await supabase
        .from("lost_and_found_reports")
        .update(payload)
        .eq("id", editingId);
        
      if (!error) {
        setSubmitted(true);
        setTimeout(() => setIsReportModalOpen(false), 2000);
      }
    } else {
      const { error } = await supabase
        .from("lost_and_found_reports")
        .insert([payload]);
        
      if (!error) {
        setSubmitted(true);
        setTimeout(() => setIsReportModalOpen(false), 2000);
      } else {
        console.error("Insert error:", error);
      }
    }
    setSubmitting(false);
  };

  // Filter items
  const filteredReports = reports.filter(r => {
    if (activeTab === "history" && r.reporter_id !== currentUser) return false;
    
    if (filterType !== "all" && r.type !== filterType) return false;
    
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      if (!r.title.toLowerCase().includes(lower) && !r.category.toLowerCase().includes(lower) && !r.location.toLowerCase().includes(lower)) {
        return false;
      }
    }
    
    return true;
  });

  // Calculate platform stats
  const activeReportsCount = reports.filter(r => r.type === 'lost' && r.status === 'active').length;
  const recoveredItemsCount = reports.filter(r => r.status === 'resolved').length;
  const successRate = activeReportsCount + recoveredItemsCount > 0 
    ? Math.round((recoveredItemsCount / (activeReportsCount + recoveredItemsCount)) * 100) 
    : 0;

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-blue/30 flex flex-col pt-28 pb-20 relative">
      <div className="relative z-10 flex flex-col flex-grow px-4 sm:px-6 md:px-12 pt-6 max-w-[1920px] mx-auto w-full">
        
        {/* Header Section */}
        <div className="brand-panel animate-enter-soft p-6 md:p-8 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-blue mb-4">
              <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse"></span>
              Campus Lost & Found
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-3">
              Lost & <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue to-cyan-400">Found</span>
            </h1>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              Report missing items or browse recently recovered property across the NIE campus. Authenticated students can claim items securely and instantly.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button 
              onClick={() => openForm()}
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#f5a623] px-6 text-sm font-bold text-black shadow-[0_14px_30px_rgba(245,166,35,0.22)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Report an Item
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-6 items-start">
          
          <div className="order-2 lg:order-1 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex gap-4">
                <button 
                  onClick={() => setActiveTab("feed")}
                  className={cn("text-lg font-bold uppercase tracking-widest transition-colors", activeTab === 'feed' ? "text-white" : "text-white/40 hover:text-white/70")}
                >
                  Community Feed
                </button>
                <button 
                  onClick={() => setActiveTab("history")}
                  className={cn("text-lg font-bold uppercase tracking-widest transition-colors", activeTab === 'history' ? "text-[#f5a623]" : "text-white/40 hover:text-white/70")}
                >
                  My History
                </button>
              </div>
              
              <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10 w-fit">
                <button onClick={() => setFilterType("all")} className={cn("text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-colors shadow-sm", filterType === 'all' ? "bg-white/10 text-white" : "text-white/50 hover:text-white")}>All</button>
                <button onClick={() => setFilterType("lost")} className={cn("text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-colors shadow-sm", filterType === 'lost' ? "bg-white/10 text-white" : "text-white/50 hover:text-white")}>Lost</button>
                <button onClick={() => setFilterType("found")} className={cn("text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition-colors shadow-sm", filterType === 'found' ? "bg-white/10 text-white" : "text-white/50 hover:text-white")}>Found</button>
              </div>
            </div>

            {activeTab === 'history' && (
              <div className="flex gap-2 mb-6 p-1 bg-black/40 rounded-xl border border-white/10 w-fit">
                <button onClick={() => setHistorySubTab("items")} className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-colors", historySubTab === 'items' ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white")}>My Items</button>
                <button onClick={() => setHistorySubTab("received_claims")} className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-colors", historySubTab === 'received_claims' ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white")}>Received Claims</button>
                <button onClick={() => setHistorySubTab("my_claims")} className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-colors", historySubTab === 'my_claims' ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white")}>My Claims</button>
              </div>
            )}

            {activeTab === 'feed' || (activeTab === 'history' && historySubTab === 'items') ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredReports.map((item) => (
                  <div key={item.id} className="brand-panel animate-enter-soft p-0 overflow-hidden group flex flex-col transition-all hover:border-white/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                    {/* Image Header */}
                    <div className="h-40 relative bg-black/50 border-b border-white/10 overflow-hidden">
                      <img src={item.photo_url || getPlaceholderImage(item.category)} alt={item.type} className={cn("w-full h-full transition-transform duration-500", !item.photo_url ? "object-contain p-4 opacity-95 group-hover:scale-110" : "object-cover group-hover:scale-105")} />
                      <div className="absolute top-3 left-3">
                        <span className={cn("text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border backdrop-blur-md shadow-lg", item.type === 'found' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30')}>
                          {item.type}
                        </span>
                      </div>
                      {/* Only show Edit/Delete in My History tab */}
                      {activeTab === "history" && (
                        <div className="absolute top-3 right-3 flex gap-2">
                          <button onClick={() => openForm(item)} className="p-2 bg-black/60 rounded-full border border-white/10 text-white hover:text-accent-blue hover:bg-black/80 transition-colors shadow-lg backdrop-blur-sm">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-2 bg-black/60 rounded-full border border-white/10 text-white hover:text-red-400 hover:bg-black/80 transition-colors shadow-lg backdrop-blur-sm">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-2">
                         <Link href={`/lost-and-found/item/${item.id}`} className="text-[17px] font-black tracking-wide text-white group-hover:text-accent-blue transition-colors truncate pr-2">
                          {item.title}
                        </Link>
                        <span className="text-white/40 text-[10px] font-medium whitespace-nowrap flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(item.created_at)}
                        </span>
                      </div>
                      
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-2 text-white/60 text-sm font-medium">
                          <MapPin className="w-4 h-4 opacity-70" />
                          <span className="truncate">{item.location}</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/60 text-sm font-medium">
                          <Tag className="w-4 h-4 opacity-70" />
                          <span>{item.category}</span>
                        </div>
                      </div>
                      
                      {activeTab === "feed" && (
                        <Link href={`/lost-and-found/item/${item.id}`} className={cn("w-full mt-6 h-11 text-xs font-bold uppercase tracking-widest rounded-xl border transition-all duration-200 flex items-center justify-center gap-2", item.type === 'found' ? 'bg-accent-blue border-accent-blue/50 text-white hover:bg-blue-600 hover:shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20')}>
                          {item.type === 'found' ? 'Claim Property' : 'I Found This'}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
                {filteredReports.length === 0 && (
                  <div className="col-span-full py-20 flex flex-col justify-center items-center opacity-60">
                    <Search className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-bold text-lg">No reports found.</p>
                    <p className="text-sm">Try adjusting your filters or checking back later.</p>
                  </div>
                )}
              </div>
            ) : historySubTab === 'received_claims' ? (
              <div className="brand-panel p-0 overflow-hidden">
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full text-left text-sm min-w-[600px]">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Item</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Claimer</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Message</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Status</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {receivedClaims.map(claim => (
                        <tr key={claim.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-4">
                            <Link href={`/lost-and-found/item/${claim.report_id}`} className="font-bold text-white hover:text-accent-blue transition-colors">
                              {claim.lost_and_found_reports?.title}
                            </Link>
                            <div className="text-[10px] font-bold tracking-widest uppercase text-white/40 mt-1">{claim.lost_and_found_reports?.type}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-white">{claim.profiles ? `${claim.profiles.first_name || ''} ${claim.profiles.last_name || ''}`.trim() : "User"}</div>
                            {claim.phone_number && <div className="text-xs text-white/50">Ph: {claim.phone_number}</div>}
                          </td>
                          <td className="p-4 max-w-[200px] text-white/70">
                            {claim.message || "No message"}
                          </td>
                          <td className="p-4">
                            <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", 
                              claim.status === 'pending' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : 
                              claim.status === 'accepted' ? "bg-green-500/20 text-green-400 border border-green-500/30" : 
                              "bg-red-500/20 text-red-400 border border-red-500/30"
                            )}>
                              {claim.status}
                            </span>
                          </td>
                          <td className="p-4">
                            {claim.status === 'pending' && (
                              <div className="flex gap-2">
                                <button onClick={() => handleClaimAction(claim.id, 'accepted')} className="px-3 py-1.5 bg-green-500 text-black text-xs font-bold rounded-lg hover:bg-green-400 transition-colors shadow-lg">Accept</button>
                                <button onClick={() => handleClaimAction(claim.id, 'rejected')} className="px-3 py-1.5 bg-transparent border border-red-500 text-red-500 text-xs font-bold rounded-lg hover:bg-red-500/10 transition-colors">Reject</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {receivedClaims.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-white/40 font-medium">No claims received yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="brand-panel p-0 overflow-hidden">
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full text-left text-sm min-w-[600px]">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Item</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Your Message</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Status</th>
                        <th className="p-4 text-white/60 font-bold uppercase tracking-wider text-xs">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {myClaims.map(claim => (
                        <tr key={claim.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-4">
                            <Link href={`/lost-and-found/item/${claim.report_id}`} className="font-bold text-white hover:text-accent-blue transition-colors">
                              {claim.lost_and_found_reports?.title}
                            </Link>
                            <div className="text-[10px] font-bold tracking-widest uppercase text-white/40 mt-1">{claim.lost_and_found_reports?.type}</div>
                          </td>
                          <td className="p-4 max-w-[200px] text-white/70">
                            {claim.message || "No message"}
                          </td>
                          <td className="p-4">
                            <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", 
                              claim.status === 'pending' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : 
                              claim.status === 'accepted' ? "bg-green-500/20 text-green-400 border border-green-500/30" : 
                              "bg-red-500/20 text-red-400 border border-red-500/30"
                            )}>
                              {claim.status}
                            </span>
                          </td>
                          <td className="p-4 text-white/50">
                            {new Date(claim.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {myClaims.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-12 text-center text-white/40 font-medium">You haven't submitted any claims.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          
          <div className="order-1 lg:order-2">
            <div className="brand-panel animate-enter-soft p-5 lg:sticky lg:top-28">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 mb-4">
                Explore Items
              </h3>
              
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, location..." 
                    className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-sm font-medium placeholder:text-white/30 text-white transition-colors"
                  />
                </div>
                
                <div className="surface-elevated rounded-[20px] p-4 border border-white/5 mt-6">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#f5a623] mb-3 flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Platform Stats
                  </p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/60 font-medium">Items Recovered</span>
                      <span className="font-mono font-black text-white">{recoveredItemsCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/60 font-medium">Active Lost Reports</span>
                      <span className="font-mono font-black text-white">{activeReportsCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/60 font-medium">Success Rate</span>
                      <span className="font-mono font-black text-green-400">{successRate}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>

      {/* Report/Edit Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="brand-panel animate-enter-soft relative flex max-h-[95dvh] w-full max-w-[600px] flex-col overflow-hidden sm:rounded-[2rem] rounded-b-none border-b-0 sm:border-b">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 bg-white/[0.02]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  {editingId ? "Modify Report" : "Incident Reporting"}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white mb-2">
                  {editingId ? "Edit Details" : "Report an Item"}
                </h2>
                
                {/* Type Toggle */}
                {!editingId && (
                  <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-fit mt-3">
                    <button 
                      onClick={() => setFormType("lost")}
                      className={cn("text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg transition-all", formType === 'lost' ? 'bg-[#f5a623] text-black shadow-md' : 'text-white/50 hover:text-white')}
                    >
                      I Lost Something
                    </button>
                    <button 
                      onClick={() => setFormType("found")}
                      className={cn("text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg transition-all", formType === 'found' ? 'bg-green-500 text-black shadow-md' : 'text-white/50 hover:text-white')}
                    >
                      I Found Something
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsReportModalOpen(false)}
                className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="thin-scrollbar flex-1 overflow-y-auto px-6 py-6 border-b border-white/5">
              {submitted ? (
                 <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center text-green-400 mb-4 animate-in zoom-in">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Report {editingId ? "Updated" : "Submitted"}!</h3>
                    <p className="text-white/60 text-sm max-w-sm">
                       Your report has been successfully processed on the campus registry.
                    </p>
                 </div>
              ) : (
                <form id="report-form" onSubmit={handleReportSubmit} className="space-y-6">
                  
                  <div className="space-y-4">
                    <label className="block">
                      <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2 mt-1">Item Title</span>
                      <input 
                        required
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={formType === 'lost' ? "e.g. Blue Hydroflask" : "e.g. Set of car keys"}
                        className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2 mt-1">Category</span>
                        <select 
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white/90 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22currentColor%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.293%207.293a1%201%200%20011.414%200L10%2010.586l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_1rem_center] bg-[size:1.5em]"
                        >
                          <option className="bg-campus-black">Electronics</option>
                          <option className="bg-campus-black">Accessories</option>
                          <option className="bg-campus-black">Books & Stationery</option>
                          <option className="bg-campus-black">Keys & IDs</option>
                          <option className="bg-campus-black">Other</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2 mt-1">Date/Time</span>
                        <input 
                          required
                          type="datetime-local" 
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                          className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white/90 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2 mt-1">
                        {formType === 'lost' ? "Last Known Location" : "Found Location"}
                      </span>
                      <input 
                        required
                        type="text" 
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g. Golden Jubilee Block, 3rd Floor"
                        className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30"
                      />
                    </label>

                    <div className="pt-2">
                       <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2 mt-1">Attach Photo (Optional)</span>
                       <label className="flex flex-col items-center justify-center w-full min-h-[8rem] rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all cursor-pointer relative overflow-hidden group">
                          {photoFile || existingPhotoUrl ? (
                            <img 
                               src={photoFile ? URL.createObjectURL(photoFile) : existingPhotoUrl!} 
                               alt="Preview" 
                               className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" 
                            />
                          ) : (
                            <>
                              <UploadCloud className="w-8 h-8 text-white/40 mb-2" />
                              <span className="text-sm font-semibold text-white/70">Tap to upload a photo</span>
                              <span className="text-xs text-white/40 mt-1">PNG, JPG up to 5MB</span>
                            </>
                          )}
                          <input 
                            type="file" 
                            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                            className="hidden" 
                            accept="image/*" 
                          />
                       </label>
                    </div>
                    
                    <label className="block pt-2">
                      <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2 mt-1">Additional Details</span>
                      <textarea 
                        rows={3}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Any distinct features or identifiers..."
                        className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30 resize-none"
                      />
                    </label>

                    <label className="flex items-center gap-3 pt-2 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={shareName}
                          onChange={(e) => setShareName(e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="w-10 h-6 bg-white/10 rounded-full peer-checked:bg-accent-blue transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                      </div>
                      <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">
                        Share my name with this report
                      </span>
                    </label>
                  </div>

                </form>
              )}
            </div>
            
            {/* Modal Footer */}
            {!submitted && (
              <div className="p-6 bg-black/40 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-6 py-3 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-white hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="report-form"
                  disabled={submitting}
                  className={cn("px-8 py-3 rounded-2xl text-sm font-bold shadow-lg transition-transform hover:translate-y-[-1px] flex items-center justify-center gap-2", formType === 'lost' ? 'bg-[#f5a623] text-black shadow-[#f5a623]/20' : 'bg-green-500 text-black shadow-green-500/20', submitting && "opacity-80 scale-95")}
                >
                  {submitting ? (editingId ? "Updating..." : "Submitting...") : (editingId ? "Update Details" : "Submit Report")}
                </button>
              </div>
            )}
            
          </div>
        </div>
      )}
    </main>
  );
}
