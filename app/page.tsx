"use client";

import { Shield, Search, Camera, Key, MapPin, CheckCircle, ArrowRight, Zap, Target, Lock, Activity, Users } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

function HeroContent() {
  const [isAuth, setIsAuth] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    setIsAuth(document.cookie.includes('campus-sync-auth=true'));
  }, []);

  return (
    <div className="flex-1 flex flex-col justify-start pt-32 md:pt-48 lg:pt-56 translate-y-8 md:translate-y-0 relative z-10 w-full">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-4xl"
      >
        <div className="flex items-center gap-3 mb-6 bg-white/5 border border-white/10 w-fit px-4 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse"></span>
          <span className="text-white/80 text-xs font-bold uppercase tracking-widest">NIE Campus Authorized System</span>
        </div>

        <h1 className="text-[48px] md:text-[80px] font-black text-white uppercase leading-[0.95] tracking-[-0.04em] mb-8">
          CAMPUS SECURED.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">ITEMS RECOVERED.</span>
        </h1>
        <p className="text-text-secondary text-lg md:text-xl max-w-[600px] mb-12 leading-relaxed font-medium">
          The unified, premium portal for NIE students to report parking violations, manage assets, and track lost items in real-time.
        </p>
        
        {mounted && !isAuth ? (
          <div className="flex flex-col sm:flex-row gap-5">
            <Link href="/signup" className="flex items-center justify-center gap-3 bg-white text-campus-black font-bold tracking-wider uppercase text-sm px-10 py-5 clip-diagonal hover:bg-gray-200 transition-colors duration-200 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)]">
              <span>Create Account</span>
            </Link>
            <Link href="/login" className="flex items-center justify-center gap-3 bg-accent-blue text-white font-bold tracking-wider uppercase text-sm px-10 py-5 clip-diagonal hover:bg-blue-500 transition-colors duration-200 shadow-[0_0_30px_rgba(37,99,235,0.4)] hover:shadow-[0_0_40px_rgba(37,99,235,0.6)]">
              <span>Institutional Login</span>
            </Link>
            <Link href="#features" className="flex items-center justify-center gap-3 bg-transparent text-white border border-white/20 px-8 py-5 hover:bg-white/10 transition-colors duration-200 font-bold tracking-wider uppercase text-sm shadow-xl">
              <span>Explore</span>
            </Link>
          </div>
        ) : mounted && isAuth ? (
          <div className="flex flex-col sm:flex-row gap-5">
            <Link href="/lost-and-found" className="flex items-center justify-center gap-3 bg-accent-blue text-white font-bold tracking-wider uppercase text-sm px-10 py-5 clip-diagonal hover:bg-blue-500 transition-colors duration-200 shadow-[0_0_30px_rgba(37,99,235,0.4)] hover:shadow-[0_0_40px_rgba(37,99,235,0.6)]">
              <Search className="w-5 h-5" />
              <span>Find an Item</span>
            </Link>
            <Link href="/parking-patrol" className="flex items-center justify-center gap-3 bg-transparent text-white border border-white/20 px-10 py-5 hover:bg-white/10 transition-colors duration-200 font-bold tracking-wider uppercase text-sm shadow-xl">
              <Camera className="w-5 h-5 opacity-80 text-accent-amber" />
              <span>Scan License Plate</span>
            </Link>
          </div>
        ) : (
          <div className="h-[60px]" />
        )}
      </motion.div>
    </div>
  );
}

