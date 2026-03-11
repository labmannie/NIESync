"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Shield, Menu, X, LogOut, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const pathname = usePathname();
  const router = useRouter();

  // Check authentication status and handle scroll
  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    // Check initial session
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setIsAuthenticated(!!session);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu and dropdowns on navigate
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setShowLogoutConfirm(false);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    router.push("/");
  };

  const publicLinks = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "Founders", href: "/founders" },
    { name: "Contact Us", href: "/contact" },
  ];

  const privateLinks = [
    { name: "Lost & Found", href: "/lost-and-found" },
    { name: "Parking Patrol", href: "/parking-patrol" },
    { name: "Leaderboard", href: "/leaderboard" },
  ];

  const navLinks = (mounted && isAuthenticated) ? privateLinks : publicLinks;

  // Hide entirely on login page for clean auth flow
  if (pathname === '/login') return null;

  return (
    <>
      <nav 
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 w-full flex items-center justify-between px-6 md:px-16 ${
          scrolled ? "bg-campus-black/85 backdrop-blur-md border-b border-white/10 py-5 shadow-lg" : "bg-transparent py-8"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 text-white hover:opacity-90 transition-opacity z-50 group">
          <Image src="/logo.png" alt="NIE Sync Logo" width={32} height={32} className="w-8 h-8 object-contain group-hover:scale-110 transition-transform duration-300" />
          <span className="font-extrabold text-2xl tracking-wide">NIE Sync</span>
        </Link>
        
        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-10 absolute left-1/2 -translate-x-1/2">
          {navLinks.map((link) => (
            <Link 
              key={link.name} 
              href={link.href} 
              className={`text-xs font-bold uppercase tracking-[0.15em] transition-colors duration-200 ${
                pathname === link.href ? "text-accent-blue" : "text-text-secondary hover:text-white"
              }`}
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Desktop Action / Auth */}
        <div className="hidden md:flex items-center gap-4 z-50">
          {mounted && !isAuthenticated ? (
            <>
              <Link href="/login" className="bg-transparent text-white border border-white/20 font-bold text-xs uppercase tracking-widest px-6 py-3 clip-diagonal hover:bg-white/10 transition-colors duration-200 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                Institutional Login
              </Link>
              <Link href="/signup" className="bg-white text-campus-black font-bold text-xs uppercase tracking-widest px-6 py-3 clip-diagonal hover:bg-gray-200 transition-colors duration-200 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                Sign Up
              </Link>
            </>
          ) : mounted && isAuthenticated ? (
            <div className="flex items-center gap-6 relative">
              <Link 
                href="/profile" 
                className="flex items-center gap-2 text-text-secondary hover:text-accent-blue transition-colors uppercase tracking-widest text-xs font-bold"
              >
                <User className="w-4 h-4" />
                <span>Profile</span>
              </Link>
              <div className="relative">
                <button 
                  onClick={() => setShowLogoutConfirm(!showLogoutConfirm)}
                  className="flex items-center gap-2 text-text-secondary hover:text-red-400 transition-colors uppercase tracking-widest text-xs font-bold"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
                <AnimatePresence>
                  {showLogoutConfirm && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute right-0 top-full mt-4 bg-campus-black border border-white/10 p-4 shadow-2xl rounded-sm w-48 z-50 flex flex-col gap-3"
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-white text-center">Confirm Logout?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-wider text-text-secondary rounded-sm transition-colors">Cancel</button>
                        <button onClick={handleLogout} className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/40 text-xs font-bold uppercase tracking-wider text-red-400 rounded-sm transition-colors">Yes</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="w-40 h-10" />
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <button 
          className="md:hidden relative z-[110] p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle Menu"
        >
          {isMobileMenuOpen ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-[90] bg-campus-black backdrop-blur-3xl flex flex-col items-center justify-center gap-8 w-full h-screen"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.1)_0%,transparent_100%)] pointer-events-none" />
            
            {navLinks.map((link, i) => (
              <motion.div
                key={link.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.3 }}
              >
                <Link 
                  href={link.href} 
                  className={`text-3xl font-black uppercase tracking-widest transition-colors ${
                    pathname === link.href ? "text-accent-blue drop-shadow-[0_0_15px_rgba(37,99,235,0.5)]" : "text-text-secondary hover:text-white"
                  }`}
                >
                  {link.name}
                </Link>
              </motion.div>
            ))}
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="flex flex-col items-center gap-6 mt-12 w-full px-12"
            >
              {mounted && !isAuthenticated ? (
                <div className="w-full flex flex-col gap-4">
                  <Link href="/login" className="w-full text-center border border-white/10 bg-white/5 text-white py-5 font-bold tracking-[0.2em] text-sm uppercase clip-diagonal transition-colors hover:bg-white/10">
                    Institutional Login
                  </Link>
                  <Link href="/signup" className="w-full text-center bg-white text-campus-black py-5 font-bold tracking-[0.2em] text-sm uppercase clip-diagonal transition-colors shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                    Sign Up
                  </Link>
                </div>
              ) : mounted && isAuthenticated ? (
                <div className="w-full flex flex-col gap-4">
                  <Link 
                    href="/profile"
                    className="w-full text-center border border-white/10 bg-white/5 hover:bg-white/10 py-5 text-white font-bold tracking-[0.2em] text-sm uppercase rounded-sm transition-colors flex items-center justify-center gap-3"
                  >
                    <User className="w-5 h-5" />
                    Profile Hub
                  </Link>

                  {!showLogoutConfirm ? (
                    <button 
                      onClick={() => setShowLogoutConfirm(true)}
                      className="w-full text-center border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 py-5 text-red-400 font-bold tracking-[0.2em] text-sm uppercase rounded-sm transition-colors flex items-center justify-center gap-3"
                    >
                      <LogOut className="w-5 h-5" />
                      Sign Out
                    </button>
                  ) : (
                    <div className="w-full relative overflow-hidden rounded-sm border border-red-500/50 bg-campus-black p-4 flex flex-col gap-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-white text-center">Are you sure?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-white/5 text-xs font-bold uppercase tracking-wider text-text-secondary rounded-sm">Cancel</button>
                        <button onClick={handleLogout} className="flex-1 py-3 bg-red-500 text-xs font-bold uppercase tracking-wider text-white rounded-sm">Logout</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
