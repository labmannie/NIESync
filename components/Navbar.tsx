"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut, ChevronDown, User, ShieldCheck, History, FileWarning, Car } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";

type NavbarProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const NAV_PROFILE_CACHE_KEY = "niesync_nav_profile";
const NAV_PROFILE_USER_ID_KEY = "niesync_nav_user_id";
const TRANSIENT_AUTH_ERROR_REGEX = /timed out|abort|network|fetch/i;

function readCachedNavbarProfileState(): { userId: string; profile: NavbarProfile | null } {
  if (typeof window === "undefined") {
    return { userId: "", profile: null };
  }

  try {
    const userId = String(window.localStorage.getItem(NAV_PROFILE_USER_ID_KEY) || "").trim();
    const rawProfile = window.localStorage.getItem(NAV_PROFILE_CACHE_KEY);
    if (!rawProfile) {
      return { userId, profile: null };
    }

    return {
      userId,
      profile: JSON.parse(rawProfile) as NavbarProfile,
    };
  } catch {
    return { userId: "", profile: null };
  }
}

function writeCachedNavbarProfileState(userId: string, profile: NavbarProfile | null) {
  if (typeof window === "undefined") return;

  try {
    if (!userId) {
      window.localStorage.removeItem(NAV_PROFILE_CACHE_KEY);
      window.localStorage.removeItem(NAV_PROFILE_USER_ID_KEY);
      return;
    }

    window.localStorage.setItem(NAV_PROFILE_USER_ID_KEY, userId);
    if (profile) {
      window.localStorage.setItem(NAV_PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(NAV_PROFILE_CACHE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function clearCachedNavbarProfileState() {
  writeCachedNavbarProfileState("", null);
}

function isTransientNavbarAuthError(message: string) {
  return TRANSIENT_AUTH_ERROR_REGEX.test(String(message || ""));
}

function resolveProfileDisplayName(profile: NavbarProfile | null) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const username = String(profile?.username || "").trim();
  if (username) return `@${username}`;
  return "Profile";
}

function resolveProfileInitials(profile: NavbarProfile | null) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "U";
  }
  const username = String(profile?.username || "").trim();
  if (username) return username.slice(0, 2).toUpperCase();
  return "U";
}

export function Navbar() {
  const supabase = useMemo(() => createClient(), []);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<NavbarProfile | null>(null);

  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const authSyncVersionRef = useRef(0);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let isActive = true;
    setMounted(true);
    const cachedState = readCachedNavbarProfileState();
    if (cachedState.userId) {
      setIsAuthenticated(true);
      if (cachedState.profile) {
        setProfile(cachedState.profile);
      }
    }

    const applySignedOutState = (version: number) => {
      if (!isActive || version !== authSyncVersionRef.current) return;
      setIsAuthenticated(false);
      setProfile(null);
      setIsProfileMenuOpen(false);
      clearCachedNavbarProfileState();
    };

    const loadProfile = async (userId: string, version: number) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, username, avatar_url")
          .eq("id", userId)
          .maybeSingle();

        if (!isActive || version !== authSyncVersionRef.current) return;
        if (error) {
          console.warn("[Navbar] Unable to refresh profile:", error.message || error);
          return;
        }

        const resolvedProfile = (data || null) as NavbarProfile | null;
        if (!resolvedProfile) {
          // Keep the last known profile snapshot instead of blanking the navbar identity
          // on transient empty responses.
          return;
        }
        setProfile(resolvedProfile);
        writeCachedNavbarProfileState(userId, resolvedProfile);
      } catch (error) {
        if (!isActive || version !== authSyncVersionRef.current) return;
        console.warn(
          "[Navbar] Failed to refresh profile:",
          (error as { message?: string })?.message || error
        );
      }
    };

    const applySignedInState = async (userId: string, version: number) => {
      if (!isActive || version !== authSyncVersionRef.current) return;
      setIsAuthenticated(true);

      const latestCache = readCachedNavbarProfileState();
      if (latestCache.userId === userId && latestCache.profile) {
        setProfile(latestCache.profile);
      } else {
        setProfile((current) => (current?.id === userId ? current : null));
      }

      writeCachedNavbarProfileState(userId, latestCache.userId === userId ? latestCache.profile : null);
      await loadProfile(userId, version);
    };

    const syncAuthState = async (version = ++authSyncVersionRef.current) => {
      let sessionUserId = "";
      let sessionErrorMessage = "";

      try {
        const { data, error } = await supabase.auth.getSession();
        sessionUserId = String(data?.session?.user?.id || "");
        sessionErrorMessage = String(error?.message || "");
      } catch (error) {
        sessionErrorMessage = String((error as { message?: string })?.message || "");
      }

      if (sessionUserId) {
        await applySignedInState(sessionUserId, version);
        return;
      }

      const { user, errorMessage } = await resolveClientUser(supabase);
      if (!isActive || version !== authSyncVersionRef.current) return;

      const resolvedUserId = String(user?.id || "");
      if (resolvedUserId) {
        await applySignedInState(resolvedUserId, version);
        return;
      }

      const combinedErrorMessage = `${sessionErrorMessage} ${errorMessage}`.trim();
      const fallbackCache = readCachedNavbarProfileState();
      if (fallbackCache.userId && isTransientNavbarAuthError(combinedErrorMessage)) {
        setIsAuthenticated(true);
        if (fallbackCache.profile) {
          setProfile(fallbackCache.profile);
        }
        return;
      }

      applySignedOutState(version);
    };

    void syncAuthState();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const version = ++authSyncVersionRef.current;
      const sessionUserId = String(session?.user?.id || "");

      if (event === "SIGNED_OUT") {
        // Re-check once before applying signed-out UI to avoid false negatives during
        // token refresh/network blips.
        void syncAuthState(version);
        return;
      }

      if (sessionUserId) {
        void applySignedInState(sessionUserId, version);
        return;
      }

      void syncAuthState(version);
    });

    return () => {
      isActive = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileMenuOpen]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      clearCachedNavbarProfileState();
    }
    setIsAuthenticated(false);
    setProfile(null);
    setIsProfileMenuOpen(false);
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

  const profileLinks = [
    { name: "Profile Overview", href: "/profile", icon: <User className="h-4 w-4" /> },
    { name: "Security Settings", href: "/profile/security", icon: <ShieldCheck className="h-4 w-4" /> },
    { name: "Your Vehicles", href: "/profile/vehicles", icon: <Car className="h-4 w-4" /> },
    { name: "Parking Issues", href: "/profile/reports", icon: <FileWarning className="h-4 w-4" /> },
    { name: "Auth History", href: "/profile/sessions", icon: <History className="h-4 w-4" /> },
  ];

  const navLinks = mounted && isAuthenticated ? privateLinks : publicLinks;
  const displayName = resolveProfileDisplayName(profile);
  const initials = resolveProfileInitials(profile);

  if (pathname === "/login") return null;

  return (
    <>
      <nav
        className={`fixed left-0 right-0 top-0 z-[100] flex w-full items-center justify-between px-4 transition-all duration-300 sm:px-6 lg:px-10 xl:px-16 ${
          scrolled
            ? "border-b border-white/10 bg-campus-black/85 py-5 shadow-lg backdrop-blur-md"
            : "bg-transparent py-8"
        }`}
      >
        <Link href="/" className="group z-50 flex items-center gap-3 text-white transition-opacity hover:opacity-90">
          <Image
            src="/logo.png"
            alt="NIE Sync Logo"
            width={40}
            height={40}
            className="h-9 w-9 rounded-lg object-cover transition-transform duration-300 group-hover:scale-110"
          />
          <span className="text-2xl font-extrabold tracking-wide">NIE Sync</span>
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 xl:flex">
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

        <div className="z-50 hidden items-center gap-4 xl:flex">
          {mounted && !isAuthenticated ? (
            <>
              <Link
                href="/login"
                className="clip-diagonal border border-white/20 bg-transparent px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-colors duration-200 hover:bg-white/10"
              >
                Institutional Login
              </Link>
              <Link
                href="/signup"
                className="clip-diagonal bg-white px-6 py-3 text-xs font-bold uppercase tracking-widest text-campus-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-colors duration-200 hover:bg-gray-200 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
              >
                Sign Up
              </Link>
            </>
          ) : mounted && isAuthenticated ? (
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((value) => !value)}
                className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 text-white transition-colors hover:bg-white/[0.1]"
              >
                <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.08] text-xs font-bold uppercase">
                  {profile?.avatar_url ? (
                    <Image src={profile.avatar_url} alt={displayName} fill className="object-cover" />
                  ) : (
                    initials
                  )}
                </span>
                <span className="hidden text-left 2xl:block">
                  <span className="block max-w-[180px] truncate text-xs font-bold uppercase tracking-[0.12em] text-white">
                    {displayName}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${isProfileMenuOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {isProfileMenuOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-full mt-3 w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f0f] p-2 shadow-[0_22px_60px_rgba(0,0,0,0.55)]"
                  >
                    <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <p className="truncate text-xs font-bold text-white">{displayName}</p>
                      {profile?.username ? (
                        <p className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">@{profile.username}</p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      {profileLinks.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                            pathname === item.href
                              ? "bg-accent-blue/20 text-white"
                              : "text-white/80 hover:bg-white/[0.08] hover:text-white"
                          }`}
                        >
                          {item.icon}
                          {item.name}
                        </Link>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/35 bg-red-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-red-200 transition-colors hover:bg-red-500/25"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <div className="h-10 w-40" />
          )}
        </div>

        <button
          className="relative z-[110] rounded-full p-2 text-white transition-colors hover:bg-white/10 xl:hidden"
          onClick={() => setIsMobileMenuOpen((value) => !value)}
          aria-label="Toggle Menu"
        >
          {isMobileMenuOpen ? <X className="h-8 w-8" /> : <Menu className="h-8 w-8" />}
        </button>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed inset-0 z-[90] flex h-screen w-full flex-col items-center justify-center gap-8 bg-campus-black px-6 backdrop-blur-3xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.1)_0%,transparent_100%)]" />

            {mounted && isAuthenticated ? (
              <div className="relative z-10 mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.08] text-sm font-bold uppercase">
                  {profile?.avatar_url ? (
                    <Image src={profile.avatar_url} alt={displayName} fill className="object-cover" />
                  ) : (
                    initials
                  )}
                </span>
                <div>
                  <p className="max-w-[220px] truncate text-sm font-bold text-white">{displayName}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">Authenticated</p>
                </div>
              </div>
            ) : null}

            {navLinks.map((link, i) => (
              <motion.div
                key={link.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.25 }}
                className="relative z-10"
              >
                <Link
                  href={link.href}
                  className={`text-2xl font-black uppercase tracking-[0.14em] transition-colors ${
                    pathname === link.href
                      ? "text-accent-blue drop-shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                      : "text-text-secondary hover:text-white"
                  }`}
                >
                  {link.name}
                </Link>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36, duration: 0.3 }}
              className="relative z-10 mt-10 flex w-full max-w-md flex-col gap-3"
            >
              {mounted && !isAuthenticated ? (
                <>
                  <Link
                    href="/login"
                    className="clip-diagonal w-full border border-white/10 bg-white/5 py-4 text-center text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/10"
                  >
                    Institutional Login
                  </Link>
                  <Link
                    href="/signup"
                    className="clip-diagonal w-full bg-white py-4 text-center text-sm font-bold uppercase tracking-[0.2em] text-campus-black shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-colors"
                  >
                    Sign Up
                  </Link>
                </>
              ) : mounted && isAuthenticated ? (
                <>
                  <Link
                    href="/profile"
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-sm font-bold uppercase tracking-[0.12em] text-white/90 transition-colors hover:bg-white/[0.09]"
                  >
                    <span className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.08] text-[10px] font-bold uppercase">
                      {profile?.avatar_url ? (
                        <Image src={profile.avatar_url} alt={displayName} fill className="object-cover" />
                      ) : (
                        initials
                      )}
                    </span>
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-500/35 bg-red-500/15 py-3 text-sm font-bold uppercase tracking-[0.12em] text-red-200 transition-colors hover:bg-red-500/25"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
