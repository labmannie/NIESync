"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowBigDown,
  ArrowBigUp,
  CornerDownRight,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  PenSquare,
  Search,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";
import { MobileToast } from "@/components/MobileToast";

type ForumTag = "lost" | "help" | "rant" | "events" | "general";
type RelationType = "lost_found" | "event" | null;
type FeedMode = "latest" | "trending";
type TagFilter = ForumTag | "all";
type RelationFilter = "all" | "lost_found" | "event";

type ForumPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  tag: ForumTag;
  relation_type: RelationType;
  location_label: string | null;
  is_anonymous: boolean;
  comments_count: number;
  upvotes_count: number;
  downvotes_count: number;
  likes_count: number;
  score: number;
  image_count: number;
  created_at: string;
  updated_at: string;
};

type ForumComment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  is_anonymous: boolean;
  body: string;
  upvotes_count: number;
  downvotes_count: number;
  created_at: string;
  updated_at: string;
};

type ForumProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  email_verified: boolean | null;
};

type DraftImage = { file: File; preview: string };
type ShareDialogState = { postId: string; title: string };

const BUCKET = "forum-images";
const MAX_IMAGES = 6;
const MAX_SOURCE_IMAGE_SIZE = 18 * 1024 * 1024;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const TARGET_IMAGE_SIZE = 1.6 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const defaultForm = {
  title: "",
  body: "",
  tag: "help" as ForumTag,
  relation_type: null as RelationType,
  location: "",
  anonymous: false,
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clean(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function ago(value: string) {
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

function usernameOf(profile: ForumProfile | null) {
  const username = String(profile?.username || "").trim();
  return username ? `@${username}` : "";
}

function isVerified(profile: ForumProfile | null) {
  return profile?.email_verified === true;
}

function VerifiedGif({ sizeClass = "h-4 w-4" }: { sizeClass?: string }) {
  return <img src="/blue_tick.gif" alt="Verified" className={cx(sizeClass, "shrink-0 rounded-full object-cover")} loading="lazy" />;
}

function initialOf(profile: ForumProfile | null) {
  const username = String(profile?.username || "").trim();
  if (username) return username.charAt(0).toUpperCase();
  const first = String(profile?.first_name || "").trim();
  if (first) return first.charAt(0).toUpperCase();
  return "U";
}

function tagLabel(tag: ForumTag) {
  if (tag === "events") return "Events";
  if (tag === "lost") return "Lost";
  if (tag === "rant") return "Rant";
  if (tag === "help") return "Help";
  return "General";
}

function trendScore(post: ForumPost) {
  const ageH = Math.max(1, (Date.now() - new Date(post.created_at).getTime()) / 3600000);
  const weight = post.score * 4 + post.comments_count * 2 + post.likes_count * 1.5 + post.image_count * 0.4;
  return weight / Math.pow(ageH + 2, 1.15);
}

function ext(file: File) {
  const byName = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (byName && /^[a-z0-9]{2,5}$/.test(byName)) return byName;
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("gif")) return "gif";
  return "jpg";
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  if (typeof window === "undefined") throw new Error("Image compression is only supported in browser context.");
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image."));
    };
    image.src = objectUrl;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;

  const source = await loadImageElement(file);
  const maxDimension = 2200;
  const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, width, height);

  let outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  let quality = outputType === "image/jpeg" ? 0.86 : undefined;
  let blob = await canvasToBlob(canvas, outputType, quality);
  if (!blob) return file;

  if (outputType === "image/png" && blob.size > MAX_IMAGE_SIZE) {
    outputType = "image/jpeg";
    quality = 0.9;
    blob = await canvasToBlob(canvas, outputType, quality);
    if (!blob) return file;
  }

  while (quality && blob.size > TARGET_IMAGE_SIZE && quality > 0.56) {
    quality = Math.max(0.56, quality - 0.08);
    const nextBlob = await canvasToBlob(canvas, outputType, quality);
    if (!nextBlob) break;
    blob = nextBlob;
  }

  if (blob.size > MAX_IMAGE_SIZE) {
    throw new Error(`${file.name}: image is still too large after compression.`);
  }

  const nextExt = outputType === "image/png" ? "png" : "jpg";
  const base = String(file.name || "image").replace(/\.[^.]+$/, "");
  const compressed = new File([blob], `${base}.${nextExt}`, {
    type: outputType,
    lastModified: Date.now(),
  });

  return compressed.size < file.size ? compressed : file;
}

