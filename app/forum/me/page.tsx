
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowBigDown,
  ArrowBigUp,
  ChevronLeft,
  ChevronRight,
  Flame,
  Heart,
  Loader2,
  Minus,
  MessageSquare,
  Pencil,
  PenSquare,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";

type DeleteDialogState = { postId: string; title: string };
type ImageLightboxState = { urls: string[]; index: number; title: string };

type ForumPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  tag: string;
  relation_type: "lost_found" | "event" | null;
  location_label: string | null;
  comments_count: number;
  upvotes_count: number;
  downvotes_count: number;
  likes_count: number;
  created_at: string;
};

type ForumProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  email_verified: boolean | null;
};

const BUCKET = "forum-images";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function touchDistance(touches: { length: number; [index: number]: { clientX: number; clientY: number } }) {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function ago(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const sec = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fullDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function compactNumber(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return "0";
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(numeric >= 10_000_000 ? 0 : 1)}M`.replace(".0", "");
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(numeric >= 10_000 ? 0 : 1)}K`.replace(".0", "");
  return `${numeric}`;
}

function nameOf(profile: ForumProfile | null) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const username = String(profile?.username || "").trim();
  if (username) return `@${username}`;
  return "Campus Member";
}

function usernameOf(profile: ForumProfile | null) {
  const username = String(profile?.username || "").trim();
  return username ? `@${username}` : "";
}

function initialOf(profile: ForumProfile | null) {
  const username = String(profile?.username || "").trim();
  if (username) return username.charAt(0).toUpperCase();
  const first = String(profile?.first_name || "").trim();
  if (first) return first.charAt(0).toUpperCase();
  return "U";
}

function isVerified(profile: ForumProfile | null) {
  return profile?.email_verified === true;
}

function tagHashtag(tag: string) {
  if (tag === "lost") return "#lost";
  if (tag === "help") return "#help";
  if (tag === "rant") return "#rant";
  if (tag === "events") return "#events";
  return "#general";
}

function relationHashtag(relation: ForumPost["relation_type"]) {
  if (relation === "lost_found") return "#lost-found";
  if (relation === "event") return "#event";
  return "";
}

function Avatar({
  profile,
  anonymous = false,
  className = "h-12 w-12",
}: {
  profile: ForumProfile | null;
  anonymous?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/[0.08] text-xs font-black uppercase text-white",
        className
      )}
    >
      {anonymous ? (
        <UserRound className="h-5 w-5 text-white/75" />
      ) : profile?.avatar_url ? (
        <Image src={profile.avatar_url} alt={nameOf(profile)} fill className="object-cover" />
      ) : (
        initialOf(profile)
      )}
    </span>
  );
}

function VerifiedGif({ sizeClass = "h-4 w-4" }: { sizeClass?: string }) {
  return (
    <span className={cx(sizeClass, "relative inline-block shrink-0 rounded-full overflow-hidden")}>
      <Image src="/blue_tick.gif" alt="Verified" fill unoptimized className="object-cover" />
    </span>
  );
}

function StatTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-white">{compactNumber(value)}</p>
      <p className="mt-1 text-xs text-white/50">{helper}</p>
    </div>
  );
}

