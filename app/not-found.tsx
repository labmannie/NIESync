"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldAlert, ArrowLeft, Gamepad2, RefreshCcw } from "lucide-react";
import { useState, useEffect } from "react";

export default function NotFound() {
  const [score, setScore] = useState(0);
  const [targetPos, setTargetPos] = useState({ x: 50, y: 50 });

  const moveTarget = () => {
    setTargetPos({
      x: Math.floor(Math.random() * 80) + 10,
      y: Math.floor(Math.random() * 80) + 10,
    });
    setScore(s => s + 100);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setTargetPos({
        x: Math.floor(Math.random() * 80) + 10,
        y: Math.floor(Math.random() * 80) + 10,
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex flex-col items-center justify-center relative overflow-hidden selection:bg-accent-blue/30">
      
      {/* Background Grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      
      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent-blue/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl px-8 flex flex-col items-center text-center">
        
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="mb-8 relative"
        >
          <h1 className="text-[120px] md:text-[180px] font-black tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20 select-none">
            404
          </h1>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full flex items-center justify-center pointer-events-none mix-blend-overlay">
            <ShieldAlert className="w-32 h-32 md:w-48 md:h-48 text-accent-amber/50" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-wide mb-4">
            YOU'VE VENTURED <span className="text-accent-amber">OFF CAMPUS</span>.
          </h2>
          <p className="text-text-secondary text-lg max-w-lg mx-auto mb-10">
            The page you're looking for doesn't exist or has been relocated securely.
          </p>

          <Link href="/">
            <button className="bg-white text-campus-black font-bold uppercase tracking-widest text-sm px-8 py-4 clip-diagonal hover:bg-gray-200 transition-colors duration-200 flex items-center justify-center gap-3 mx-auto shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              <ArrowLeft className="w-5 h-5" />
              <span>Return to Base</span>
            </button>
          </Link>
        </motion.div>

        {/* Mini Game Container */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-16 w-full max-w-lg"
        >
          <div className="glass-card p-4 rounded-sm border border-white/10 relative">
            <div className="flex justify-between items-center mb-4 px-2">
              <div className="flex items-center gap-2 text-text-secondary font-mono text-sm uppercase">
                <Gamepad2 className="w-4 h-4 text-accent-blue" />
                <span>Sync Trainer v1.0</span>
              </div>
              <div className="font-mono text-accent-blue font-bold tracking-widest text-sm">
                SCORE: {score.toString().padStart(4, "0")}
              </div>
            </div>

            {/* Game Area */}
            <div className="w-full h-48 bg-black/50 border border-white/5 rounded relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#00ff0015_1px,transparent_1px),linear-gradient(to_bottom,#00ff0015_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
              
              <motion.div
                animate={{ left: `${targetPos.x}%`, top: `${targetPos.y}%` }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                className="absolute w-8 h-8 -ml-4 -mt-4 cursor-crosshair group flex items-center justify-center p-2"
                onClick={moveTarget}
              >
                <div className="absolute inset-0 rounded-full border border-red-500/50 group-hover:bg-red-500/20 group-hover:scale-110 transition-all pointer-events-auto flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                </div>
              </motion.div>
            </div>
            
            <div className="mt-3 flex justify-between items-center px-2">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest">Click target to train aim</span>
              <button 
                onClick={() => setScore(0)} 
                className="text-text-secondary hover:text-white transition-colors p-1"
                aria-label="Reset Game"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>

      </div>
    </main>
  );
}
