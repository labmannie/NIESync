"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowBigDown, ArrowBigUp, Heart, MessageSquare } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";

type ForumPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  tag: string;
  is_anonymous: boolean;
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
};

type LikeRow = {
  post_id: string;
  created_at: string;
};

const BUCKET = "forum-images";

function formatAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const sec = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

export default function LikedPostsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [likedPosts, setLikedPosts] = useState<Array<ForumPost & { liked_at: string }>>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ForumProfile>>({});
  const [coverByPostId, setCoverByPostId] = useState<Record<string, string>>({});

  const loadLikedPosts = useCallback(
    async (uid: string) => {
      if (!uid) {
        setLikedPosts([]);
        setProfilesById({});
        setCoverByPostId({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data: likes, error: likesError } = await supabase
        .from("forum_post_likes")
        .select("post_id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(120);

      if (likesError) {
        setError(likesError.message || "Unable to load liked posts.");
        setLoading(false);
        return;
      }

      const likeRows = (likes || []) as LikeRow[];
      if (likeRows.length === 0) {
        setLikedPosts([]);
        setProfilesById({});
        setCoverByPostId({});
        setLoading(false);
        return;
      }

      const postIds = likeRows.map((row) => row.post_id);

      const [{ data: posts, error: postsError }, { data: images }] = await Promise.all([
        supabase
          .from("forum_posts")
          .select("id, author_id, title, body, tag, is_anonymous, comments_count, upvotes_count, downvotes_count, likes_count, created_at")
          .in("id", postIds),
        supabase
          .from("forum_post_images")
          .select("post_id, storage_path")
          .in("post_id", postIds)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (postsError) {
        setError(postsError.message || "Unable to load liked posts.");
        setLoading(false);
        return;
      }

      const postMap = new Map<string, ForumPost>();
      ((posts || []) as ForumPost[]).forEach((post) => postMap.set(post.id, post));
      const ordered: Array<ForumPost & { liked_at: string }> = likeRows
        .map((likeRow) => {
          const post = postMap.get(likeRow.post_id);
          return post ? { ...post, liked_at: likeRow.created_at } : null;
        })
        .filter(Boolean) as Array<ForumPost & { liked_at: string }>;

      const authorIds = Array.from(new Set(ordered.filter((post) => !post.is_anonymous).map((post) => post.author_id)));
      const { data: profiles } = authorIds.length
        ? await supabase.rpc("forum_public_profiles", { _ids: authorIds })
        : ({ data: [] } as any);

      const profileMap: Record<string, ForumProfile> = {};
      ((profiles || []) as ForumProfile[]).forEach((profile) => {
        profileMap[profile.id] = profile;
      });

      const imageMap: Record<string, string> = {};
      ((images || []) as Array<{ post_id: string; storage_path: string }>).forEach((row) => {
        if (imageMap[row.post_id]) return;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
        const publicUrl = String(data.publicUrl || "");
        if (publicUrl) imageMap[row.post_id] = publicUrl;
      });

      setLikedPosts(ordered);
      setProfilesById(profileMap);
      setCoverByPostId(imageMap);
      setLoading(false);
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

      setUserId(user.id);
      await loadLikedPosts(user.id);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [loadLikedPosts, supabase]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile-likes-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_post_likes", filter: `user_id=eq.${userId}` },
        () => void loadLikedPosts(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, loadLikedPosts]);

  return (
    <main className="campus-app-gradient min-h-screen px-4 pb-16 pt-32 text-white md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.14)_0%,rgba(255,176,0,0.1)_55%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.5)] md:p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Profile</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">Liked Forum Posts</h1>
          <p className="mt-2 text-sm text-white/70">
            All posts you have liked in the campus forum.
          </p>
        </header>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <section className="mt-5">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
              ))}
            </div>
          ) : likedPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
              <Heart className="mx-auto h-8 w-8 text-white/45" />
              <h2 className="mt-3 text-xl font-black text-white">No liked posts yet</h2>
              <p className="mt-2 text-sm text-white/60">Like posts in the forum to save them here.</p>
              <Link
                href="/forum"
                className="mt-4 inline-flex rounded-xl border border-accent-blue/40 bg-accent-blue/20 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white"
              >
                Go to Forum
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {likedPosts.map((post) => {
                const profile = post.is_anonymous ? null : profilesById[post.author_id] || null;
                const cover = coverByPostId[post.id] || "";
                return (
                  <article
                    key={post.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_14px_44px_rgba(0,0,0,0.4)]"
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={post.title}
                        className="mb-4 h-40 w-full rounded-xl border border-white/10 object-cover"
                        loading="lazy"
                      />
                    ) : null}

                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                      Liked {formatAgo(post.liked_at)}
                    </p>
                    <h2 className="mt-1 text-xl font-black tracking-tight text-white">{post.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/75">{post.body}</p>

                    <p className="mt-3 text-xs text-white/55">
                      {post.is_anonymous ? "Anonymous Student" : nameOf(profile)}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1">
                        <ArrowBigUp className="h-3.5 w-3.5 text-emerald-200" />
                        {post.upvotes_count}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1">
                        <ArrowBigDown className="h-3.5 w-3.5 text-rose-200" />
                        {post.downvotes_count}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {post.comments_count}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-pink-400/35 bg-pink-500/15 px-2 py-1 text-pink-100">
                        <Heart className="h-3.5 w-3.5 fill-current" />
                        {post.likes_count}
                      </span>
                    </div>

                    <Link
                      href={`/forum/${post.id}`}
                      className="mt-4 inline-flex rounded-lg border border-accent-blue/40 bg-accent-blue/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white"
                    >
                      Open in Forum
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
