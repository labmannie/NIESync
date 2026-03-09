"use client";

import { motion } from "framer-motion";
import { Mail, MapPin, Phone, Send, MessageSquare } from "lucide-react";

export default function Contact() {
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
            <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">Full Name</label>
                  <input type="text" placeholder="John Doe" className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">NIE Email</label>
                  <input type="email" placeholder="john@nie.ac.in" className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">Subject</label>
                <input type="text" placeholder="Bug Report / Partnership Inquiry" className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-text-secondary">Transmission</label>
                <textarea rows={5} placeholder="Type your message securely..." className="w-full bg-black/40 border border-white/10 rounded-sm py-4 px-5 focus:outline-none focus:border-accent-blue/50 transition-colors text-white placeholder:text-white/20 font-medium resize-none"></textarea>
              </div>

              <button className="mt-4 bg-white text-campus-black font-bold uppercase tracking-widest text-sm py-5 clip-diagonal hover:bg-gray-200 transition-all duration-200 flex items-center justify-center gap-3 w-full sm:w-auto sm:px-12 sm:ml-auto">
                <Send className="w-4 h-4" />
                <span>Transmit Data</span>
              </button>
            </form>
          </motion.div>

        </div>
      </div>
    </main>
  );
}
