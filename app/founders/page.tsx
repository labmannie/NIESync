"use client";

import { motion } from "framer-motion";
import { Github, Linkedin, Mail, Code2, Terminal, Shield, Database } from "lucide-react";
import Image from "next/image";

export default function Founders() {
  const founders = [
    {
      name: "Shreyas J",
      role: "Lead Architect & Full-Stack Eng.",
      bio: "Spearheads the system architecture. Obsessed with high-performance web applications and secure institutional data flows. Built the core gamification engine.",
      icon: <Code2 className="w-6 h-6 text-accent-blue" />,
      color: "from-accent-blue/20"
    },
    {
      name: "Shreedhar Shivappa Hegade",
      role: "Head of Product & UX",
      bio: "Engineered the fluid glassmorphic UI and interaction models. Focuses on extremely satisfying user experiences and conversion optimization.",
      icon: <Terminal className="w-6 h-6 text-accent-amber" />,
      color: "from-accent-amber/20"
    },
    {
      name: "Ritun Jain",
      role: "Systems & Security Lead",
      bio: "Oversees the integrity of the platform. Implemented the stringent institutional authentication protocols and ensures data compliance across the board.",
      icon: <Shield className="w-6 h-6 text-emerald-500" />,
      color: "from-emerald-500/20"
    },
    {
      name: "Shourya Santhosh",
      role: "Infrastructure & Data Ops",
      bio: "Manages the real-time database operations and API communication layers. Keeps the server response times blazingly fast even under peak campus load.",
      icon: <Database className="w-6 h-6 text-purple-500" />,
      color: "from-purple-500/20"
    }
  ];

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-white/30 pt-32 pb-24 relative overflow-hidden">
      
      {/* Abstract Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[1920px] mx-auto px-8 md:px-16 w-full relative z-10">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-24 max-w-3xl mx-auto"
        >
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6 leading-[0.95]">
            The <span className="text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-600">Architects</span>
          </h1>
          <p className="text-text-secondary text-lg leading-relaxed font-medium">
            Meet the engineers behind Campus Sync. Dedicated to writing clean code, building secure infrastructure, and pushing the boundaries of what institutional software can look like.
          </p>
        </motion.div>

        {/* Founders Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {founders.map((founder, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.2 }}
              className="glass-card rounded-sm border border-white/10 overflow-hidden group relative"
            >
              <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br ${founder.color} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`} />
              
              <div className="p-10 md:p-14 flex flex-col items-center text-center relative z-10">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-campus-black bg-white/5 shadow-2xl overflow-hidden mb-8 relative group-hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                  {/* Using placeholder until real images are provided */}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                  <span className="text-5xl font-black text-white/30">{founder.name.charAt(0)}</span>
                </div>

                <div className="flex items-center justify-center gap-3 mb-2">
                  {founder.icon}
                  <h2 className="text-3xl font-black uppercase tracking-wide text-white">{founder.name}</h2>
                </div>
                
                <h3 className="text-accent-amber font-bold text-sm uppercase tracking-widest mb-6">{founder.role}</h3>
                <p className="text-text-secondary leading-relaxed font-medium max-w-md mx-auto mb-10">
                  {founder.bio}
                </p>

                {/* Social Links */}
                <div className="flex items-center gap-6 mt-auto">
                  <a href="#" className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-campus-black transition-all duration-300">
                    <Github className="w-5 h-5" />
                  </a>
                  <a href="#" className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-[#0A66C2] hover:border-[#0A66C2] hover:text-white transition-all duration-300">
                    <Linkedin className="w-5 h-5" />
                  </a>
                  <a href="#" className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-campus-black transition-all duration-300">
                    <Mail className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </main>
  );
}
