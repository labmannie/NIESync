"use client";

import { Shield, Search, Camera, Key, MapPin, CheckCircle, ArrowRight, Zap, Target, Lock, Activity, Users } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { PulsatingButton } from "@/components/ui/pulsating-button";
import { AuroraText } from "@/components/ui/aurora-text";

function HeroContent() {
  const [isAuth, setIsAuth] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    // Check initial session
    void resolveClientUser(supabase).then(({ user }) => {
      setIsAuth(!!user);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void resolveClientUser(supabase).then(({ user }) => {
        setIsAuth(!!user);
      });
    });

    return () => subscription.unsubscribe();
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
          <AuroraText
            className="font-black uppercase tracking-[-0.04em]"
            colors={["#2563EB", "#60A5FA", "#FFB000", "#38BDF8"]}
            speed={0.8}
          >
            CAMPUS SECURED.
          </AuroraText>
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">ITEMS RECOVERED.</span>
        </h1>
        <p className="text-text-secondary text-lg md:text-xl max-w-[600px] mb-12 leading-relaxed font-medium">
          The unified, premium portal for NIE students to report parking violations, manage assets, and track lost items in real-time.
        </p>

        {mounted && !isAuth ? (
          <div className="flex flex-col sm:flex-row gap-5">
            <RainbowButton
              asChild
              size="lg"
              className="h-14 min-w-[220px] px-10 text-sm font-black uppercase tracking-[0.16em] [--speed:2.4s] [--color-1:#2563EB] [--color-2:#0EA5E9] [--color-3:#FFB000] [--color-4:#38BDF8] [--color-5:#60A5FA]"
            >
              <Link href="/signup">
                <span>Create Account</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </RainbowButton>
            <Link href="/login" className="inline-flex h-14 min-w-[220px] items-center justify-center gap-3 rounded-xl border border-accent-blue/45 bg-[linear-gradient(135deg,#2563EB_0%,#1D4ED8_100%)] px-10 text-sm font-bold tracking-[0.16em] uppercase text-white transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_35px_rgba(37,99,235,0.45)]">
              <Lock className="h-4 w-4" />
              <span>Institutional Login</span>
            </Link>
            <Link href="#features" className="inline-flex h-14 min-w-[170px] items-center justify-center gap-3 rounded-xl border border-white/20 bg-transparent px-8 text-sm font-bold tracking-[0.16em] uppercase text-white transition-colors duration-200 hover:bg-white/10 shadow-xl">
              <span>Explore</span>
            </Link>
          </div>
        ) : mounted && isAuth ? (
          <div className="flex flex-col sm:flex-row gap-5">
            <Link href="/lost-and-found" className="flex items-center justify-center gap-3 bg-accent-blue text-white font-bold tracking-wider uppercase text-sm px-10 py-5 clip-diagonal hover:bg-blue-500 transition-colors duration-200 shadow-[0_0_30px_rgba(37,99,235,0.4)] hover:shadow-[0_0_40px_rgba(37,99,235,0.6)]">
              <Search className="w-5 h-5" />
              <span>Found an Item</span>
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

function ExpandedContent() {
  const router = useRouter();

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
          <PulsatingButton
            type="button"
            onClick={() => router.push("/login")}
            variant="ripple"
            duration="1.6s"
            distance="20px"
            pulseColor="rgba(37,99,235,0.62)"
            className="mx-auto inline-flex h-14 items-center justify-center gap-3 whitespace-nowrap rounded-xl border border-accent-blue/45 bg-[linear-gradient(135deg,#2563EB_0%,#1D4ED8_100%)] px-12 text-base font-black uppercase tracking-[0.15em] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_42px_rgba(37,99,235,0.45)] md:text-lg"
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              Authenticate Identity
              <ArrowRight className="h-5 w-5 shrink-0" />
            </span>
          </PulsatingButton>
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
        </div>
      </div>

      {/* Extended Engaging Content */}
      <ExpandedContent />

    </main>
  );
}