export default function ForumMyPostsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<ForumProfile | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [imagesByPostId, setImagesByPostId] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activePostId, setActivePostId] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [deletingPostId, setDeletingPostId] = useState("");
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const lightboxTouchStartX = useRef<number | null>(null);
  const lightboxPinchStartDistance = useRef<number | null>(null);
  const lightboxPinchStartZoom = useRef(1);

  const loadTimeline = useCallback(
    async (uid: string) => {
      if (!uid) {
        setPosts([]);
        setImagesByPostId({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data: postRows, error: postsError } = await supabase
        .from("forum_posts")
        .select(
          "id, author_id, title, body, tag, relation_type, location_label, comments_count, upvotes_count, downvotes_count, likes_count, created_at"
        )
        .eq("author_id", uid)
        .order("created_at", { ascending: false })
        .limit(250);

      if (postsError) {
        setError(postsError.message || "Unable to load your posts.");
        setLoading(false);
        return;
      }

      const rows = (postRows || []) as ForumPost[];
      const postIds = rows.map((row) => row.id);

      let imageMap: Record<string, string[]> = {};

      if (postIds.length) {
        const { data: imageRows } = await supabase
          .from("forum_post_images")
          .select("post_id, storage_path, display_order, created_at")
          .in("post_id", postIds)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true });

        imageMap = {};
        ((imageRows || []) as Array<{ post_id: string; storage_path: string }>).forEach((row) => {
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
          const publicUrl = String(data.publicUrl || "");
          if (!publicUrl) return;
          if (!imageMap[row.post_id]) imageMap[row.post_id] = [];
          imageMap[row.post_id].push(publicUrl);
        });
      }

      setPosts(rows);
      setImagesByPostId(imageMap);
      setLoading(false);
      setActivePostId((current) => current || rows[0]?.id || "");
    },
    [supabase]
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setLoading(true);
      setError("");
      const { user, errorMessage } = await resolveClientUser(supabase);
      if (!active) return;

      if (!user?.id) {
        if (errorMessage) setError(errorMessage);
        window.location.href = "/login";
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, username, avatar_url, email_verified")
        .eq("id", user.id)
        .maybeSingle();

      setUserId(user.id);
      setProfile((profileRow || null) as ForumProfile | null);
      await loadTimeline(user.id);
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [loadTimeline, supabase]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`forum-my-posts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_posts", filter: `author_id=eq.${userId}` },
        () => void loadTimeline(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTimeline, supabase, userId]);

  useEffect(() => {
    if (!deleteDialog && !lightbox) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!deletingPostId) setDeleteDialog(null);
      setLightbox(null);
      setLightboxZoom(1);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [deleteDialog, deletingPostId, lightbox]);

  useEffect(() => {
    if (!lightbox) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const preventGesture = (event: Event) => {
      event.preventDefault();
    };
    window.addEventListener("gesturestart" as any, preventGesture as any, { passive: false } as any);
    window.addEventListener("gesturechange" as any, preventGesture as any, { passive: false } as any);
    window.addEventListener("gestureend" as any, preventGesture as any, { passive: false } as any);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("gesturestart" as any, preventGesture as any);
      window.removeEventListener("gesturechange" as any, preventGesture as any);
      window.removeEventListener("gestureend" as any, preventGesture as any);
    };
  }, [lightbox]);

  const totalLikes = useMemo(
    () => posts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0),
    [posts]
  );
  const totalReplies = useMemo(
    () => posts.reduce((sum, post) => sum + Number(post.comments_count || 0), 0),
    [posts]
  );
  const selfTag = usernameOf(profile);

  const topPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => (b.likes_count + b.comments_count) - (a.likes_count + a.comments_count))
      .slice(0, 3);
  }, [posts]);

  const railCardClass =
    "overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur";

  const openImageLightbox = useCallback((urls: string[], index: number, title: string) => {
    if (!urls.length) return;
    const safeIndex = Math.max(0, Math.min(index, urls.length - 1));
    setLightbox({ urls, index: safeIndex, title: String(title || "Thread image") });
    setLightboxZoom(1);
  }, []);

  const closeImageLightbox = useCallback(() => {
    setLightbox(null);
    setLightboxZoom(1);
  }, []);

  const stepLightboxImage = useCallback((direction: -1 | 1) => {
    setLightbox((current) => {
      if (!current || current.urls.length < 2) return current;
      const nextIndex = (current.index + direction + current.urls.length) % current.urls.length;
      return { ...current, index: nextIndex };
    });
    setLightboxZoom(1);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (deletingPostId) return;
    setDeleteDialog(null);
  }, [deletingPostId]);

  const confirmDeletePost = useCallback(async () => {
    if (!userId || !deleteDialog || deletingPostId) return;
    const postId = deleteDialog.postId;
    setDeletingPostId(postId);
    setError("");
    setNotice("");

    try {
      const { data: imageRows, error: imageError } = await supabase
        .from("forum_post_images")
        .select("storage_path")
        .eq("post_id", postId);
      if (imageError) throw new Error(imageError.message || "Unable to prepare thread deletion.");

      const imagePaths = ((imageRows || []) as Array<{ storage_path: string }>)
        .map((row) => String(row.storage_path || "").trim())
        .filter(Boolean);

      const { data: deletedPost, error: deleteError } = await supabase
        .from("forum_posts")
        .delete()
        .eq("id", postId)
        .eq("author_id", userId)
        .select("id")
        .maybeSingle();
      if (deleteError) throw new Error(deleteError.message || "Unable to delete this thread.");
      if (!deletedPost?.id) throw new Error("Thread already removed or unavailable for deletion.");

      let imageCleanupFailed = false;
      if (imagePaths.length) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(imagePaths);
        imageCleanupFailed = Boolean(storageError);
      }

      if (activePostId === postId) setActivePostId("");
      setDeleteDialog(null);
      setNotice(imageCleanupFailed ? "Thread deleted. Some image files could not be cleaned up." : "Thread deleted successfully.");
      await loadTimeline(userId);
    } catch (deleteErr: any) {
      setError(String(deleteErr?.message || "Unable to delete this thread."));
    } finally {
      setDeletingPostId("");
    }
  }, [activePostId, deleteDialog, deletingPostId, loadTimeline, supabase, userId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_88%_10%,rgba(255,176,0,0.14),transparent_28%),#050506] px-4 pb-24 pt-24 text-white">
        <div className="mx-auto max-w-[1320px] grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="forum-skeleton h-80 rounded-[28px]" />
          </div>
          <div className="space-y-4">
            <div className="forum-skeleton h-40 rounded-[28px]" />
            <div className="forum-skeleton h-52 rounded-[28px]" />
            <div className="forum-skeleton h-52 rounded-[28px]" />
          </div>
        </div>
        <style jsx global>{forumGlobalStyles}</style>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_88%_10%,rgba(255,176,0,0.14),transparent_28%),#050506] px-4 pb-36 pt-20 text-white md:pb-24 md:pt-24">
      <style jsx global>{forumGlobalStyles}</style>

      <div className="mx-auto max-w-[1320px] grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className={railCardClass}>
            <div className="h-24 bg-[radial-gradient(circle_at_16%_30%,rgba(37,99,235,0.42),transparent_42%),radial-gradient(circle_at_82%_12%,rgba(255,176,0,0.36),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />
            <div className="px-5 pb-5">
              <div className="-mt-10 flex items-end justify-between gap-3">
                <div className="flex items-end gap-3">
                  <Avatar profile={profile} className="h-20 w-20 border-[3px] border-[#050506]" />
                  <div className="pb-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Your forum profile</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <h1 className="text-2xl font-black tracking-tight text-white">{nameOf(profile)}</h1>
                      {isVerified(profile) ? <VerifiedGif sizeClass="h-5 w-5" /> : null}
                    </div>
                    <p className="text-sm text-white/58">{selfTag || "Campus Member"}</p>
                  </div>
                </div>

                <Link
                  href="/forum"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                  aria-label="Back to forum"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatTile label="Posts" value={posts.length} helper="Threads published" />
                <StatTile label="Likes" value={totalLikes} helper="Total hearts" />
                <StatTile label="Replies" value={totalReplies} helper="Conversation depth" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/forum?compose=1"
                  className="inline-flex items-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(37,99,235,0.35)] transition hover:translate-y-[-1px]"
                >
                  <PenSquare className="h-4 w-4" />
                  New thread
                </Link>
                <Link
                  href="/forum"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white/80 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                >
                  <Sparkles className="h-4 w-4" />
                  Open feed
                </Link>
              </div>
            </div>
          </div>

          <section className={railCardClass}>
            <div className="border-b border-white/8 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-secondary">Highlights</p>
              <h2 className="mt-1 text-lg font-black text-white">Top threads</h2>
            </div>
            <div className="space-y-2 p-4">
              {topPosts.length ? topPosts.map((post, index) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setActivePostId(post.id)}
                  className={cx(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    activePostId === post.id
                      ? "border-accent-blue/35 bg-accent-blue/14"
                      : "border-white/10 bg-white/[0.03] hover:border-accent-blue/22 hover:bg-accent-blue/10"
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">#{index + 1} thread</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">{post.title}</p>
                  <p className="mt-2 text-[11px] text-white/50">{compactNumber(post.comments_count)} replies | {compactNumber(post.likes_count)} likes</p>
                </button>
              )) : (
                <p className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-5 text-center text-sm text-white/55">
                  Start a thread to see your highlights.
                </p>
              )}
            </div>
          </section>

        </aside>

        <section className="min-w-0 space-y-4">
          <header className={cx(railCardClass, "z-30 md:sticky md:top-24")}>
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(37,99,235,0.55),rgba(255,176,0,0.35),transparent)]" />
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-text-secondary">My timeline</p>
                <h2 className="mt-2 text-[28px] font-black tracking-tight text-white">Threads & reply previews</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/64">
                  Your authored posts with scan-friendly metrics and recent response context.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/forum"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white/80 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to forum
                </Link>
                <Link
                  href="/forum?compose=1"
                  className="inline-flex items-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue/22 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-accent-blue/30"
                >
                  <PenSquare className="h-4 w-4" />
                  New thread
                </Link>
              </div>
            </div>
          </header>

          {error ? (
            <p className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>
          ) : null}
          {notice ? (
            <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</p>
          ) : null}

          {loading ? (
            <section className={cx(railCardClass, "p-3 md:p-4")}>
              <div className="space-y-3 md:space-y-4">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="rounded-[22px] border border-white/10 bg-white/[0.02] p-4 md:p-5">
                    <div className="forum-skeleton h-44 rounded-[22px]" />
                  </div>
                ))}
              </div>
            </section>
          ) : posts.length === 0 ? (
            <section className={railCardClass}>
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                  <PenSquare className="h-6 w-6 text-white/45" />
                </div>
                <h2 className="mt-4 text-xl font-black text-white">No threads yet</h2>
                <p className="mt-2 text-sm text-white/60">Once you post in the forum, your personal thread timeline will show up here.</p>
                <Link
                  href="/forum?compose=1"
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue/20 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white"
                >
                  <PenSquare className="h-4 w-4" />
                  Create first thread
                </Link>
              </div>
            </section>
          ) : (
            <section className={cx(railCardClass, "p-3 md:p-4")}>
              <div className="space-y-3 md:space-y-4">
              {posts.map((post, index) => {
                const images = imagesByPostId[post.id] || [];
                const cover = images[0] || "";
                const isActive = activePostId === post.id;
                const previousPost = posts[index - 1];
                const nextPost = posts[index + 1];
                const connectToPrev = Boolean(previousPost && previousPost.author_id === post.author_id);
                const connectToNext = Boolean(nextPost && nextPost.author_id === post.author_id);

                return (
                  <article
                    key={post.id}
                    className={cx(
                      "group relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-4 py-4 transition-colors md:px-5 md:py-5",
                      isActive
                        ? "border-accent-blue/28 shadow-[0_16px_40px_rgba(8,20,44,0.34)]"
                        : "hover:border-accent-blue/22 hover:bg-white/[0.03]"
                    )}
                  >
                    <div
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/forum/${post.id}`)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        router.push(`/forum/${post.id}`);
                      }}
                      className="block w-full cursor-pointer text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-3">
                          <div className="relative flex w-11 shrink-0 justify-center">
                            {connectToPrev ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute left-1/2 top-[-20px] bottom-[calc(50%+16px)] w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.32)_52%,rgba(255,255,255,0.22))]"
                              />
                            ) : null}
                            {connectToNext ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute left-1/2 top-[calc(50%+16px)] bottom-[-24px] w-px -translate-x-1/2 bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(255,255,255,0.08)_65%,transparent)]"
                              />
                            ) : null}
                            <Avatar profile={profile} className="h-11 w-11" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                              <p className="truncate text-sm font-black text-white">{nameOf(profile)}</p>
                              {isVerified(profile) ? <VerifiedGif sizeClass="h-4 w-4" /> : null}
                              <p className="truncate text-sm text-white/45">{selfTag ? `${selfTag} | ` : ""}{ago(post.created_at)}</p>
                              <span className="rounded-full border border-accent-blue/25 bg-accent-blue/12 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/85">
                                {tagHashtag(post.tag)}
                              </span>
                            </div>
                            <p className="mt-1 text-[12px] text-white/42" title={fullDate(post.created_at)}>
                              {fullDate(post.created_at)}
                            </p>
                          </div>
                        </div>

                        {post.relation_type ? (
                          <span className="hidden rounded-full border border-accent-amber/35 bg-accent-amber/14 px-3 py-1.5 text-xs font-semibold text-accent-amber md:inline-flex">
                            {relationHashtag(post.relation_type)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        <h3 className="text-[22px] font-black tracking-tight text-white">{post.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/82">{post.body}</p>

                        {cover ? (
                          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openImageLightbox(images, 0, post.title);
                              }}
                              className="relative block w-full"
                            >
                              <img
                                src={cover}
                                alt={post.title}
                                className="h-[270px] w-full cursor-zoom-in object-cover transition-transform duration-500 group-hover:scale-[1.01] md:h-[360px]"
                                loading="lazy"
                              />
                              {images.length > 1 ? (
                                <span className="absolute bottom-2 right-2 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-black text-white">
                                  +{images.length - 1}
                                </span>
                              ) : null}
                            </button>
                          </div>
                        ) : null}

                        {(post.location_label || post.relation_type) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {post.location_label ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
                                {post.location_label}
                              </span>
                            ) : null}
                            {post.relation_type ? (
                              <span className="md:hidden rounded-full border border-accent-amber/35 bg-accent-amber/14 px-3 py-1.5 text-xs font-semibold text-accent-amber">
                                {relationHashtag(post.relation_type)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/72">
                        <ArrowBigUp className="h-4 w-4 text-emerald-300" />
                        <span className="text-[11px] uppercase tracking-[0.12em]">Up</span>
                        <span className="font-black text-white">{compactNumber(post.upvotes_count)}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/72">
                        <ArrowBigDown className="h-4 w-4 text-rose-300" />
                        <span className="text-[11px] uppercase tracking-[0.12em]">Down</span>
                        <span className="font-black text-white">{compactNumber(post.downvotes_count)}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/72">
                        <MessageSquare className="h-4 w-4 text-accent-blue" />
                        <span className="text-[11px] uppercase tracking-[0.12em]">Replies</span>
                        <span className="font-black text-white">{compactNumber(post.comments_count)}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/72">
                        <Heart className="h-4 w-4 text-pink-300" />
                        <span className="text-[11px] uppercase tracking-[0.12em]">Likes</span>
                        <span className="font-black text-white">{compactNumber(post.likes_count)}</span>
                      </div>
                      <Link
                        href={`/forum?edit=${post.id}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/80 transition hover:border-accent-blue/25 hover:bg-accent-blue/10 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteDialog({ postId: post.id, title: post.title })}
                        disabled={deletingPostId === post.id}
                        className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/12 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingPostId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
              </div>
            </section>
          )}
        </section>
      </div>

      {deleteDialog ? (
        <div className="fixed inset-0 z-[142] flex items-center justify-center px-4">
          <button
            type="button"
            onClick={closeDeleteDialog}
            aria-label="Close delete confirmation"
            className="absolute inset-0 bg-black/82 backdrop-blur-[2px]"
            disabled={Boolean(deletingPostId)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Delete post confirmation"
            className="relative z-10 w-full max-w-md rounded-[28px] border border-red-400/35 bg-[linear-gradient(150deg,rgba(28,10,10,0.96)_0%,rgba(24,12,20,0.94)_52%,rgba(220,38,38,0.18)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-red-100">Delete thread</p>
                <p className="mt-1 truncate text-xs text-red-100/70">{deleteDialog.title || "Untitled thread"}</p>
              </div>
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={Boolean(deletingPostId)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-300/35 bg-red-500/12 text-red-100 hover:bg-red-500/22 disabled:opacity-60"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 rounded-2xl border border-red-300/25 bg-black/30 px-4 py-3 text-sm text-red-100/85">
              This permanently removes the thread, replies, likes, and votes for everyone.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={Boolean(deletingPostId)}
                className="rounded-full border border-white/18 bg-white/[0.06] px-3 py-3 text-xs font-black uppercase tracking-[0.11em] text-white/85 hover:bg-white/[0.1] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeletePost()}
                disabled={Boolean(deletingPostId)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-red-300/45 bg-red-500/25 px-3 py-3 text-xs font-black uppercase tracking-[0.11em] text-red-50 hover:bg-red-500/35 disabled:opacity-60"
              >
                {deletingPostId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {lightbox ? (
        <div className="fixed inset-0 z-[160]">
          <button
            type="button"
            onClick={closeImageLightbox}
            className="absolute inset-0 bg-black/94"
            aria-label="Close image viewer"
          />
          <section className="relative z-10 flex h-full w-full flex-col">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-3 sm:px-4 sm:pt-4">
              <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/72 px-2 py-2 text-white shadow-[0_16px_34px_rgba(0,0,0,0.55)] backdrop-blur">
                <span className="max-w-[180px] truncate px-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/85">
                  {lightbox.title} ({lightbox.index + 1}/{lightbox.urls.length})
                </span>
                <button
                  type="button"
                  onClick={() => setLightboxZoom((current) => Math.max(1, Number((current - 0.25).toFixed(2))))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/16 text-white transition hover:bg-white/24"
                  aria-label="Zoom out image"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/16 text-white transition hover:bg-white/24"
                  aria-label="Zoom in image"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={closeImageLightbox}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-red-500/35 text-white transition hover:bg-red-500/45"
                  aria-label="Close image viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-3 pt-16 sm:px-6 sm:pb-6 sm:pt-20">
              <div
                className="relative h-full w-full max-w-5xl touch-none overscroll-none overflow-hidden rounded-2xl border border-white/12 bg-black/65"
                style={{ touchAction: "none" }}
                onWheel={(event) => {
                  event.preventDefault();
                  if (event.deltaY < 0) {
                    setLightboxZoom((current) => Math.min(3, Number((current + 0.1).toFixed(2))));
                  } else {
                    setLightboxZoom((current) => Math.max(1, Number((current - 0.1).toFixed(2))));
                  }
                }}
                onTouchStart={(event) => {
                  if (event.touches.length >= 2) {
                    if (event.cancelable) event.preventDefault();
                    lightboxPinchStartDistance.current = touchDistance(event.touches);
                    lightboxPinchStartZoom.current = lightboxZoom;
                    lightboxTouchStartX.current = null;
                    return;
                  }
                  lightboxTouchStartX.current = event.changedTouches[0]?.clientX ?? null;
                }}
                onTouchMove={(event) => {
                  if (event.cancelable && (event.touches.length >= 2 || lightboxZoom > 1)) event.preventDefault();
                  if (event.touches.length < 2 || !lightboxPinchStartDistance.current) return;
                  const currentDistance = touchDistance(event.touches);
                  if (!currentDistance) return;
                  const scale = currentDistance / lightboxPinchStartDistance.current;
                  const nextZoom = Math.min(4, Math.max(1, Number((lightboxPinchStartZoom.current * scale).toFixed(2))));
                  setLightboxZoom(nextZoom);
                }}
                onTouchEnd={(event) => {
                  if (lightboxPinchStartDistance.current) {
                    if (event.touches.length >= 2) return;
                    lightboxPinchStartDistance.current = null;
                    lightboxPinchStartZoom.current = lightboxZoom;
                  }
                  const startX = lightboxTouchStartX.current;
                  lightboxTouchStartX.current = null;
                  const endX = event.changedTouches[0]?.clientX;
                  if (!startX || typeof endX !== "number" || lightbox.urls.length < 2) return;
                  const delta = endX - startX;
                  if (Math.abs(delta) < 42) return;
                  stepLightboxImage(delta > 0 ? -1 : 1);
                }}
              >
                {lightbox.urls.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => stepLightboxImage(-1)}
                      className="absolute left-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-white shadow-[0_10px_24px_rgba(0,0,0,0.55)] transition hover:bg-black/82"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stepLightboxImage(1)}
                      className="absolute right-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-white shadow-[0_10px_24px_rgba(0,0,0,0.55)] transition hover:bg-black/82"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}

                <div className="flex h-full w-full items-center justify-center overflow-auto p-2 sm:p-4">
                  <img
                    src={lightbox.urls[lightbox.index]}
                    alt={`Thread image ${lightbox.index + 1}`}
                    className="max-h-full max-w-full select-none object-contain transition-transform duration-150"
                    style={{ transform: `scale(${lightboxZoom})`, transformOrigin: "center center" }}
                    draggable={false}
                  />
                </div>
              </div>
            </div>

            <p className="pb-4 text-center text-xs text-white/60">
              Pinch to zoom. Swipe or use arrows to switch images.
            </p>
          </section>
        </div>
      ) : null}

      <nav
        className="forum-dock-float fixed inset-x-0 bottom-4 z-[124] mx-auto flex w-[min(92vw,282px)] items-center justify-between overflow-hidden rounded-[22px] border border-white/22 bg-[linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))] px-2 py-2 shadow-[0_20px_55px_rgba(2,7,20,0.55)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[linear-gradient(145deg,rgba(255,255,255,0.14),rgba(16,24,40,0.22))] md:hidden"
        aria-label="Forum mobile dock"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_12%_20%,rgba(37,99,235,0.28),transparent_42%),radial-gradient(circle_at_86%_18%,rgba(255,176,0,0.22),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_58%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.66),transparent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)]"
        />

        <button
          type="button"
          onClick={() => router.push("/forum#mobile-trending")}
          className="relative inline-flex min-w-[124px] flex-col items-center gap-1 rounded-[16px] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/82 transition-all duration-200 hover:bg-white/12 hover:text-white active:scale-[0.96]"
        >
          <Flame className="h-4 w-4 text-accent-amber" />
          Trending
        </button>

        <button
          type="button"
          aria-current="page"
          onClick={() => router.replace("/forum/me")}
          className="relative inline-flex min-w-[124px] flex-col items-center gap-1 rounded-[16px] border border-white/18 bg-white/14 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_rgba(37,99,235,0.16)] transition-all duration-200 hover:bg-white/18 active:scale-[0.96]"
        >
          <UserRound className="h-4 w-4" />
          Your Profile
        </button>
      </nav>
    </main>
  );
}

const forumGlobalStyles = `
  .forum-dock-float {
    animation: forumDockFloat 0.26s ease;
  }

  .forum-skeleton {
    position: relative;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
  }

  .forum-skeleton::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
    animation: forumShimmer 1.3s linear infinite;
  }

  @keyframes forumShimmer {
    100% {
      transform: translateX(100%);
    }
  }

  @keyframes forumDockFloat {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .forum-dock-float,
    .forum-skeleton::after {
      animation: none !important;
    }

    * {
      scroll-behavior: auto !important;
    }
  }
`;

