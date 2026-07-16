"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MapPin, Phone, Send, MessageSquare, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type FormState = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const INITIAL_FORM: FormState = { name: "", email: "", subject: "", message: "" };

export default function Contact() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setStatus("error");
      setErrorMessage("Please fill in every field before transmitting.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        setStatus("error");
        setErrorMessage(data?.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setForm(INITIAL_FORM);
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
  }

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-amber/30 pt-32 pb-24 relative overflow-hidden">
      
      {/* Background Abstract Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <div className="max-w-[1920px] mx-auto px-8 md:px-16 w-full relative z-10">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20 max-w-3xl mx-auto"
        >
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.95]">
            Secure <span className="text-accent-amber">Comms.</span>
          </h1>
          <p className="text-text-secondary text-lg leading-relaxed font-medium">
            Have a question about the platform, feedback on the verification flow, or an urgent institutional inquiry? Drop a secure line straight to the architects.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 max-w-6xl mx-auto">
          
          {/* Contact Info Sidebar */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-2 flex flex-col gap-6"
          >
            <div className="glass-card p-8 rounded-sm border border-white/10 flex items-start gap-5 hover:border-white/30 transition-colors">
              <div className="w-12 h-12 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-accent-blue" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-1 text-white">Headquarters</h3>
                <p className="text-text-secondary text-base font-medium">NIE Campus, Admin Block<br/>Mysuru, Karnataka 570008</p>
              </div>
            </div>

            <div className="glass-card p-8 rounded-sm border border-white/10 flex items-start gap-5 hover:border-white/30 transition-colors">
              <div className="w-12 h-12 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-accent-amber" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-1 text-white">Direct Email</h3>
                <p className="text-text-secondary text-base font-medium">sync.support@nie.ac.in<br/>founders@nie.ac.in</p>
              </div>
            </div>

            <div className="glass-card p-8 rounded-sm border border-white/10 flex items-start gap-5 hover:border-white/30 transition-colors">
              <div className="w-12 h-12 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Phone className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-1 text-white">Emergency Line</h3>
                <p className="text-text-secondary text-base font-medium">+91 98765 43210<br/>Available 9AM - 6PM IST</p>
              </div>
            </div>
          </motion.div>

          {/* Form Area */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="lg:col-span-3 glass-card p-10 md:p-14 rounded-sm border border-white/10"
          >
            {status === "success" ? (
              <div className="flex flex-col items-center text-center gap-4 py-10">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
                <h3 className="text-2xl font-bold">Message transmitted.</h3>
                <p className="text-text-secondary max-w-sm">
                  Thanks for reaching out — we&apos;ve received your message and will get back to you soon.
                </p>
                <button
                  onClick={() => setStatus("idle")}
                  className="mt-2 text-sm font-bold uppercase tracking-widest text-accent-blue hover:text-white transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">Full Name</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      maxLength={120}
                      required
                      className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">NIE Email</label>
                    <input
                      type="email"
                      placeholder="john@nie.ac.in"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      maxLength={254}
                      required
                      className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">Subject</label>
                  <input
                    type="text"
                    placeholder="Bug Report / Partnership Inquiry"
                    value={form.subject}
                    onChange={(e) => updateField("subject", e.target.value)}
                    maxLength={200}
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">Transmission</label>
                  <textarea
                    rows={5}
                    placeholder="Type your message securely..."
                    value={form.message}
                    onChange={(e) => updateField("message", e.target.value)}
                    maxLength={5000}
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium resize-none"
                  ></textarea>
                </div>

                {status === "error" && (
                  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-sm px-5 py-4 text-red-300 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="mt-4 bg-white text-campus-black font-bold uppercase tracking-widest text-sm py-5 clip-diagonal hover:bg-gray-200 transition-all duration-200 flex items-center justify-center gap-3 w-full sm:w-auto sm:px-12 sm:ml-auto disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transmitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Transmit Data</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>

        </div>
      </div>
    </main>
  );
}