function ParkingCard() {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="glass-card shine-effect w-full lg:w-[420px] p-6 rounded-sm relative group cursor-pointer hover:border-white/40 transition-all duration-500 z-10"
    >
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-white font-bold text-xs uppercase tracking-[0.15em]">Recent Violation</h3>
        <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1.5 rounded-full border border-green-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse relative"></span>
          <span className="text-green-400 text-[10px] font-black uppercase tracking-widest">Active Report</span>
        </div>
      </div>
      
      <div className="bg-campus-black/80 border border-white/10 rounded-sm flex items-center p-4 gap-5 group-hover:bg-campus-black transition-colors">
        <div className="w-[84px] h-[52px] bg-white/10 rounded-sm flex items-center justify-center overflow-hidden relative border border-white/10">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-md" />
          <span className="text-white/90 font-mono text-sm z-10 font-bold tracking-[0.2em] blur-[2px] select-none group-hover:blur-0 transition-all duration-300">KA09***</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-white text-sm font-bold tracking-wide">Reserved Parking</span>
          <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">Lot B • 2 mins ago</span>
        </div>
      </div>
    </motion.div>
  );
}

function LostFoundCard() {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="glass-card shine-effect w-full lg:w-[360px] p-6 rounded-sm relative group cursor-pointer hover:border-white/40 transition-all duration-500 lg:-ml-12 z-20 lg:mb-6 lg:shadow-[-30px_0_50px_-10px_rgba(0,0,0,0.8)]"
    >
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-white font-bold text-xs uppercase tracking-[0.15em]">Recently Found</h3>
      </div>
      
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-full flex items-center justify-center text-white shadow-inner group-hover:text-accent-blue transition-colors">
            <Key className="w-5 h-5" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white text-sm font-bold tracking-wide">Car Keys (Honda)</span>
            <span className="text-text-secondary text-xs font-medium uppercase tracking-wider">Lib Gate • Found</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ExpandedContent() {
  const highlightFeatures = [
    {
      title: "Real-time Alerts",
      desc: "Instant notifications sent directly to NIE institution emails the moment a potential match or violation is reported.",
      icon: <Zap className="w-8 h-8 text-accent-amber" />,
      delay: 0.1
    },
    {
      title: "Secure Verification",
      desc: "Advanced ownership validation ensures items are returned strictly to verified NIE students.",
      icon: <Lock className="w-8 h-8 text-white" />,
      delay: 0.2
    },
    {
      title: "Gamified Tracking",
      desc: "Earn campus points and climb the ranks on the Global Leaderboard for contributing to campus security.",
      icon: <Activity className="w-8 h-8 text-accent-blue" />,
      delay: 0.3
    }
  ];

  return (
    <>
      {/* 3 Step Process - Redesigned */}
      <section id="features" className="w-full py-32 bg-campus-black border-t border-white/5">
        <div className="max-w-[1920px] mx-auto px-8 md:px-16 w-full">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-24 max-w-4xl mx-auto"
          >
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-6">
              Three Steps To <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue to-cyan-400">Resolution</span>
            </h2>
            <p className="text-text-secondary text-lg leading-relaxed font-medium">
              We've entirely overhauled the process of recovering items and reporting parking infractions. No paperwork. Just an incredibly fast, highly automated digital ecosystem.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connecting line on desktop */}
            <div className="hidden md:block absolute top-[60px] left-1/6 right-1/6 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
            
            {[
              { icon: <Target className="w-8 h-8 text-white" />, title: "Spot & Scan", desc: "Identify a lost item or an unpermitted vehicle and capture it via the app." },
              { icon: <Shield className="w-8 h-8 text-white" />, title: "Verify & Match", desc: "Our engine cross-references the NIE database and identifies the proper owner." },
              { icon: <CheckCircle className="w-8 h-8 text-white" />, title: "Resolve & Return", desc: "Owners are pinged instantly, leading to secure, effortless resolutions." }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: i * 0.2 }}
                className="flex flex-col items-center text-center relative z-10 group"
              >
                <div className="w-32 h-32 bg-campus-black border border-white/10 flex items-center justify-center rounded-full mb-8 shadow-2xl relative overflow-hidden group-hover:border-white/30 transition-all duration-500">
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10 group-hover:scale-110 transition-transform duration-500">
                    {step.icon}
                  </div>
                </div>
                <h3 className="text-2xl font-black tracking-wide mb-4 uppercase">{step.title}</h3>
                <p className="text-text-secondary leading-relaxed font-medium px-4">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Highlight Section */}
      <section className="w-full py-32 bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.05),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(255,176,0,0.03),transparent_50%)] border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[600px] bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />

        <div className="max-w-[1920px] mx-auto px-8 md:px-16 w-full relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-8 leading-[1.1]">
                Smarter Campus <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-amber to-white">Operations.</span>
              </h2>
              <p className="text-text-secondary text-lg mb-12 max-w-xl leading-relaxed">
                By consolidating disconnected manual processes into a sleek digital hub, NIE Sync removes the friction of managing campus logistics.
              </p>

              <div className="flex flex-col gap-8">
                {highlightFeatures.map((feat, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: feat.delay + 0.4 }}
                    className="flex items-start gap-6 group"
                  >
                    <div className="w-16 h-16 shrink-0 bg-white/5 border border-white/10 rounded-sm flex items-center justify-center group-hover:bg-white/10 transition-colors duration-300">
                      {feat.icon}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold mb-2 uppercase tracking-wide">{feat.title}</h4>
                      <p className="text-text-secondary font-medium leading-relaxed">{feat.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="relative aspect-square md:aspect-auto md:h-[700px] glass-card rounded-sm border border-white/10 overflow-hidden flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <div className="absolute top-10 right-10 w-64 h-64 bg-accent-blue/20 rounded-full blur-[100px]" />
              <div className="absolute bottom-10 left-10 w-64 h-64 bg-accent-amber/10 rounded-full blur-[100px]" />
              
              <div className="relative z-10 flex flex-col items-center justify-center text-center p-8">
                <Users className="w-24 h-24 text-white/20 mb-6" />
                <h3 className="text-3xl font-black uppercase tracking-widest text-white/50 mb-2">Join The Network</h3>
                <p className="text-white/30 font-medium">Over 2,400+ students already utilizing the infrastructure.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="w-full py-32 bg-campus-black text-center relative overflow-hidden border-t border-white/10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-1 bg-gradient-to-r from-transparent via-accent-blue to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-4xl mx-auto px-8"
        >
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-8">Ready to sync?</h2>
          <Link href="/login" className="inline-flex items-center justify-center gap-3 bg-white text-campus-black font-black uppercase tracking-widest px-12 py-5 clip-diagonal hover:bg-gray-200 transition-colors shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] md:text-lg">
            Authenticate Identity
            <ArrowRight className="w-6 h-6" />
          </Link>
        </motion.div>
      </section>
    </>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-screen w-full bg-campus-black selection:bg-accent-blue/30 selection:text-white flex flex-col font-sans overflow-hidden">
      
      {/* Hero Section Container */}
      <div className="relative min-h-screen w-full flex flex-col">
        {/* Background Video */}
        <div className="absolute inset-0 z-0 bg-campus-black">
          <video 
            autoPlay 
            loop 
            muted 
            playsInline
            className="w-full h-full object-cover opacity-[0.45] mix-blend-screen"
          >
            <source 
              src="https://res.cloudinary.com/denudp7zb/video/upload/v1/Cinematic_4k_highend_darkthemed_hero_background_vi_52775e50da_i8uoth.mp4" 
              type="video/mp4" 
            />
          </video>
          {/* Subtle radial gradient overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,5,1)_100%)] pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-campus-black to-transparent pointer-events-none" />
        </div>

        {/* Hero Content Wrapper */}
        <div className="relative z-10 flex flex-col flex-grow px-8 md:px-16 pb-8 max-w-[1920px] mx-auto w-full">
          <HeroContent />

          {/* Liquid Glass Widgets (Bottom area) */}
          <div className="w-full mt-auto pt-16 flex flex-col lg:flex-row gap-6 lg:items-end pb-12 relative z-20">
            <ParkingCard />
            <LostFoundCard />
          </div>
        </div>
      </div>

      {/* Extended Engaging Content */}
      <ExpandedContent />

    </main>
  );
}
