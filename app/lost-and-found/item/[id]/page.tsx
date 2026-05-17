"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { CheckCircle2, ChevronLeft, MapPin, Clock, User, Tag, ShieldAlert } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

// Default placeholder images for different types
const getPlaceholderImage = (type: string, category: string) => {
  switch (category.toLowerCase()) {
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

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const itemId = unwrappedParams.id;
  
  const supabase = createClient();
  const router = useRouter();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Claim Modal states
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [claimPhone, setClaimPhone] = useState("");
  const [submittingClaim, setSubmittingClaim] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUser(data.user);
      }
    });

    async function fetchItem() {
      try {
        const { data, error: fetchError } = await supabase
          .from("lost_and_found_reports")
          .select("*, profiles!reporter_id(first_name, last_name)")
          .eq("id", itemId)
          .eq("is_deleted", false)
          .single();

        if (fetchError || !data) {
          setError("Item not found");
        } else {
          setItem(data);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchItem();
  }, [itemId, supabase]);

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setClaimError("You must be logged in to claim an item.");
      return;
    }
    setSubmittingClaim(true);
    setClaimError("");

    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, message: claimMessage, phone: claimPhone }),
      });
      const data = await res.json();
      if (data.success) {
        setClaimSuccess(true);
        setClaimMessage("");
        setClaimPhone("");
      } else {
        setClaimError(data.error || "Failed to submit claim. You might have already claimed this item.");
      }
    } catch (err: any) {
      setClaimError(err.message);
    } finally {
      setSubmittingClaim(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-campus-black text-white flex items-center justify-center pt-28 pb-20">
      <div className="w-8 h-8 rounded-full border-2 border-accent-blue border-t-transparent animate-spin"></div>
    </div>
  );

  if (!item) return (
    <div className="min-h-screen bg-campus-black text-white flex flex-col items-center justify-center pt-28 pb-20 px-6">
      <ShieldAlert className="w-16 h-16 text-red-500 mb-4 opacity-80" />
      <h2 className="text-2xl font-black mb-2">{error || "Item not found"}</h2>
      <p className="text-white/60 mb-6">This item may have been deleted or resolved.</p>
      <button onClick={() => router.back()} className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors font-bold">
        Go Back
      </button>
    </div>
  );

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-blue/30 flex flex-col pt-28 pb-20 relative">
      <div className="relative z-10 flex flex-col flex-grow px-4 sm:px-6 md:px-12 max-w-5xl mx-auto w-full">
        
        <button 
          onClick={() => router.back()} 
          className="group flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-8 w-fit"
        >
          <div className="p-2 rounded-xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold uppercase tracking-widest">Back to Hub</span>
        </button>

        <div className="brand-panel animate-enter-soft p-0 overflow-hidden flex flex-col md:flex-row shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {/* Image Section */}
          <div className="w-full md:w-1/2 relative bg-black border-r border-white/10 min-h-[300px] md:min-h-[500px] flex items-center justify-center overflow-hidden">
            <img
              src={item.photo_url || getPlaceholderImage(item.type, item.category)}
              alt={item.title}
              className={cn("w-full h-full object-cover transition-transform duration-700 hover:scale-105", !item.photo_url && "opacity-80 p-8 object-contain")}
            />
            <div className="absolute top-4 left-4 flex gap-2">
              <span className={cn("text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border backdrop-blur-md shadow-lg", item.type === 'found' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30')}>
                {item.type}
              </span>
              {item.status === 'resolved' && (
                <span className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-accent-blue/30 bg-accent-blue/20 text-accent-blue backdrop-blur-md shadow-lg">
                  Resolved
                </span>
              )}
            </div>
          </div>

          {/* Details Section */}
          <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col">
            <div className="flex-1">
              <span className="inline-block px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold uppercase tracking-widest mb-4">
                {item.category}
              </span>
              
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight mb-4 tracking-tight">
                {item.title}
              </h1>
              
              <p className="text-white/70 leading-relaxed mb-8 text-sm md:text-base whitespace-pre-wrap">
                {item.additional_details || "No additional details provided."}
              </p>

              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="p-2.5 rounded-xl bg-accent-blue/10 text-accent-blue border border-accent-blue/20 shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Location</p>
                    <p className="text-sm font-medium text-white/90">{item.location}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Time Reported</p>
                    <p className="text-sm font-medium text-white/90">
                      {new Date(item.event_time).toLocaleString("en-GB", { 
                        day: "2-digit", month: "long", year: "numeric", 
                        hour: "2-digit", minute: "2-digit", hour12: true 
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Reported By</p>
                    <p className="text-sm font-medium text-white/90">{(item.share_name !== false) && item.profiles ? `${item.profiles.first_name || ''} ${item.profiles.last_name || ''}`.trim() || "Anonymous User" : "Anonymous User"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto">
              <button 
                onClick={() => setShowClaimModal(true)}
                disabled={item.status === 'resolved' || currentUser?.id === item.reporter_id}
                className={cn(
                  "w-full h-14 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-xl",
                  item.status === 'resolved' ? "bg-white/10 text-white/40 cursor-not-allowed" 
                  : currentUser?.id === item.reporter_id ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : item.type === 'found' ? "bg-accent-blue text-white hover:bg-blue-600 hover:shadow-[0_0_30px_rgba(37,99,235,0.4)] hover:scale-[1.02]" 
                  : "bg-[#f5a623] text-black hover:bg-[#ffb732] hover:shadow-[0_0_30px_rgba(245,166,35,0.4)] hover:scale-[1.02]"
                )}
              >
                {item.status === 'resolved' ? 'Resolved' 
                 : currentUser?.id === item.reporter_id ? 'Your Item'
                 : item.type === 'found' ? 'Claim This Item' : 'Respond to Report'}
              </button>
              {currentUser?.id === item.reporter_id && item.status !== 'resolved' && (
                <p className="text-center text-xs text-white/40 mt-3 font-medium">You reported this item. Track claims in your dashboard.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Claim Modal */}
      {showClaimModal && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="brand-panel animate-enter-soft relative flex max-h-[95dvh] w-full max-w-[500px] flex-col overflow-hidden sm:rounded-[2rem] rounded-b-none border-b-0 sm:border-b">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 bg-white/[0.02]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                  {item.type === 'lost' ? "Contact Reporter" : "Verify Ownership"}
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">
                  {item.type === 'lost' ? "I Found This Item" : "Claim This Item"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !submittingClaim && setShowClaimModal(false)}
                className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="thin-scrollbar flex-1 overflow-y-auto px-6 py-6">
              {claimSuccess ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center text-green-400 mb-6 animate-in zoom-in">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3">Message Sent!</h3>
                  <p className="text-white/60 text-sm max-w-sm mb-8 leading-relaxed">
                    The original reporter has been notified via email. They will review your message and contact you shortly.
                  </p>
                  <button 
                    onClick={() => { setShowClaimModal(false); router.push("/lost-and-found"); }}
                    className="px-8 py-3.5 rounded-2xl bg-white text-black font-bold text-sm shadow-lg hover:bg-white/90 transition-colors"
                  >
                    Back to Hub
                  </button>
                </div>
              ) : (
                <form id="claim-form" onSubmit={handleClaimSubmit} className="space-y-6">
                  {!currentUser && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                      Please log in to claim or respond to items.
                    </div>
                  )}
                  {claimError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                      {claimError}
                    </div>
                  )}
                  
                  <p className="text-sm text-white/60 leading-relaxed mb-6">
                    {item.type === 'lost' 
                      ? "If you have found this item, please leave a message and your contact info so the owner can reach you to collect it." 
                      : "To claim this item, please provide specific identifying details (like a scratch, contents, or serial number) to prove ownership."}
                  </p>

                  <div className="space-y-4">
                    <label className="block">
                      <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2">Your Message</span>
                      <textarea
                        required
                        rows={4}
                        placeholder={item.type === 'lost' ? "I found this item near the library cafe..." : "This is mine, it has a blue sticker on the back..."}
                        value={claimMessage}
                        onChange={e => setClaimMessage(e.target.value)}
                        className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30 resize-none"
                      />
                    </label>

                    <label className="block">
                      <span className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2">
                        Contact Phone <span className="font-normal opacity-70">(Optional)</span>
                      </span>
                      <input
                        type="tel"
                        placeholder="Your phone number"
                        value={claimPhone}
                        onChange={e => setClaimPhone(e.target.value)}
                        className="focus-ring w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30"
                      />
                    </label>
                  </div>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            {!claimSuccess && (
              <div className="p-6 bg-black/40 flex justify-end gap-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="px-6 py-3 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-white hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="claim-form"
                  disabled={submittingClaim || !currentUser}
                  className={cn(
                    "px-8 py-3 rounded-2xl text-sm font-bold shadow-lg transition-transform flex items-center justify-center gap-2",
                    item.type === 'found' ? "bg-accent-blue text-white shadow-accent-blue/20 hover:bg-blue-600" : "bg-[#f5a623] text-black shadow-[#f5a623]/20 hover:bg-[#ffb732]",
                    (submittingClaim || !currentUser) && "opacity-60 cursor-not-allowed scale-95"
                  )}
                >
                  {submittingClaim ? "Sending..." : "Send Message"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
