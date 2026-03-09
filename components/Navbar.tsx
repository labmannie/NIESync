"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Shield, Menu, X, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const pathname = usePathname();
  const router = useRouter();

  // Check authentication status and handle scroll
  useEffect(() => {
    setMounted(true);
    const checkAuth = () => {
      // Check if campus-sync-auth test cookie exists
      setIsAuthenticated(document.cookie.includes('campus-sync-auth=true'));
    };
    checkAuth();
  }, [pathname]); // Re-check on route change

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on navigate
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    document.cookie = "campus-sync-auth=; path=/; max-age=0";
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
          <Shield className="w-8 h-8 text-accent-blue group-hover:scale-110 transition-transform duration-300" fill="currentColor" strokeWidth={1.5} />
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
        <div className="hidden md:flex items-center gap-6 z-50">
          {mounted && !isAuthenticated ? (
            <Link href="/login" className="bg-white text-campus-black font-bold text-xs uppercase tracking-widest px-8 py-3 clip-diagonal hover:bg-gray-200 transition-colors duration-200 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]">
              Institutional Login
            </Link>
          ) : mounted && isAuthenticated ? (
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-text-secondary hover:text-red-400 transition-colors uppercase tracking-widest text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
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
                <Link href="/login" className="w-full text-center bg-white text-campus-black py-5 font-bold tracking-[0.2em] text-sm uppercase clip-diagonal transition-colors shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                  Institutional Login
                </Link>
              ) : mounted && isAuthenticated ? (
                <button 
                  onClick={handleLogout}
                  className="w-full text-center border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 py-5 text-red-400 font-bold tracking-[0.2em] text-sm uppercase rounded-sm transition-colors flex items-center justify-center gap-3"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
