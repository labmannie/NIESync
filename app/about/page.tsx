"use client";

import { motion } from "framer-motion";
import { Shield, Layers, Users, Zap, Building2, BookOpen } from "lucide-react";

export default function About() {
  const stats = [
    { label: "Active Users", value: "2.4k+" },
    { label: "Items Recovered", value: "890+" },
    { label: "Violations Resolved", value: "1.2k+" },
    { label: "Campus Zones", value: "12" },
  ];

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-blue/30 pt-32 pb-24 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-blue/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent-amber/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-[1920px] mx-auto px-8 md:px-16 w-full relative z-10">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mb-24"
        >
          <div className="flex items-center gap-3 mb-6 bg-white/5 border border-white/10 w-fit px-4 py-1.5 rounded-full">
            <Shield className="w-4 h-4 text-accent-blue" />
            <span className="text-white/80 text-xs font-bold uppercase tracking-widest">About The Platform</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-8 leading-[0.95]">
            Redefining Campus <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue to-cyan-400">Logistics & Security</span>
          </h1>
          <p className="text-text-secondary text-lg md:text-xl max-w-2xl leading-relaxed font-medium">
            NIE Sync was born from a fundamental need: to replace fragmented, manual campus processes with a unified, digital ecosystem that empowers students and administration alike.
          </p>
        </motion.div>

        {/* Vision & Mission Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-32">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-card p-10 md:p-14 rounded-sm border border-white/10 relative group overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-accent-blue/50 group-hover:bg-accent-blue transition-colors" />
            <Building2 className="w-12 h-12 text-accent-blue mb-6" />
            <h2 className="text-3xl font-bold uppercase tracking-wide mb-4">Our Vision</h2>
            <p className="text-text-secondary leading-relaxed font-medium">
              To create a frictionless campus environment where every vehicle is authorized, every lost item finds its way home, and the entire student body operates in perfect synchronization through technology.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-card p-10 md:p-14 rounded-sm border border-white/10 relative group overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-accent-amber/50 group-hover:bg-accent-amber transition-colors" />
            <BookOpen className="w-12 h-12 text-accent-amber mb-6" />
            <h2 className="text-3xl font-bold uppercase tracking-wide mb-4">Our Mission</h2>
            <p className="text-text-secondary leading-relaxed font-medium">
              To provide a secure, authenticated, and blazing-fast platform exclusively for NIE institution members, utilizing modern gamification and rigorous verification to ensure a safe campus.
            </p>
          </motion.div>
        </div>

        {/* Stats Section */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="bg-[url('https://res.cloudinary.com/denudp7zb/image/upload/v1/abstract_dark_grid')] bg-cover bg-center border border-white/10 rounded-sm relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-campus-black/80 backdrop-blur-md" />
          <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-8 p-12 md:p-20 text-center divide-x divide-white/10">
            {stats.map((stat, i) => (
              <div key={i} className="flex flex-col items-center justify-center">
                <span className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2">{stat.value}</span>
                <span className="text-text-secondary text-xs md:text-sm font-bold uppercase tracking-widest">{stat.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </main>
  );
}