export default function ForumPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ postId?: string }>();
  const routePostId = clean(typeof params?.postId === "string" ? params.postId : "");
  const detailMode = Boolean(routePostId);

  const [isBooting, setIsBooting] = useState(true);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const [feedNotice, setFeedNotice] = useState("");
  const [mobileToast, setMobileToast] = useState<{ kind: "error" | "success" | "info"; message: string } | null>(null);

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ForumProfile>>({});
  const [imagesByPostId, setImagesByPostId] = useState<Record<string, string[]>>({});
  const [votesByPostId, setVotesByPostId] = useState<Record<string, -1 | 1 | 0>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likeAnimatingIds, setLikeAnimatingIds] = useState<Set<string>>(new Set());
  const [loadingFeed, setLoadingFeed] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [mode, setMode] = useState<FeedMode>("latest");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [relationFilter, setRelationFilter] = useState<RelationFilter>("all");
  const [shareDialog, setShareDialog] = useState<ShareDialogState | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"create" | "edit">("create");
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [formError, setFormError] = useState("");
  const [savingPost, setSavingPost] = useState(false);

  const [activePostId, setActivePostId] = useState("");
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [commentProfilesById, setCommentProfilesById] = useState<Record<string, ForumProfile>>({});
  const [commentVotes, setCommentVotes] = useState<Record<string, -1 | 1 | 0>>({});
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);

  const feedVersion = useRef(0);
  const commentVersion = useRef(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const likeAnimationTimers = useRef<Record<string, number>>({});
  const shareCopiedTimer = useRef<number | null>(null);

  const raiseMobileToast = useCallback((kind: "error" | "success" | "info", message: string) => {
    const text = clean(message);
    if (!text) return;
    setMobileToast({ kind, message: text });
  }, []);

  const clearDraftImages = useCallback(() => {
    setDraftImages((current) => {
      current.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
  }, []);

  const resetComposer = useCallback(() => {
    setForm({ ...defaultForm });
    setFormError("");
    clearDraftImages();
    setEditingPost(null);
    setComposerMode("create");
  }, [clearDraftImages]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    resetComposer();
  }, [resetComposer]);

  const fetchPublicProfiles = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return {} as Record<string, ForumProfile>;
      const { data, error: profileError } = await supabase.rpc("forum_public_profiles", { _ids: ids });
      if (profileError) return {} as Record<string, ForumProfile>;

      const map: Record<string, ForumProfile> = {};
      ((data || []) as ForumProfile[]).forEach((row) => {
        map[row.id] = row;
      });
      return map;
    },
    [supabase]
  );

  const renderPostImages = (images: string[], title: string) => {
    if (!images.length) return null;
    if (images.length === 1) {
      return (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <img src={images[0]} alt={`${title} image 1`} className="h-[300px] w-full object-cover md:h-[420px]" loading="lazy" />
        </div>
      );
    }

    if (images.length === 2) {
      return (
        <div className="mt-4 grid h-[260px] grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-white/10 md:h-[330px]">
          {images.slice(0, 2).map((url, idx) => (
            <img key={`${url}-${idx}`} src={url} alt={`${title} image ${idx + 1}`} className="h-full w-full object-cover" loading="lazy" />
          ))}
        </div>
      );
    }

    if (images.length === 3) {
      return (
        <div className="mt-4 grid h-[320px] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl border border-white/10">
          <img src={images[0]} alt={`${title} image 1`} className="row-span-2 h-full w-full object-cover" loading="lazy" />
          <img src={images[1]} alt={`${title} image 2`} className="h-full w-full object-cover" loading="lazy" />
          <img src={images[2]} alt={`${title} image 3`} className="h-full w-full object-cover" loading="lazy" />
        </div>
      );
    }

    const visible = images.slice(0, 4);
    const extra = Math.max(0, images.length - visible.length);

    return (
      <div className="mt-4 grid h-[320px] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl border border-white/10">
        {visible.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative h-full w-full">
            <img src={url} alt={`${title} image ${idx + 1}`} className="h-full w-full object-cover" loading="lazy" />
            {idx === 3 && extra > 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-black text-white">+{extra}</div>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const loadFeed = useCallback(
    async (uid: string, showLoader = true) => {
      const version = ++feedVersion.current;
      if (!uid) {
        setPosts([]);
        setProfilesById({});
        setImagesByPostId({});
        setVotesByPostId({});
        setLikedIds(new Set());
        setLoadingFeed(false);
        return;
      }

      if (showLoader) setLoadingFeed(true);
      setFeedError("");
      if (showLoader) setFeedNotice("");

      let q = supabase.from("forum_posts").select(
        "id, author_id, title, body, tag, relation_type, location_label, is_anonymous, comments_count, upvotes_count, downvotes_count, likes_count, score, image_count, created_at, updated_at"
      );

      if (detailMode && routePostId) {
        q = q.eq("id", routePostId).limit(1);
      } else {
        q = q.order("created_at", { ascending: false }).limit(120);
        if (tagFilter !== "all") q = q.eq("tag", tagFilter);
        if (relationFilter !== "all") q = q.eq("relation_type", relationFilter);
      }

      const { data, error: postsError } = await q;
      if (version !== feedVersion.current) return;

      if (postsError) {
        setFeedError(postsError.message || "Unable to load forum feed.");
        setPosts([]);
        if (showLoader) setLoadingFeed(false);
        return;
      }

      let rows = (data || []) as ForumPost[];
      if (!detailMode) {
        const query = clean(searchTerm).toLowerCase();
        rows = rows.filter((post) => {
          if (query.length < 3) return true;
          return (
            String(post.title || "").toLowerCase().includes(query) ||
            String(post.body || "").toLowerCase().includes(query) ||
            String(post.location_label || "").toLowerCase().includes(query)
          );
        });
        rows = mode === "trending" ? [...rows].sort((a, b) => trendScore(b) - trendScore(a)) : rows;
        rows = rows.slice(0, 60);
      }

      const ids = rows.map((post) => post.id);
      const authorIds = Array.from(new Set(rows.filter((post) => !post.is_anonymous).map((post) => post.author_id)));

      const profilePromise = fetchPublicProfiles(authorIds);
      const imagePromise = ids.length
        ? supabase
            .from("forum_post_images")
            .select("id, post_id, storage_path, display_order, created_at")
            .in("post_id", ids)
            .order("display_order", { ascending: true })
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any);
      const votePromise = ids.length
        ? supabase
            .from("forum_post_reactions")
            .select("post_id, user_id, reaction")
            .eq("user_id", uid)
            .in("post_id", ids)
        : Promise.resolve({ data: [], error: null } as any);
      const likePromise = ids.length
        ? supabase.from("forum_post_likes").select("post_id, user_id").eq("user_id", uid).in("post_id", ids)
        : Promise.resolve({ data: [], error: null } as any);

      const [profileRes, imageRes, voteRes, likeRes] = await Promise.all([
        profilePromise,
        imagePromise,
        votePromise,
        likePromise,
      ]);
      if (version !== feedVersion.current) return;

      const nextProfiles = profileRes;

      const nextImages: Record<string, string[]> = {};
      ((imageRes.data || []) as Array<{ post_id: string; storage_path: string }>).forEach((row) => {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
        const url = String(urlData.publicUrl || "");
        if (!url) return;
        if (!nextImages[row.post_id]) nextImages[row.post_id] = [];
        nextImages[row.post_id].push(url);
      });

      const nextVotes: Record<string, -1 | 1 | 0> = {};
      ((voteRes.data || []) as Array<{ post_id: string; reaction: -1 | 1 }>).forEach((row) => {
        nextVotes[row.post_id] = row.reaction;
      });

      const nextLiked = new Set<string>();
      ((likeRes.data || []) as Array<{ post_id: string }>).forEach((row) => {
        nextLiked.add(row.post_id);
      });

      setPosts(rows);
      if (detailMode) {
        setActivePostId(rows[0]?.id || "");
      }
      setProfilesById(nextProfiles);
      setImagesByPostId(nextImages);
      setVotesByPostId(nextVotes);
      setLikedIds(nextLiked);
      if (showLoader) setLoadingFeed(false);
    },
    [detailMode, fetchPublicProfiles, mode, relationFilter, routePostId, searchTerm, supabase, tagFilter]
  );

  const loadComments = useCallback(
    async (postId: string, uid: string, showLoader = true) => {
      const version = ++commentVersion.current;
      if (!postId) {
        setComments([]);
        setCommentProfilesById({});
        setCommentVotes({});
        setLoadingComments(false);
        return;
      }

      if (showLoader) setLoadingComments(true);
      setCommentError("");

      const { data, error: cError } = await supabase
        .from("forum_comments")
        .select(
          "id, post_id, author_id, parent_comment_id, is_anonymous, body, upvotes_count, downvotes_count, created_at, updated_at"
        )
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(400);
      if (version !== commentVersion.current) return;

      if (cError) {
        setCommentError(cError.message || "Unable to load comments.");
        setComments([]);
        if (showLoader) setLoadingComments(false);
        return;
      }

      const rows = (data || []) as ForumComment[];
      const authorIds = Array.from(new Set(rows.filter((row) => !row.is_anonymous).map((row) => row.author_id)));
      const commentIds = rows.map((row) => row.id);

      const profilePromise = fetchPublicProfiles(authorIds);
      const votePromise = commentIds.length
        ? supabase
            .from("forum_comment_reactions")
            .select("comment_id, user_id, reaction")
            .eq("user_id", uid)
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [], error: null } as any);

      const [profileRes, voteRes] = await Promise.all([profilePromise, votePromise]);
      if (version !== commentVersion.current) return;

      const nextProfiles = profileRes;

      const nextVotes: Record<string, -1 | 1 | 0> = {};
      ((voteRes.data || []) as Array<{ comment_id: string; reaction: -1 | 1 }>).forEach((row) => {
        nextVotes[row.comment_id] = row.reaction;
      });

      setComments(rows);
      setCommentProfilesById(nextProfiles);
      setCommentVotes(nextVotes);
      if (showLoader) setLoadingComments(false);
    },
    [fetchPublicProfiles, supabase]
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setIsBooting(true);
      setError("");
      try {
        const { user, errorMessage } = await resolveClientUser(supabase);
        if (!active) return;
        if (!user?.id) {
          if (errorMessage) setError(errorMessage);
          window.location.href = "/login";
          return;
        }
        setUserId(user.id);
      } catch (e: any) {
        if (!active) return;
        setError(String(e?.message || "Unable to initialize forum."));
      } finally {
        if (active) setIsBooting(false);
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    const value = clean(searchInput);
    if (!value || value.length < 3) {
      setSearchTerm("");
      return;
    }
    const timer = window.setTimeout(() => setSearchTerm(value), 320);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!routePostId) return;
    setActivePostId(routePostId);
    setReplyToId(null);
    setCommentAnonymous(false);
  }, [routePostId]);

  useEffect(() => {
    if (!composerOpen) return;
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [composerOpen, composerMode, editingPost?.id]);

  useEffect(() => {
    if (detailMode) return;
    if (typeof window === "undefined") return;
    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.get("compose") !== "1") return;
    if (!composerOpen) {
      resetComposer();
      setComposerOpen(true);
    }
    const hasOtherParams = Array.from(currentParams.keys()).some((key) => key !== "compose");
    if (hasOtherParams) return;
    router.replace("/forum", { scroll: false });
  }, [composerOpen, detailMode, resetComposer, router]);

  useEffect(() => {
    if (!userId) return;
    void loadFeed(userId, true);
  }, [userId, loadFeed]);

  useEffect(() => {
    if (detailMode) return;
    posts.slice(0, 24).forEach((post) => {
      router.prefetch(`/forum/${post.id}`);
    });
  }, [detailMode, posts, router]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`forum-feed-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_posts" }, () => {
        void loadFeed(userId, false);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, loadFeed]);

  useEffect(() => {
    if (!activePostId || !userId) return;
    void loadComments(activePostId, userId, true);
  }, [activePostId, userId, loadComments]);

  useEffect(() => {
    if (!activePostId || !userId) return;
    const channel = supabase
      .channel(`forum-comments-${activePostId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_comments", filter: `post_id=eq.${activePostId}` },
        () => void loadComments(activePostId, userId, false)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activePostId, userId, loadComments]);

  useEffect(() => {
    if (!shareDialog) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShareDialog(null);
      setShareCopied(false);
      if (shareCopiedTimer.current) {
        window.clearTimeout(shareCopiedTimer.current);
        shareCopiedTimer.current = null;
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [shareDialog]);

  useEffect(() => {
    return () => {
      Object.values(likeAnimationTimers.current).forEach((timerId) => window.clearTimeout(timerId));
      likeAnimationTimers.current = {};
      if (shareCopiedTimer.current) {
        window.clearTimeout(shareCopiedTimer.current);
        shareCopiedTimer.current = null;
      }
      setDraftImages((current) => {
        current.forEach((img) => URL.revokeObjectURL(img.preview));
        return [];
      });
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    raiseMobileToast("error", error);
  }, [error, raiseMobileToast]);

  useEffect(() => {
    if (!feedError) return;
    raiseMobileToast("error", feedError);
  }, [feedError, raiseMobileToast]);

  useEffect(() => {
    if (!feedNotice) return;
    raiseMobileToast("success", feedNotice);
  }, [feedNotice, raiseMobileToast]);

  useEffect(() => {
    if (!formError) return;
    raiseMobileToast("error", formError);
  }, [formError, raiseMobileToast]);

  useEffect(() => {
    if (!commentError) return;
    raiseMobileToast("error", commentError);
  }, [commentError, raiseMobileToast]);

  const trending = useMemo(() => {
    return [...posts].sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 6);
  }, [posts]);

  const commentsByParent = useMemo(() => {
    const map: Record<string, ForumComment[]> = {};
    comments.forEach((row) => {
      const key = row.parent_comment_id || "__root__";
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    return map;
  }, [comments]);

  const openComposer = (post?: ForumPost) => {
    if (post) {
      setComposerMode("edit");
      setEditingPost(post);
      setForm({
        title: post.title,
        body: post.body,
        tag: post.tag,
        relation_type: post.relation_type,
        location: String(post.location_label || ""),
        anonymous: Boolean(post.is_anonymous),
      });
      setFormError("");
      clearDraftImages();
      setComposerOpen(true);
      return;
    }

    setComposerMode("create");
    resetComposer();
    setComposerOpen(true);
  };

  const triggerLikeAnimation = useCallback((postId: string) => {
    const existing = likeAnimationTimers.current[postId];
    if (existing) window.clearTimeout(existing);

    setLikeAnimatingIds((current) => {
      const next = new Set(current);
      next.add(postId);
      return next;
    });

    likeAnimationTimers.current[postId] = window.setTimeout(() => {
      setLikeAnimatingIds((current) => {
        if (!current.has(postId)) return current;
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
      delete likeAnimationTimers.current[postId];
    }, 520);
  }, []);

  const pickImages = (files: FileList | null) => {
    if (!files) return;
    const available = Math.max(0, MAX_IMAGES - draftImages.length);
    if (available <= 0) {
      setFormError(`You can upload up to ${MAX_IMAGES} images.`);
      return;
    }

    const selected: DraftImage[] = [];
    const errors: string[] = [];
    Array.from(files)
      .slice(0, available)
      .forEach((file) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: unsupported format.`);
          return;
        }
        if (file.size > MAX_SOURCE_IMAGE_SIZE) {
          errors.push(`${file.name}: max 18MB source image.`);
          return;
        }
        if (file.type === "image/gif" && file.size > MAX_IMAGE_SIZE) {
          errors.push(`${file.name}: GIF must be 8MB or smaller.`);
          return;
        }
        selected.push({ file, preview: URL.createObjectURL(file) });
      });

    if (selected.length) setDraftImages((current) => [...current, ...selected]);
    if (errors.length) setFormError(errors.join(" "));
  };

  const removeDraftImage = (index: number) => {
    setDraftImages((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((_, i) => i !== index);
    });
  };

  const uploadImages = useCallback(
    async (postId: string, files: File[], startOrder: number) => {
      if (!userId || !files.length) return { ok: true as const };
      const rows: Array<{ post_id: string; storage_path: string; display_order: number }> = [];
      for (let i = 0; i < files.length; i += 1) {
        const sourceFile = files[i];
        let file = sourceFile;
        try {
          file = await compressImageForUpload(sourceFile);
        } catch (compressionError: any) {
          return {
            ok: false as const,
            error: String(compressionError?.message || `${sourceFile.name}: image compression failed.`),
          };
        }

        if (file.size > MAX_IMAGE_SIZE) {
          return {
            ok: false as const,
            error: `${file.name}: must be 8MB or smaller after compression.`,
          };
        }

        const path = `${userId}/${postId}/${Date.now()}-${i}-${crypto.randomUUID()}.${ext(file)}`;
        const { error: upError } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        });
        if (upError) return { ok: false as const, error: upError.message || "Image upload failed." };
        rows.push({ post_id: postId, storage_path: path, display_order: startOrder + i });
      }
      const { error: rowError } = await supabase.from("forum_post_images").insert(rows);
      if (rowError) return { ok: false as const, error: rowError.message || "Unable to save image rows." };
      return { ok: true as const };
    },
    [supabase, userId]
  );

  const savePost = async () => {
    if (!userId || savingPost) return;
    const title = clean(form.title);
    const body = clean(form.body);
    const location = clean(form.location);

    if (title.length < 4 || title.length > 140) return setFormError("Title must be 4-140 characters.");
    if (body.length < 10 || body.length > 5000) return setFormError("Body must be 10-5000 characters.");
    if (location && (location.length < 2 || location.length > 120)) return setFormError("Location must be 2-120 characters.");

    setSavingPost(true);
    setFormError("");

    try {
      if (composerMode === "create") {
        const { data, error: pError } = await supabase
          .from("forum_posts")
          .insert({
            author_id: userId,
            title,
            body,
            tag: form.tag,
            relation_type: form.relation_type,
            location_label: location || null,
            is_anonymous: form.anonymous === true,
          })
          .select("id, image_count")
          .single();
        if (pError || !data) throw new Error(pError?.message || "Unable to create post.");

        const upload = await uploadImages(
          String((data as any).id || ""),
          draftImages.map((img) => img.file),
          0
        );
        if (!upload.ok) throw new Error(upload.error);

        await loadFeed(userId, false);
        setActivePostId(String((data as any).id || ""));
      } else if (editingPost) {
        const { error: upError } = await supabase
          .from("forum_posts")
          .update({
            title,
            body,
            tag: form.tag,
            relation_type: form.relation_type,
            location_label: location || null,
            is_anonymous: form.anonymous === true,
          })
          .eq("id", editingPost.id)
          .eq("author_id", userId);
        if (upError) throw new Error(upError.message || "Unable to update post.");

        if (draftImages.length) {
          const existing = Number(editingPost.image_count || 0);
          if (existing + draftImages.length > MAX_IMAGES) {
            throw new Error(`This post can hold up to ${MAX_IMAGES} images.`);
          }
          const upload = await uploadImages(
            editingPost.id,
            draftImages.map((img) => img.file),
            existing
          );
          if (!upload.ok) throw new Error(upload.error);
        }
        await loadFeed(userId, false);
      }

      closeComposer();
    } catch (e: any) {
      setFormError(String(e?.message || "Unable to save post."));
    } finally {
      setSavingPost(false);
    }
  };

  const votePost = async (postId: string, reaction: -1 | 1) => {
    if (!userId) return;
    const current = votesByPostId[postId] || 0;
    if (current === reaction) {
      const { error: dError } = await supabase
        .from("forum_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (dError) return setFeedError(dError.message || "Unable to remove vote.");
      setVotesByPostId((map) => ({ ...map, [postId]: 0 }));
    } else {
      const { error: uError } = await supabase
        .from("forum_post_reactions")
        .upsert({ post_id: postId, user_id: userId, reaction }, { onConflict: "post_id,user_id" });
      if (uError) return setFeedError(uError.message || "Unable to cast vote.");
      setVotesByPostId((map) => ({ ...map, [postId]: reaction }));
    }
    void loadFeed(userId, false);
  };

  const likePost = async (postId: string) => {
    if (!userId) return;
    if (likedIds.has(postId)) {
      const { error: dError } = await supabase
        .from("forum_post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (dError) return setFeedError(dError.message || "Unable to remove like.");
      setLikedIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    } else {
      const { error: iError } = await supabase.from("forum_post_likes").insert({ post_id: postId, user_id: userId });
      if (iError) return setFeedError(iError.message || "Unable to like this post.");
      setLikedIds((current) => new Set(current).add(postId));
      triggerLikeAnimation(postId);
    }
    void loadFeed(userId, false);
  };

  const shareUrlForPost = (postId: string) => {
    const href = `/forum/${postId}`;
    if (typeof window === "undefined") return href;
    return new URL(href, window.location.origin).toString();
  };

  const closeShareDialog = useCallback(() => {
    setShareDialog(null);
    setShareCopied(false);
    if (shareCopiedTimer.current) {
      window.clearTimeout(shareCopiedTimer.current);
      shareCopiedTimer.current = null;
    }
  }, []);

  const openShareDialog = (postId: string, title: string) => {
    setShareDialog({ postId, title: clean(title) });
    setShareCopied(false);
  };

  const markShareCopied = () => {
    setShareCopied(true);
    if (shareCopiedTimer.current) window.clearTimeout(shareCopiedTimer.current);
    shareCopiedTimer.current = window.setTimeout(() => {
      setShareCopied(false);
      shareCopiedTimer.current = null;
    }, 1600);
  };

  const copyShareLink = async () => {
    if (!shareDialog) return;
    const absoluteUrl = shareUrlForPost(shareDialog.postId);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
        markShareCopied();
        setFeedNotice("Link copied.");
        return;
      }
      window.prompt("Copy this link", absoluteUrl);
      markShareCopied();
      setFeedNotice("Link ready to copy.");
    } catch {
      setFeedError("Unable to copy the link.");
    }
  };

  const shareViaNative = async () => {
    if (!shareDialog) return;
    const absoluteUrl = shareUrlForPost(shareDialog.postId);
    const title = shareDialog.title || "NIE Forum Thread";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: `${title} ${absoluteUrl}`,
          url: absoluteUrl,
        });
        setFeedNotice("Share dialog opened.");
        closeShareDialog();
        return;
      } catch (err: any) {
        if (String(err?.name || "") === "AbortError") return;
      }
    }
    await copyShareLink();
  };

  const shareToChannel = (channel: "whatsapp" | "x" | "telegram") => {
    if (!shareDialog) return;
    const absoluteUrl = shareUrlForPost(shareDialog.postId);
    const title = shareDialog.title || "NIE Forum Thread";
    const text = `${title} ${absoluteUrl}`;

    let href = "";
    if (channel === "whatsapp") href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (channel === "x") href = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    if (channel === "telegram") href = `https://t.me/share/url?url=${encodeURIComponent(absoluteUrl)}&text=${encodeURIComponent(title)}`;

    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
    setFeedNotice("Share window opened.");
    closeShareDialog();
  };

  const toggleDiscussion = async (postId: string) => {
    if (activePostId === postId) {
      setActivePostId("");
      setComments([]);
      setCommentProfilesById({});
      setCommentVotes({});
      setCommentDraft("");
      setCommentAnonymous(false);
      setReplyToId(null);
      setEditingCommentId("");
      return;
    }
    setActivePostId(postId);
    setCommentDraft("");
    setCommentAnonymous(false);
    setReplyToId(null);
    setEditingCommentId("");
    if (userId) await loadComments(postId, userId, true);
  };

  const sendComment = async () => {
    if (!userId || !activePostId || sendingComment) return;
    const body = clean(commentDraft);
    if (!body) return;
    if (body.length > 2000) return setCommentError("Comment max length is 2000.");

    setSendingComment(true);
    setCommentError("");
    const { error: iError } = await supabase.from("forum_comments").insert({
      post_id: activePostId,
      author_id: userId,
      parent_comment_id: replyToId,
      is_anonymous: commentAnonymous === true,
      body,
    });
    if (iError) {
      setCommentError(iError.message || "Unable to add comment.");
      setSendingComment(false);
      return;
    }
    setCommentDraft("");
    setCommentAnonymous(false);
    setReplyToId(null);
    setSendingComment(false);
    void loadComments(activePostId, userId, false);
  };

  const voteComment = async (commentId: string, reaction: -1 | 1) => {
    if (!userId || !activePostId) return;
    const current = commentVotes[commentId] || 0;
    if (current === reaction) {
      const { error: dError } = await supabase
        .from("forum_comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", userId);
      if (dError) return setCommentError(dError.message || "Unable to remove comment vote.");
      setCommentVotes((map) => ({ ...map, [commentId]: 0 }));
    } else {
      const { error: uError } = await supabase
        .from("forum_comment_reactions")
        .upsert({ comment_id: commentId, user_id: userId, reaction }, { onConflict: "comment_id,user_id" });
      if (uError) return setCommentError(uError.message || "Unable to vote comment.");
      setCommentVotes((map) => ({ ...map, [commentId]: reaction }));
    }
    void loadComments(activePostId, userId, false);
  };

  const saveCommentEdit = async () => {
    if (!userId || !activePostId || !editingCommentId || savingCommentEdit) return;
    const body = clean(editingCommentDraft);
    if (!body) return setCommentError("Comment cannot be empty.");
    if (body.length > 2000) return setCommentError("Comment max length is 2000.");
    setSavingCommentEdit(true);
    const { error: uError } = await supabase
      .from("forum_comments")
      .update({ body })
      .eq("id", editingCommentId)
      .eq("author_id", userId);
    if (uError) {
      setCommentError(uError.message || "Unable to save comment edit.");
      setSavingCommentEdit(false);
      return;
    }
    setEditingCommentId("");
    setEditingCommentDraft("");
    setSavingCommentEdit(false);
    void loadComments(activePostId, userId, false);
  };

  const renderComment = (comment: ForumComment, isReply = false): React.ReactNode => {
    const anonymous = comment.is_anonymous === true;
    const profile = anonymous ? null : commentProfilesById[comment.author_id] || null;
    const userTag = anonymous ? "" : usernameOf(profile);
    const vote = commentVotes[comment.id] || 0;
    const replies = commentsByParent[comment.id] || [];
    const own = comment.author_id === userId;
    const editing = editingCommentId === comment.id;

    return (
      <div key={comment.id} className={cx("relative", isReply && "ml-6 pl-5")}>
        {isReply ? (
          <>
            <span className="pointer-events-none absolute left-1 top-0 h-full w-px bg-white/12" />
            <span className="pointer-events-none absolute -left-[3px] top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#101010] text-white/45">
              <CornerDownRight className="h-3.5 w-3.5" />
            </span>
          </>
        ) : null}

        <div className="rounded-2xl border border-accent-blue/18 bg-white/[0.03] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent-blue/20 bg-white/[0.08] text-[10px] font-black uppercase">
                {anonymous ? (
                  <UserRound className="h-4 w-4 text-white/75" />
                ) : profile?.avatar_url ? (
                  <Image src={profile.avatar_url} alt={nameOf(profile)} fill className="object-cover" />
                ) : (
                  initialOf(profile)
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-xs font-bold text-white">{anonymous ? "Anonymous Student" : nameOf(profile)}</p>
                  {!anonymous && isVerified(profile) ? (
                    <VerifiedGif sizeClass="h-3.5 w-3.5" />
                  ) : null}
                </div>
                <p className="truncate text-[10px] text-white/45">{userTag ? `${userTag} · ` : ""}{ago(comment.created_at)}</p>
              </div>
            </div>
            {own ? (
              <button
                type="button"
                title="Edit comment"
                aria-label="Edit comment"
                onClick={() => {
                  setEditingCommentId(comment.id);
                  setEditingCommentDraft(comment.body);
                  setReplyToId(null);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent-blue/25 bg-accent-blue/12 text-white/75 hover:bg-accent-blue/22"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editingCommentDraft}
                onChange={(event) => setEditingCommentDraft(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-accent-blue/20 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-accent-blue/45"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void saveCommentEdit()}
                  disabled={savingCommentEdit}
                  className="inline-flex items-center gap-1 rounded-lg border border-accent-blue/35 bg-accent-blue/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                >
                  {savingCommentEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCommentId("");
                    setEditingCommentDraft("");
                  }}
                  className="rounded-lg border border-accent-blue/25 bg-accent-blue/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/85 hover:bg-accent-blue/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-white/85">{comment.body}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void voteComment(comment.id, 1)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]",
                vote === 1 ? "border-green-400/45 bg-green-500/20 text-green-200" : "border-accent-blue/20 bg-accent-blue/12 text-white/75"
              )}
            >
              <ArrowBigUp className="h-3.5 w-3.5" />
              {comment.upvotes_count}
            </button>
            <button
              type="button"
              onClick={() => void voteComment(comment.id, -1)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]",
                vote === -1 ? "border-rose-400/45 bg-rose-500/20 text-rose-200" : "border-accent-blue/20 bg-accent-blue/12 text-white/75"
              )}
            >
              <ArrowBigDown className="h-3.5 w-3.5" />
              {comment.downvotes_count}
            </button>
            {!isReply ? (
              <button
                type="button"
                onClick={() => setReplyToId(comment.id)}
                className="inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/75 hover:bg-accent-blue/22"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Reply
              </button>
            ) : null}
          </div>
        </div>

        {replies.length ? <div className="mt-2 space-y-2">{replies.map((reply) => renderComment(reply, true))}</div> : null}
      </div>
    );
  };

  if (isBooting) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505] px-4 pb-20 pt-32 text-white">
        <div className="mx-auto w-full max-w-[1200px] animate-pulse space-y-4">
          <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
          <div className="h-20 rounded-2xl border border-white/10 bg-white/[0.03]" />
          <div className="h-56 rounded-2xl border border-white/10 bg-white/[0.03]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505] px-4 pb-20 pt-32 text-white">
      <MobileToast
        kind={mobileToast?.kind || "info"}
        message={mobileToast?.message || ""}
        open={Boolean(mobileToast?.message)}
        onClose={() => setMobileToast(null)}
      />
      <div className="mx-auto w-full max-w-[1200px]">
        <header className="rounded-[28px] border border-accent-blue/35 bg-[linear-gradient(135deg,rgba(37,99,235,0.2)_0%,rgba(255,176,0,0.12)_55%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">NIE Forum</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
                {detailMode ? "Thread Detail" : "Campus Conversations"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-white/75 md:text-base">
                {detailMode
                  ? "This is an individual thread view with full replies and reaction controls."
                  : "Live student discussions with realtime updates, cleaner threading, anonymous controls, and deep-linkable posts."}
              </p>
            </div>
            <div className="relative z-20 flex w-full flex-wrap items-center justify-start gap-2 md:ml-auto md:w-auto md:justify-end">
              <span className="inline-flex items-center rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">
                Realtime
              </span>
              {detailMode ? (
                <Link
                  href="/forum"
                  className="inline-flex items-center gap-2 rounded-xl border border-accent-blue/30 bg-accent-blue/15 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] hover:bg-accent-blue/25"
                >
                  <X className="h-4 w-4" />
                  All Threads
                </Link>
              ) : null}
              {!detailMode ? (
                <Link
                  href="/forum/me"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-accent-amber/40 bg-accent-amber/15 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-accent-amber hover:bg-accent-amber/25"
                >
                  Your Posts
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (composerOpen && composerMode === "create") {
                    closeComposer();
                    return;
                  }
                  openComposer();
                }}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-accent-blue/50 bg-accent-blue/25 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] hover:bg-accent-blue/35"
              >
                <PenSquare className="h-4 w-4" />
                {composerOpen && composerMode === "create" ? "Close Composer" : "New Post"}
              </button>
            </div>
          </div>
        </header>

        {!detailMode ? (
          <section className="mt-5 rounded-2xl border border-accent-blue/25 bg-black/30 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search forum..."
                  className="w-full rounded-xl border border-accent-blue/20 bg-black/35 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/55"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setMode("latest")}
                  className={cx("rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.12em]", mode === "latest" ? "border-accent-blue/45 bg-accent-blue/20" : "border-accent-blue/20 bg-white/[0.03]")}
                >
                  Latest
                </button>
                <button
                  type="button"
                  onClick={() => setMode("trending")}
                  className={cx("rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.12em]", mode === "trending" ? "border-accent-blue/45 bg-accent-blue/20" : "border-accent-blue/20 bg-white/[0.03]")}
                >
                  Trending
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(["all", "lost", "help", "rant", "events", "general"] as TagFilter[]).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tag)}
                  className={cx("rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em]", tagFilter === tag ? "border-accent-blue/40 bg-accent-blue/18" : "border-accent-blue/20 bg-white/[0.03] text-white/70")}
                >
                  {tag === "all" ? "All" : tagLabel(tag as ForumTag)}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {(["all", "lost_found", "event"] as RelationFilter[]).map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => setRelationFilter(rel)}
                  className={cx("rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em]", relationFilter === rel ? "border-accent-amber/45 bg-accent-amber/18 text-accent-amber" : "border-accent-blue/20 bg-white/[0.03] text-white/70")}
                >
                  {rel === "all" ? "All Threads" : rel === "lost_found" ? "Lost & Found" : "Event"}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {composerOpen ? (
          <section ref={composerRef} className="mt-5 rounded-3xl border border-accent-blue/30 bg-[#0d0d0d] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">
                  {composerMode === "create" ? "New Forum Post" : "Edit Post"}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">
                  {composerMode === "create" ? "Start a Discussion" : "Update Your Post"}
                </h2>
              </div>
              <button type="button" onClick={closeComposer} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent-blue/25 bg-accent-blue/10 text-white/80">
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError ? <p className="mt-4 hidden rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 md:block">{formError}</p> : null}

            <div className="mt-4 grid gap-3">
              <input type="text" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Title" maxLength={140} className="w-full rounded-xl border border-accent-blue/20 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/50" />
              <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={6} placeholder="Body" maxLength={5000} className="w-full rounded-xl border border-accent-blue/20 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/50" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={form.tag} onChange={(event) => setForm((current) => ({ ...current, tag: event.target.value as ForumTag }))} className="rounded-xl border border-accent-blue/20 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-accent-blue/50">
                  <option value="lost" className="bg-campus-black">Lost</option>
                  <option value="help" className="bg-campus-black">Help</option>
                  <option value="rant" className="bg-campus-black">Rant</option>
                  <option value="events" className="bg-campus-black">Events</option>
                  <option value="general" className="bg-campus-black">General</option>
                </select>
                <select value={form.relation_type || ""} onChange={(event) => setForm((current) => ({ ...current, relation_type: (event.target.value || null) as RelationType }))} className="rounded-xl border border-accent-blue/20 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-accent-blue/50">
                  <option value="" className="bg-campus-black">No relation</option>
                  <option value="lost_found" className="bg-campus-black">Lost & Found</option>
                  <option value="event" className="bg-campus-black">Event</option>
                </select>
              </div>
              <input type="text" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Optional location" maxLength={120} className="w-full rounded-xl border border-accent-blue/20 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/50" />

              <div className="flex items-center justify-between rounded-xl border border-accent-blue/20 bg-black/25 p-3">
                <span className="text-sm text-white/75">
                  Post anonymously as <span className="font-bold text-white">Anonymous Student</span>. Ownership remains linked to your account.
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.anonymous}
                  onClick={() => setForm((current) => ({ ...current, anonymous: !current.anonymous }))}
                  className={cx(
                    "relative ml-3 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                    form.anonymous ? "border-accent-blue/60 bg-accent-blue/35" : "border-white/20 bg-white/[0.08]"
                  )}
                >
                  <span
                    className={cx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      form.anonymous ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <div className="rounded-xl border border-accent-blue/20 bg-black/25 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/65">Images ({draftImages.length}/{MAX_IMAGES})</p>
                  <label className="cursor-pointer rounded-lg border border-accent-blue/30 bg-accent-blue/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/85">
                    Add Images
                    <input type="file" multiple accept={ACCEPTED_TYPES.join(",")} className="hidden" onChange={(event) => { pickImages(event.target.files); event.currentTarget.value = ""; }} />
                  </label>
                </div>
                {draftImages.length ? (
                  <div className="mt-3 grid h-[260px] grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-white/10 md:h-[320px]">
                    {draftImages.slice(0, 4).map((img, idx) => (
                      <div key={`${img.file.name}-${idx}`} className={cx("relative", draftImages.length === 3 && idx === 0 ? "row-span-2" : "")}>
                        <img src={img.preview} alt={img.file.name} className="h-full w-full object-cover" />
                        <button type="button" onClick={() => removeDraftImage(idx)} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white"><X className="h-4 w-4" /></button>
                        {idx === 3 && draftImages.length > 4 ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-black text-white">
                            +{draftImages.length - 4}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-2 text-xs text-white/55">Attach up to 6 images (18MB source each). We auto-compress before upload.</p>}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeComposer} className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white/85">Cancel</button>
              <button type="button" onClick={() => void savePost()} disabled={savingPost} className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-blue/40 bg-accent-blue/20 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] disabled:opacity-65">{savingPost ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{composerMode === "create" ? "Publish Post" : "Save Changes"}</button>
            </div>
          </section>
        ) : null}

        {error ? <p className="mt-4 hidden rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:block">{error}</p> : null}
        {feedError ? <p className="mt-4 hidden rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200 md:block">{feedError}</p> : null}
        {feedNotice ? (
          <p className="mt-4 hidden rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 md:block">
            {feedNotice}
          </p>
        ) : null}

        <section className={cx("mt-6 grid gap-6", detailMode ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_300px]")}>
          <div className="overflow-hidden rounded-3xl border border-accent-blue/25 bg-black/30">
            {loadingFeed ? (
              [1, 2, 3].map((n) => <div key={n} className="h-48 animate-pulse border-b border-accent-blue/18 bg-white/[0.03]" />)
            ) : posts.length === 0 ? (
              <div className="border-dashed border-accent-blue/25 bg-white/[0.02] p-8 text-center">
                <h2 className="text-xl font-black">{detailMode ? "Thread not found" : "No posts found"}</h2>
                <p className="mt-2 text-sm text-white/65">
                  {detailMode ? "This post may have been removed or you may not have access to it." : "Try another filter or create a new thread."}
                </p>
                {detailMode ? (
                  <Link
                    href="/forum"
                    className="mt-4 inline-flex rounded-lg border border-accent-blue/40 bg-accent-blue/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white"
                  >
                    Back to Forum
                  </Link>
                ) : null}
              </div>
            ) : (
              posts.map((post) => {
                const profile = post.is_anonymous ? null : profilesById[post.author_id] || null;
                const userTag = post.is_anonymous ? "" : usernameOf(profile);
                const images = imagesByPostId[post.id] || [];
                const vote = votesByPostId[post.id] || 0;
                const liked = likedIds.has(post.id);
                const own = post.author_id === userId;
                const open = activePostId === post.id;

                return (
                  <article
                    key={post.id}
                    className={cx(
                      "group rounded-none border-x-0 border-t-0 bg-[linear-gradient(155deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.01)_100%)] p-4 transition-colors hover:bg-white/[0.04] md:p-5",
                      open ? "border-b-accent-blue/45" : "border-b-accent-blue/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {detailMode ? (
                        <Link href={`/forum/${post.id}`} className="flex min-w-0 items-center gap-3">
                          <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent-blue/20 bg-white/[0.08] text-xs font-black uppercase">
                            {post.is_anonymous ? (
                              <UserRound className="h-5 w-5 text-white/75" />
                            ) : profile?.avatar_url ? (
                              <Image src={profile.avatar_url} alt={nameOf(profile)} fill className="object-cover" />
                            ) : (
                              initialOf(profile)
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="truncate text-sm font-black">{post.is_anonymous ? "Anonymous Student" : nameOf(profile)}</p>
                              {!post.is_anonymous && isVerified(profile) ? (
                                <VerifiedGif sizeClass="h-4 w-4" />
                              ) : null}
                            </div>
                            <p className="truncate text-[11px] text-white/55">{userTag ? `${userTag} · ` : ""}{ago(post.created_at)}</p>
                          </div>
                        </Link>
                      ) : (
                        <button type="button" onClick={() => void toggleDiscussion(post.id)} className="flex min-w-0 items-center gap-3 text-left">
                          <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent-blue/20 bg-white/[0.08] text-xs font-black uppercase">
                            {post.is_anonymous ? (
                              <UserRound className="h-5 w-5 text-white/75" />
                            ) : profile?.avatar_url ? (
                              <Image src={profile.avatar_url} alt={nameOf(profile)} fill className="object-cover" />
                            ) : (
                              initialOf(profile)
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="truncate text-sm font-black">{post.is_anonymous ? "Anonymous Student" : nameOf(profile)}</p>
                              {!post.is_anonymous && isVerified(profile) ? (
                                <VerifiedGif sizeClass="h-4 w-4" />
                              ) : null}
                            </div>
                            <p className="truncate text-[11px] text-white/55">{userTag ? `${userTag} · ` : ""}{ago(post.created_at)}</p>
                          </div>
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-accent-blue/35 bg-accent-blue/16 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]">{tagLabel(post.tag)}</span>
                        <button
                          type="button"
                          title="Share post"
                          aria-label="Share post"
                          onClick={() => openShareDialog(post.id, post.title)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent-blue/28 bg-accent-blue/12 text-white/80 hover:bg-accent-blue/25"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        {own ? (
                          <button
                            type="button"
                            title="Edit post"
                            aria-label="Edit post"
                            onClick={() => openComposer(post)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent-blue/28 bg-accent-blue/12 text-white/80 hover:bg-accent-blue/25"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {detailMode ? (
                      <Link href={`/forum/${post.id}`} className="mt-3 block rounded-xl p-1 transition-colors hover:bg-white/[0.02]">
                        <h2 className="text-xl font-black">{post.title}</h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{post.body}</p>

                        {renderPostImages(images, post.title)}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {post.location_label ? <span className="inline-flex items-center gap-1 rounded-lg border border-accent-blue/20 bg-white/[0.03] px-2 py-1 text-xs text-white/65"><MapPin className="h-3.5 w-3.5" />{post.location_label}</span> : null}
                          {post.relation_type ? <span className="rounded-lg border border-accent-amber/35 bg-accent-amber/16 px-2 py-1 text-xs text-accent-amber">{post.relation_type === "lost_found" ? "Lost & Found" : "Event"}</span> : null}
                        </div>
                      </Link>
                    ) : (
                      <button type="button" onClick={() => void toggleDiscussion(post.id)} className="mt-3 block w-full rounded-xl p-1 text-left transition-colors hover:bg-white/[0.02]">
                        <h2 className="text-xl font-black">{post.title}</h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{post.body}</p>

                        {renderPostImages(images, post.title)}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {post.location_label ? <span className="inline-flex items-center gap-1 rounded-lg border border-accent-blue/20 bg-white/[0.03] px-2 py-1 text-xs text-white/65"><MapPin className="h-3.5 w-3.5" />{post.location_label}</span> : null}
                          {post.relation_type ? <span className="rounded-lg border border-accent-amber/35 bg-accent-amber/16 px-2 py-1 text-xs text-accent-amber">{post.relation_type === "lost_found" ? "Lost & Found" : "Event"}</span> : null}
                        </div>
                      </button>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void votePost(post.id, 1)}
                        className={cx("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]", vote === 1 ? "border-green-400/45 bg-green-500/20 text-green-200" : "border-accent-blue/20 bg-accent-blue/12 text-white/75")}
                      >
                        <ArrowBigUp className="h-4 w-4" />
                        {post.upvotes_count}
                      </button>
                      <button
                        type="button"
                        onClick={() => void votePost(post.id, -1)}
                        className={cx("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]", vote === -1 ? "border-rose-400/45 bg-rose-500/20 text-rose-200" : "border-accent-blue/20 bg-accent-blue/12 text-white/75")}
                      >
                        <ArrowBigDown className="h-4 w-4" />
                        {post.downvotes_count}
                      </button>
                      <button
                        type="button"
                        onClick={() => void likePost(post.id)}
                        className={cx("relative inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]", liked ? "border-pink-400/50 bg-pink-500/20 text-pink-100" : "border-accent-blue/20 bg-accent-blue/12 text-white/75")}
                      >
                        <span className="relative inline-flex h-4 w-4 items-center justify-center overflow-visible">
                          {likeAnimatingIds.has(post.id) && liked ? (
                            <>
                              <span className="pointer-events-none absolute inset-[-5px] rounded-full yt-like-ripple" />
                              <img src="/like.gif" alt="Liked" className="pointer-events-none absolute inset-0 h-4 w-4 rounded-full object-cover opacity-90" />
                            </>
                          ) : null}
                          <Heart className={cx("relative z-[1] h-4 w-4", liked && "fill-current", likeAnimatingIds.has(post.id) && "yt-like-pop")} />
                        </span>
                        {post.likes_count}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleDiscussion(post.id)}
                        className={cx("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em]", open ? "border-accent-blue/45 bg-accent-blue/25" : "border-accent-blue/20 bg-accent-blue/12 text-white/75")}
                      >
                        <MessageSquare className="h-4 w-4" />
                        {post.comments_count}
                      </button>
                      {!detailMode ? (
                        <Link
                          href={`/forum/${post.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-accent-amber/35 bg-accent-amber/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-accent-amber"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Full Thread
                        </Link>
                      ) : null}
                    </div>

                    {open ? (
                      <div className="mt-4 rounded-2xl border border-accent-blue/20 bg-black/25 p-3 md:p-4">
                        {commentError ? <p className="mb-3 hidden rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 md:block">{commentError}</p> : null}
                        {loadingComments ? (
                          <div className="space-y-2"><div className="h-16 animate-pulse rounded-xl border border-accent-blue/20 bg-white/[0.03]" /><div className="h-16 animate-pulse rounded-xl border border-accent-blue/20 bg-white/[0.03]" /></div>
                        ) : (
                          <div className="space-y-2">{(commentsByParent["__root__"] || []).map((comment) => renderComment(comment))}</div>
                        )}

                        {replyToId ? (
                          <div className="mt-3 flex items-center justify-between rounded-lg border border-accent-amber/35 bg-accent-amber/15 px-3 py-2 text-xs text-accent-amber">
                            <span>Reply mode enabled</span>
                            <button type="button" onClick={() => setReplyToId(null)} className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.1em]">
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </div>
                        ) : null}

                        <div className="mt-3 flex items-center justify-between rounded-xl border border-accent-blue/20 bg-black/20 px-3 py-2">
                          <p className="text-xs text-white/75">
                            {replyToId ? "Post this reply anonymously" : "Post this comment anonymously"}
                          </p>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={commentAnonymous}
                            onClick={() => setCommentAnonymous((current) => !current)}
                            className={cx(
                              "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                              commentAnonymous
                                ? "border-accent-blue/60 bg-accent-blue/35"
                                : "border-accent-blue/25 bg-accent-blue/10"
                            )}
                          >
                            <span
                              className={cx(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                commentAnonymous ? "translate-x-6" : "translate-x-1"
                              )}
                            />
                          </button>
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} rows={2} placeholder="Write a comment..." className="min-h-[72px] flex-1 rounded-xl border border-accent-blue/20 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45" />
                          <button type="button" onClick={() => void sendComment()} disabled={sendingComment || !clean(commentDraft)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-accent-blue/40 bg-accent-blue/20 px-4 text-xs font-black uppercase tracking-[0.12em] disabled:opacity-60">{sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{replyToId ? "Reply" : "Comment"}</button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          {!detailMode ? (
            <aside className="hidden space-y-4 xl:block">
              <div className="sticky top-28 space-y-4">
                <div className="rounded-2xl border border-accent-blue/20 bg-black/35 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-secondary">Trending Now</p>
                  <div className="mt-3 space-y-2">
                    {trending.map((post) => (
                      <button key={post.id} type="button" onClick={() => void toggleDiscussion(post.id)} className={cx("w-full rounded-xl border px-3 py-2 text-left", activePostId === post.id ? "border-accent-blue/35 bg-accent-blue/20" : "border-accent-blue/20 bg-white/[0.03]")}>
                        <p className="line-clamp-2 text-sm font-bold">{post.title}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/55">{post.comments_count} comments</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-accent-blue/35 bg-accent-blue/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em]">Liked Threads</p>
                  <p className="mt-1 text-sm text-white/75">You have saved {likedIds.size} posts.</p>
                  <Link href="/profile/likes" className="mt-3 inline-flex rounded-lg border border-accent-blue/25 bg-accent-blue/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/85">Open Liked Posts</Link>
                </div>
              </div>
            </aside>
          ) : null}
        </section>

        {shareDialog ? (
          <div className="fixed inset-0 z-[140] flex items-center justify-center px-4">
            <button
              type="button"
              onClick={closeShareDialog}
              aria-label="Close share dialog"
              className="absolute inset-0 bg-black/78 backdrop-blur-[2px]"
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Share thread"
              className="relative z-10 w-full max-w-md rounded-2xl border border-accent-blue/35 bg-[linear-gradient(145deg,rgba(9,12,28,0.98)_0%,rgba(17,23,44,0.92)_55%,rgba(37,99,235,0.14)_100%)] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.65)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black">Share Thread</p>
                  <p className="mt-1 truncate text-xs text-white/65">{shareDialog.title || "NIE Forum Thread"}</p>
                </div>
                <button
                  type="button"
                  onClick={closeShareDialog}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-accent-blue/25 bg-accent-blue/10 text-white/80 hover:bg-accent-blue/20"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 truncate rounded-lg border border-accent-blue/20 bg-black/25 px-3 py-2 text-xs text-white/65">
                {shareUrlForPost(shareDialog.postId)}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void shareViaNative()}
                  className="rounded-xl border border-accent-blue/45 bg-accent-blue/22 px-3 py-2 text-xs font-black uppercase tracking-[0.11em] text-white hover:bg-accent-blue/32"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => void copyShareLink()}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.11em]",
                    shareCopied
                      ? "border-emerald-300/45 bg-emerald-500/20 text-emerald-100"
                      : "border-accent-amber/35 bg-accent-amber/14 text-accent-amber hover:bg-accent-amber/24"
                  )}
                >
                  {shareCopied ? "Copied" : "Copy Link"}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => shareToChannel("whatsapp")}
                  className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-2 py-2 text-xs font-semibold text-white/88 hover:bg-accent-blue/20"
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => shareToChannel("x")}
                  className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-2 py-2 text-xs font-semibold text-white/88 hover:bg-accent-blue/20"
                >
                  X
                </button>
                <button
                  type="button"
                  onClick={() => shareToChannel("telegram")}
                  className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-2 py-2 text-xs font-semibold text-white/88 hover:bg-accent-blue/20"
                >
                  Telegram
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {!detailMode ? (
          <button
            type="button"
            onClick={() => {
              if (composerOpen && composerMode === "create") {
                closeComposer();
                return;
              }
              openComposer();
            }}
            className="fixed bottom-6 right-5 z-[110] inline-flex h-14 w-14 items-center justify-center rounded-full border border-accent-blue/50 bg-accent-blue text-white shadow-[0_14px_40px_rgba(37,99,235,0.5)] transition-transform hover:scale-105 active:scale-95 md:hidden"
            aria-label={composerOpen && composerMode === "create" ? "Close post composer" : "Create new post"}
            title={composerOpen && composerMode === "create" ? "Close composer" : "Create post"}
          >
            {composerOpen && composerMode === "create" ? <X className="h-6 w-6" /> : <PenSquare className="h-6 w-6" />}
          </button>
        ) : null}
      </div>

    </main>
  );
}
