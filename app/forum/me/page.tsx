"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowBigDown, ArrowBigUp, Heart, MessageSquare, PenSquare } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";

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

type ForumComment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  is_anonymous: boolean;
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

function tagLabel(tag: string) {
  if (tag === "lost") return "Lost";
  if (tag === "help") return "Help";
  if (tag === "rant") return "Rant";
  if (tag === "events") return "Events";
  return "General";
}

export default function ForumMyPostsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<ForumProfile | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [coverByPostId, setCoverByPostId] = useState<Record<string, string>>({});
  const [repliesByPostId, setRepliesByPostId] = useState<Record<string, ForumComment[]>>({});
  const [profilesById, setProfilesById] = useState<Record<string, ForumProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTimeline = useCallback(
    async (uid: string) => {
      if (!uid) {
        setPosts([]);
        setCoverByPostId({});
        setRepliesByPostId({});
        setProfilesById({});
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

      let imageMap: Record<string, string> = {};
      let replyMap: Record<string, ForumComment[]> = {};
      let replyProfilesMap: Record<string, ForumProfile> = {};

      if (postIds.length) {
        const [{ data: imageRows }, { data: replyRows }] = await Promise.all([
          supabase
            .from("forum_post_images")
            .select("post_id, storage_path, display_order, created_at")
            .in("post_id", postIds)
            .order("display_order", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("forum_comments")
            .select("id, post_id, author_id, parent_comment_id, body, is_anonymous, created_at")
            .in("post_id", postIds)
            .order("created_at", { ascending: false })
            .limit(1200),
        ]);

        imageMap = {};
        ((imageRows || []) as Array<{ post_id: string; storage_path: string }>).forEach((row) => {
          if (imageMap[row.post_id]) return;
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
          const publicUrl = String(data.publicUrl || "");
          if (publicUrl) imageMap[row.post_id] = publicUrl;
        });

        const replies = (replyRows || []) as ForumComment[];
        replyMap = {};
        const replyAuthorIds = new Set<string>();
        replies.forEach((reply) => {
          if (!replyMap[reply.post_id]) replyMap[reply.post_id] = [];
          if (replyMap[reply.post_id].length >= 3) return;
          replyMap[reply.post_id].push(reply);
          if (!reply.is_anonymous) replyAuthorIds.add(reply.author_id);
        });

        const profileIds = Array.from(replyAuthorIds);
        if (profileIds.length) {
          const { data: profileRows } = await supabase.rpc("forum_public_profiles", { _ids: profileIds });
          ((profileRows || []) as ForumProfile[]).forEach((entry) => {
            replyProfilesMap[entry.id] = entry;
          });
        }
      }

      setPosts(rows);
      setCoverByPostId(imageMap);
      setRepliesByPostId(replyMap);
      setProfilesById(replyProfilesMap);
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

  const totalLikes = useMemo(
    () => posts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0),
    [posts]
  );
  const totalReplies = useMemo(
    () => posts.reduce((sum, post) => sum + Number(post.comments_count || 0), 0),
    [posts]
  );
  const selfTag = usernameOf(profile);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(255,176,0,0.16),transparent_42%),#050505] px-4 pb-16 pt-32 text-white md:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="overflow-hidden rounded-[28px] border border-accent-blue/35 bg-[linear-gradient(140deg,rgba(9,14,32,0.96)_0%,rgba(14,23,46,0.88)_46%,rgba(37,99,235,0.18)_100%)] shadow-[0_20px_80px_rgba(0,0,0,0.58)]">
          <div className="h-24 bg-[radial-gradient(circle_at_22%_20%,rgba(37,99,235,0.34),transparent_48%),radial-gradient(circle_at_78%_12%,rgba(255,176,0,0.3),transparent_45%)] sm:h-32" />
          <div className="px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="-mt-8 flex flex-col gap-4 sm:-mt-10 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-3">
                <span className="relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-accent-blue/45 bg-[#0d1533] text-xl font-black uppercase shadow-[0_10px_24px_rgba(0,0,0,0.45)] sm:h-20 sm:w-20 sm:text-2xl">
                  {profile?.avatar_url ? (
                    <Image src={profile.avatar_url} alt={nameOf(profile)} fill className="object-cover" />
                  ) : (
                    String(nameOf(profile)).charAt(0).toUpperCase()
                  )}
                </span>
                <div className="pb-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFB000]">Forum Profile</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{nameOf(profile)}</h1>
                    {profile?.email_verified ? (
                      <img src="/blue_tick.gif" alt="Verified" className="h-5 w-5 rounded-full object-cover" />
                    ) : null}
                  </div>
                  <p className="text-sm text-white/65">{selfTag || "Your posts timeline"}</p>
                </div>
              </div>

              <div className="relative z-20 flex flex-wrap gap-2">
                <Link
                  href="/forum"
                  className="pointer-events-auto inline-flex items-center rounded-xl border border-accent-blue/35 bg-accent-blue/16 px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-white"
                >
                  Back to Forum
                </Link>
                <Link
                  href="/forum?compose=1"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-accent-amber/40 bg-accent-amber/16 px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-accent-amber"
                >
                  <PenSquare className="h-3.5 w-3.5" />
                  New Post
                </Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:max-w-md">
              <div className="rounded-xl border border-accent-blue/25 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">Posts</p>
                <p className="mt-1 text-lg font-black">{posts.length}</p>
              </div>
              <div className="rounded-xl border border-accent-blue/25 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">Likes</p>
                <p className="mt-1 text-lg font-black">{totalLikes}</p>
              </div>
              <div className="rounded-xl border border-accent-blue/25 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">Replies</p>
                <p className="mt-1 text-lg font-black">{totalReplies}</p>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-3xl border border-accent-blue/22 bg-black/28">
          <div className="border-b border-accent-blue/20 bg-accent-blue/12 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/85">
            Your Posts & Replies
          </div>

          {loading ? (
            <div className="space-y-0">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-44 animate-pulse border-b border-accent-blue/18 bg-white/[0.03]" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center">
              <h2 className="text-xl font-black">No posts yet</h2>
              <p className="mt-2 text-sm text-white/65">Post once in forum and your timeline with replies shows up here.</p>
              <Link href="/forum?compose=1" className="mt-4 inline-flex rounded-xl border border-accent-blue/40 bg-accent-blue/20 px-4 py-2 text-xs font-black uppercase tracking-[0.12em]">
                Create your first post
              </Link>
            </div>
          ) : (
            <div>
              {posts.map((post) => {
                const cover = coverByPostId[post.id] || "";
                const replies = repliesByPostId[post.id] || [];
                return (
                  <article key={post.id} className="border-b border-accent-blue/18 bg-[linear-gradient(155deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.01)_100%)] p-4 transition-colors hover:bg-white/[0.04] md:p-5">
                    <Link href={`/forum/${post.id}`} className="block">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-accent-blue/35 bg-accent-blue/16 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]">{tagLabel(post.tag)}</span>
                          {post.relation_type ? (
                            <span className="rounded-full border border-accent-amber/40 bg-accent-amber/16 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-accent-amber">
                              {post.relation_type === "lost_found" ? "Lost & Found" : "Event"}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] font-bold text-white/50">{ago(post.created_at)}</p>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <p className="text-base font-black">{nameOf(profile)}</p>
                        {profile?.email_verified ? (
                          <img src="/blue_tick.gif" alt="Verified" className="h-4 w-4 rounded-full object-cover" />
                        ) : null}
                        <p className="text-xs text-white/55">{selfTag}</p>
                      </div>

                      <h2 className="mt-2 text-xl font-black tracking-tight">{post.title}</h2>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{post.body}</p>

                      {cover ? (
                        <img src={cover} alt={post.title} className="mt-3 h-48 w-full rounded-2xl border border-accent-blue/20 object-cover sm:h-56" loading="lazy" />
                      ) : null}
                    </Link>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/75">
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-2.5 py-1">
                        <ArrowBigUp className="h-3.5 w-3.5" />
                        {post.upvotes_count}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-2.5 py-1">
                        <ArrowBigDown className="h-3.5 w-3.5" />
                        {post.downvotes_count}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-2.5 py-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {post.comments_count}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-pink-400/45 bg-pink-500/20 px-2.5 py-1 text-pink-100">
                        <Heart className="h-3.5 w-3.5 fill-current" />
                        {post.likes_count}
                      </span>
                    </div>

                    {replies.length ? (
                      <div className="mt-4 rounded-2xl border border-accent-blue/20 bg-black/25 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Recent Replies</p>
                        <div className="mt-2 space-y-2">
                          {replies.map((reply) => {
                            const replyProfile = reply.is_anonymous ? null : profilesById[reply.author_id] || null;
                            const replyTag = reply.is_anonymous ? "" : usernameOf(replyProfile);
                            return (
                              <div key={reply.id} className="rounded-xl border border-accent-blue/18 bg-black/30 px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <p className="truncate text-xs font-bold">{reply.is_anonymous ? "Anonymous Student" : nameOf(replyProfile)}</p>
                                  {!reply.is_anonymous && replyProfile?.email_verified ? (
                                    <img src="/blue_tick.gif" alt="Verified" className="h-3 w-3 rounded-full object-cover" />
                                  ) : null}
                                  <p className="truncate text-[10px] text-white/50">{replyTag ? `${replyTag} · ` : ""}{ago(reply.created_at)}</p>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-white/78">{reply.body}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-white/52">No replies yet on this post.</p>
                    )}
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
