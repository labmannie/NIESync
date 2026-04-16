
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  ArrowBigDown,
  ArrowBigUp,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CornerDownRight,
  Flame,
  Heart,
  Loader2,
  MapPin,
  Minus,
  MessageSquare,
  Pencil,
  PenSquare,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
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
type HeaderState = "expanded" | "compact" | "hidden";

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
type DeleteDialogState = { postId: string; title: string };
type ImageLightboxState = { postId: string; urls: string[]; index: number };

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

function tagHashtag(tag: ForumTag | "all") {
  if (tag === "all") return "#all-topics";
  if (tag === "events") return "#events";
  if (tag === "lost") return "#lost";
  if (tag === "rant") return "#rant";
  if (tag === "help") return "#help";
  return "#general";
}

function relationHashtag(relation: RelationFilter | RelationType) {
  if (relation === "all") return "#all-context";
  if (relation === "lost_found") return "#lost-found";
  if (relation === "event") return "#event";
  return "";
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

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
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
  let quality = outputType === "image/jpeg" ? 0.88 : undefined;
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

function Avatar({
  profile,
  anonymous,
  className = "h-10 w-10",
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

function StatPill({
  icon,
  label,
  value,
  tone = "default",
  active = false,
  onClick,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "default" | "green" | "rose" | "pink" | "amber";
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const tones = {
    default: active
      ? "border-accent-blue/45 bg-accent-blue/18 text-white"
      : "border-white/10 bg-white/[0.03] text-white/72 hover:border-accent-blue/25 hover:bg-accent-blue/10 hover:text-white",
    green: active
      ? "border-emerald-400/45 bg-emerald-500/16 text-emerald-100"
      : "border-white/10 bg-white/[0.03] text-white/72 hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100",
    rose: active
      ? "border-rose-400/45 bg-rose-500/16 text-rose-100"
      : "border-white/10 bg-white/[0.03] text-white/72 hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-100",
    pink: active
      ? "border-pink-400/45 bg-pink-500/16 text-pink-100"
      : "border-white/10 bg-white/[0.03] text-white/72 hover:border-pink-400/30 hover:bg-pink-500/10 hover:text-pink-100",
    amber: active
      ? "border-accent-amber/50 bg-accent-amber/16 text-accent-amber"
      : "border-white/10 bg-white/[0.03] text-white/72 hover:border-accent-amber/35 hover:bg-accent-amber/10 hover:text-accent-amber",
  } as const;

  const content = (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200",
        tones[tone]
      )}
      title={title || label}
    >
      <span className="forum-action-icon-small">{icon}</span>
      <span className="text-[11px] uppercase tracking-[0.12em]">{label}</span>
      <span className="font-black text-white">{compactNumber(value)}</span>
    </span>
  );

  if (!onClick) return content;

  return (
    <button type="button" onClick={onClick} className="text-left">
      {content}
    </button>
  );
}

export default function ForumPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ postId?: string }>();
  const routePostId = clean(typeof params?.postId === "string" ? params.postId : "");
  const detailMode = Boolean(routePostId);

  const [isBooting, setIsBooting] = useState(true);
  const [userId, setUserId] = useState("");
  const [viewerProfile, setViewerProfile] = useState<ForumProfile | null>(null);
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
  const [headerState, setHeaderState] = useState<HeaderState>("expanded");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [shareDialog, setShareDialog] = useState<ShareDialogState | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [deletingPostId, setDeletingPostId] = useState("");
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

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
  const [deletingCommentId, setDeletingCommentId] = useState("");

  const feedVersion = useRef(0);
  const commentVersion = useRef(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const likeAnimationTimers = useRef<Record<string, number>>({});
  const shareCopiedTimer = useRef<number | null>(null);
  const lightboxTouchStartX = useRef<number | null>(null);
  const lightboxPinchStartDistance = useRef<number | null>(null);
  const lightboxPinchStartZoom = useRef(1);
  const lastScrollYRef = useRef(0);
  const headerStateRef = useRef<HeaderState>("expanded");
  const mobileTrendingRef = useRef<HTMLElement | null>(null);

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

  const renderPostImages = useCallback((images: string[], title: string, onOpenImage?: (index: number) => void) => {
    if (!images.length) return null;
    const imageClass = "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.01] touch-manipulation";
    const handleImageClick = (index: number) => (event: ReactMouseEvent<HTMLImageElement>) => {
      event.stopPropagation();
      onOpenImage?.(index);
    };

    if (images.length === 1) {
      return (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <img
            src={images[0]}
            alt={`${title} image 1`}
            className={cx("h-[280px] w-full cursor-zoom-in md:h-[420px]", imageClass)}
            loading="lazy"
            onClick={handleImageClick(0)}
          />
        </div>
      );
    }

    if (images.length === 2) {
      return (
        <div className="mt-3 grid h-[280px] grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30 md:h-[340px]">
          {images.slice(0, 2).map((url, idx) => (
            <img
              key={`${url}-${idx}`}
              src={url}
              alt={`${title} image ${idx + 1}`}
              className={cx("cursor-zoom-in", imageClass)}
              loading="lazy"
              onClick={handleImageClick(idx)}
            />
          ))}
        </div>
      );
    }

    if (images.length === 3) {
      return (
        <div className="mt-3 grid h-[320px] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <img
            src={images[0]}
            alt={`${title} image 1`}
            className={cx("row-span-2 cursor-zoom-in", imageClass)}
            loading="lazy"
            onClick={handleImageClick(0)}
          />
          <img
            src={images[1]}
            alt={`${title} image 2`}
            className={cx("cursor-zoom-in", imageClass)}
            loading="lazy"
            onClick={handleImageClick(1)}
          />
          <img
            src={images[2]}
            alt={`${title} image 3`}
            className={cx("cursor-zoom-in", imageClass)}
            loading="lazy"
            onClick={handleImageClick(2)}
          />
        </div>
      );
    }

    const visible = images.slice(0, 4);
    const extra = Math.max(0, images.length - visible.length);

    return (
      <div className="mt-3 grid h-[320px] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {visible.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative h-full w-full">
            <img
              src={url}
              alt={`${title} image ${idx + 1}`}
              className={cx("cursor-zoom-in", imageClass)}
              loading="lazy"
              onClick={handleImageClick(idx)}
            />
            {idx === 3 && extra > 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-black text-white">+{extra}</div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }, []);

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

      const [profileRes, imageRes, voteRes, likeRes] = await Promise.all([profilePromise, imagePromise, votePromise, likePromise]);
      if (version !== feedVersion.current) return;

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
      if (detailMode) setActivePostId(rows[0]?.id || "");
      setProfilesById(profileRes);
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

      const nextVotes: Record<string, -1 | 1 | 0> = {};
      ((voteRes.data || []) as Array<{ comment_id: string; reaction: -1 | 1 }>).forEach((row) => {
        nextVotes[row.comment_id] = row.reaction;
      });

      setComments(rows);
      setCommentProfilesById(profileRes);
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
        const [{ data: profileRow }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, first_name, last_name, username, avatar_url, email_verified")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

        if (!active) return;
        setViewerProfile((profileRow || null) as ForumProfile | null);
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
    const timer = window.setTimeout(() => setSearchTerm(value), 340);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (detailMode) return;

    const collapseLocked = composerOpen && composerMode === "create";
    let rafId = 0;

    const updateHeaderState = () => {
      rafId = 0;
      const y = Math.max(0, window.scrollY);
      const lastY = lastScrollYRef.current;
      const delta = y - lastY;
      const mobile = window.matchMedia("(max-width: 767px)").matches;

      setShowScrollTop(y > (mobile ? 320 : 220));

      let nextState: HeaderState = headerStateRef.current;
      if (collapseLocked) {
        nextState = mobile ? "hidden" : "compact";
      } else if (!mobile) {
        nextState = y > 44 ? "compact" : "expanded";
      } else if (y <= 72) {
        nextState = "expanded";
      } else if (delta > 10 && y > 140) {
        nextState = "hidden";
      } else if (delta < -8 || y < 128) {
        nextState = "compact";
      }

      if (nextState !== headerStateRef.current) {
        headerStateRef.current = nextState;
        setHeaderState(nextState);
      }

      lastScrollYRef.current = y;
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateHeaderState);
    };

    const onResize = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateHeaderState);
    };

    lastScrollYRef.current = Math.max(0, window.scrollY);
    updateHeaderState();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [composerMode, composerOpen, detailMode]);

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
    if (!shareDialog && !deleteDialog && !lightbox) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLightbox(null);
      setLightboxZoom(1);
      setShareDialog(null);
      setShareCopied(false);
      if (shareCopiedTimer.current) {
        window.clearTimeout(shareCopiedTimer.current);
        shareCopiedTimer.current = null;
      }
      if (!deletingPostId) setDeleteDialog(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [deleteDialog, deletingPostId, lightbox, shareDialog]);

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

  const trending = useMemo(() => {
    return [...posts].sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 6);
  }, [posts]);

  const activePost = useMemo(() => posts.find((post) => post.id === activePostId) || null, [activePostId, posts]);

  const commentsByParent = useMemo(() => {
    const map: Record<string, ForumComment[]> = {};
    comments.forEach((row) => {
      const key = row.parent_comment_id || "__root__";
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    return map;
  }, [comments]);

  const openComposer = useCallback(
    (post?: ForumPost) => {
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
    },
    [clearDraftImages, resetComposer]
  );

  const openImageLightbox = useCallback((postId: string, urls: string[], index: number) => {
    if (!urls.length) return;
    const safeIndex = Math.max(0, Math.min(index, urls.length - 1));
    setLightbox({ postId, urls, index: safeIndex });
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

  useEffect(() => {
    if (detailMode) return;
    if (!userId || !posts.length) return;
    if (typeof window === "undefined") return;

    const currentParams = new URLSearchParams(window.location.search);
    const editPostId = clean(currentParams.get("edit") || "");
    if (!editPostId) return;

    const targetPost = posts.find((post) => post.id === editPostId && post.author_id === userId);
    if (!targetPost) return;

    if (composerOpen && composerMode === "edit" && editingPost?.id === editPostId) return;

    openComposer(targetPost);

    currentParams.delete("edit");
    if (currentParams.get("compose") === "1") currentParams.delete("compose");
    const remaining = currentParams.toString();
    router.replace(remaining ? `/forum?${remaining}` : "/forum", { scroll: false });
  }, [composerMode, composerOpen, detailMode, editingPost?.id, openComposer, posts, router, userId]);

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

        const upload = await uploadImages(String((data as any).id || ""), draftImages.map((img) => img.file), 0);
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
          if (existing + draftImages.length > MAX_IMAGES) throw new Error(`This post can hold up to ${MAX_IMAGES} images.`);
          const upload = await uploadImages(editingPost.id, draftImages.map((img) => img.file), existing);
          if (!upload.ok) throw new Error(upload.error);
        }

        await loadFeed(userId, false);
      }

      closeComposer();
      setFeedNotice(composerMode === "create" ? "Post published." : "Post updated.");
    } catch (e: any) {
      setFormError(String(e?.message || "Unable to save post."));
    } finally {
      setSavingPost(false);
    }
  };

  const adjustPostCounts = useCallback(
    (
      postId: string,
      delta: {
        likes?: number;
        upvotes?: number;
        downvotes?: number;
        score?: number;
      }
    ) => {
      const clamp = (value: number) => Math.max(0, value);
      setPosts((current) =>
        current.map((post) => {
          if (post.id !== postId) return post;
          return {
            ...post,
            likes_count: clamp(Number(post.likes_count || 0) + Number(delta.likes || 0)),
            upvotes_count: clamp(Number(post.upvotes_count || 0) + Number(delta.upvotes || 0)),
            downvotes_count: clamp(Number(post.downvotes_count || 0) + Number(delta.downvotes || 0)),
            score: Number(post.score || 0) + Number(delta.score || 0),
          };
        })
      );
    },
    []
  );

  const votePost = async (postId: string, reaction: -1 | 1) => {
    if (!userId) return;
    setFeedError("");
    const previous = votesByPostId[postId] || 0;
    const next = previous === reaction ? 0 : reaction;

    const voteDelta = {
      upvotes: (previous === 1 ? -1 : 0) + (next === 1 ? 1 : 0),
      downvotes: (previous === -1 ? -1 : 0) + (next === -1 ? 1 : 0),
      score: (previous === 1 ? -1 : 0) + (previous === -1 ? 1 : 0) + (next === 1 ? 1 : 0) + (next === -1 ? -1 : 0),
    };

    setVotesByPostId((map) => ({ ...map, [postId]: next }));
    adjustPostCounts(postId, voteDelta);

    if (next === 0) {
      const { error: dError } = await supabase.from("forum_post_reactions").delete().eq("post_id", postId).eq("user_id", userId);
      if (!dError) return;
      setVotesByPostId((map) => ({ ...map, [postId]: previous }));
      adjustPostCounts(postId, {
        upvotes: -voteDelta.upvotes,
        downvotes: -voteDelta.downvotes,
        score: -voteDelta.score,
      });
      setFeedError(dError.message || "Unable to remove vote.");
      return;
    }

    const { error: uError } = await supabase
      .from("forum_post_reactions")
      .upsert({ post_id: postId, user_id: userId, reaction: next }, { onConflict: "post_id,user_id" });
    if (!uError) return;

    setVotesByPostId((map) => ({ ...map, [postId]: previous }));
    adjustPostCounts(postId, {
      upvotes: -voteDelta.upvotes,
      downvotes: -voteDelta.downvotes,
      score: -voteDelta.score,
    });
    setFeedError(uError.message || "Unable to cast vote.");
  };

  const likePost = async (postId: string) => {
    if (!userId) return;
    setFeedError("");
    const liked = likedIds.has(postId);
    const nextLiked = !liked;

    setLikedIds((current) => {
      const next = new Set(current);
      if (nextLiked) {
        next.add(postId);
      } else {
        next.delete(postId);
      }
      return next;
    });
    adjustPostCounts(postId, { likes: nextLiked ? 1 : -1 });

    if (nextLiked) triggerLikeAnimation(postId);

    if (liked) {
      const { error: dError } = await supabase.from("forum_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      if (!dError) return;
      setLikedIds((current) => new Set(current).add(postId));
      adjustPostCounts(postId, { likes: 1 });
      setFeedError(dError.message || "Unable to remove like.");
      return;
    }

    const { error: iError } = await supabase.from("forum_post_likes").insert({ post_id: postId, user_id: userId });
    if (!iError) return;

    setLikedIds((current) => {
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
    adjustPostCounts(postId, { likes: -1 });

    if (String((iError as any)?.code || "") === "23505") {
      setLikedIds((current) => new Set(current).add(postId));
      adjustPostCounts(postId, { likes: 1 });
      return;
    } else {
      setFeedError(iError.message || "Unable to like this post.");
    }
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
    setDeleteDialog(null);
    setShareDialog({ postId, title: clean(title) });
    setShareCopied(false);
  };

  const closeDeleteDialog = useCallback(() => {
    if (deletingPostId) return;
    setDeleteDialog(null);
  }, [deletingPostId]);

  const openDeleteDialog = (post: ForumPost) => {
    closeShareDialog();
    setDeleteDialog({ postId: post.id, title: clean(post.title) });
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

  const confirmDeletePost = async () => {
    if (!userId || !deleteDialog || deletingPostId) return;
    const postId = deleteDialog.postId;
    setDeletingPostId(postId);
    setFeedError("");
    setFeedNotice("");

    try {
      const { data: imageRows, error: imageError } = await supabase
        .from("forum_post_images")
        .select("storage_path")
        .eq("post_id", postId);
      if (imageError) throw new Error(imageError.message || "Unable to prepare post deletion.");

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
      if (deleteError) throw new Error(deleteError.message || "Unable to delete this post.");
      if (!deletedPost?.id) throw new Error("Post already removed or you don't have permission to delete it.");

      let imageCleanupFailed = false;
      if (imagePaths.length) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(imagePaths);
        imageCleanupFailed = Boolean(storageError);
      }

      if (editingPost?.id === postId) closeComposer();

      if (activePostId === postId) {
        setActivePostId("");
        setComments([]);
        setCommentProfilesById({});
        setCommentVotes({});
        setCommentDraft("");
        setCommentAnonymous(false);
        setReplyToId(null);
        setEditingCommentId("");
      }

      setDeleteDialog(null);
      setPosts((current) => current.filter((post) => post.id !== postId));
      setImagesByPostId((current) => {
        if (!current[postId]) return current;
        const next = { ...current };
        delete next[postId];
        return next;
      });
      setVotesByPostId((current) => {
        if (!(postId in current)) return current;
        const next = { ...current };
        delete next[postId];
        return next;
      });
      setLikedIds((current) => {
        if (!current.has(postId)) return current;
        const next = new Set(current);
        next.delete(postId);
        return next;
      });

      if (detailMode && routePostId === postId) {
        router.replace("/forum", { scroll: false });
      } else {
        await loadFeed(userId, false);
      }

      setFeedNotice(
        imageCleanupFailed ? "Post deleted. Some image files could not be cleaned up." : "Post deleted successfully."
      );
    } catch (e: any) {
      setFeedError(String(e?.message || "Unable to delete this post."));
    } finally {
      setDeletingPostId("");
    }
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

  const deleteComment = async (comment: ForumComment) => {
    if (!userId || !activePostId || deletingCommentId) return;
    const label = comment.parent_comment_id ? "reply" : "comment";
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete this ${label}? This cannot be undone.`);
      if (!confirmed) return;
    }

    setDeletingCommentId(comment.id);
    setCommentError("");

    const { error: dError } = await supabase
      .from("forum_comments")
      .delete()
      .eq("id", comment.id)
      .eq("author_id", userId);

    if (dError) {
      setCommentError(dError.message || `Unable to delete this ${label}.`);
      setDeletingCommentId("");
      return;
    }

    if (editingCommentId === comment.id) {
      setEditingCommentId("");
      setEditingCommentDraft("");
    }
    if (replyToId === comment.id) setReplyToId(null);

    setCommentVotes((current) => {
      if (!(comment.id in current)) return current;
      const next = { ...current };
      delete next[comment.id];
      return next;
    });

    setDeletingCommentId("");
    void loadComments(activePostId, userId, false);
    void loadFeed(userId, false);
  };

  const renderComment = (comment: ForumComment, isReply = false): ReactNode => {
    const anonymous = comment.is_anonymous === true;
    const profile = anonymous ? null : commentProfilesById[comment.author_id] || null;
    const userTag = anonymous ? "" : usernameOf(profile);
    const vote = commentVotes[comment.id] || 0;
    const replies = commentsByParent[comment.id] || [];
    const own = comment.author_id === userId;
    const editing = editingCommentId === comment.id;

    return (
      <div key={comment.id} className={cx("relative", isReply && "ml-5 border-l border-white/10 pl-4")}>
        {isReply ? (
          <span className="absolute -left-2 top-3 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0b0f19] text-white/45">
            <CornerDownRight className="h-3 w-3" />
          </span>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar profile={profile} anonymous={anonymous} className="h-8 w-8" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {anonymous ? "Anonymous Student" : nameOf(profile)}
                  </p>
                  {!anonymous && isVerified(profile) ? <VerifiedGif sizeClass="h-3.5 w-3.5" /> : null}
                </div>
                <p className="truncate text-[11px] text-white/45">
                  {userTag ? `${userTag} | ` : ""}
                  {ago(comment.created_at)}
                </p>
              </div>
            </div>

            {own ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Edit comment"
                  aria-label="Edit comment"
                  onClick={() => {
                    setEditingCommentId(comment.id);
                    setEditingCommentDraft(comment.body);
                    setReplyToId(null);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-accent-blue/15 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete comment"
                  aria-label="Delete comment"
                  onClick={() => void deleteComment(comment)}
                  disabled={deletingCommentId === comment.id}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/28 bg-red-500/10 text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingCommentId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-3 space-y-2">
              <textarea
                value={editingCommentDraft}
                onChange={(event) => setEditingCommentDraft(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-white/12 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveCommentEdit()}
                  disabled={savingCommentEdit}
                  className="inline-flex items-center gap-2 rounded-full border border-accent-blue/35 bg-accent-blue/18 px-3 py-2 text-xs font-black uppercase tracking-[0.11em] text-white"
                >
                  {savingCommentEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCommentId("");
                    setEditingCommentDraft("");
                  }}
                  className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-2 text-xs font-black uppercase tracking-[0.11em] text-white/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/82">{comment.body}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <StatPill
              icon={<ArrowBigUp className="h-4 w-4" />}
              label="Up"
              value={comment.upvotes_count}
              tone="green"
              active={vote === 1}
              onClick={() => void voteComment(comment.id, 1)}
            />
            <StatPill
              icon={<ArrowBigDown className="h-4 w-4" />}
              label="Down"
              value={comment.downvotes_count}
              tone="rose"
              active={vote === -1}
              onClick={() => void voteComment(comment.id, -1)}
            />
            {!isReply ? (
              <button
                type="button"
                onClick={() => setReplyToId(comment.id)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/72 transition hover:border-accent-blue/25 hover:bg-accent-blue/10 hover:text-white"
              >
                <MessageSquare className="h-4 w-4" />
                Reply
              </button>
            ) : null}
          </div>
        </div>

        {replies.length ? <div className="mt-2 space-y-2">{replies.map((reply) => renderComment(reply, true))}</div> : null}
      </div>
    );
  };

  const railCardClass =
    "overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur";

  const composerToggle = () => {
    if (composerOpen && composerMode === "create") {
      closeComposer();
      return;
    }
    openComposer();
  };

  const jumpToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const jumpToMobileTrending = useCallback(() => {
    if (typeof window === "undefined") return;
    setMode("trending");
    const target = mobileTrendingRef.current;
    if (!target) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 88);
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const renderComposerPanel = () => (
    <section
      ref={composerRef}
      className="forum-fade-up rounded-[28px] border border-accent-blue/25 bg-[linear-gradient(180deg,rgba(11,15,26,0.94),rgba(9,11,18,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-4 md:px-5">
        <div className="flex items-start gap-3">
          <Avatar profile={viewerProfile} anonymous={form.anonymous} className="h-11 w-11" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">
              {composerMode === "create" ? "Compose Thread" : "Edit Thread"}
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white md:text-2xl">
              {composerMode === "create" ? "What's new in the community?" : "Refine your thread"}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={closeComposer}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
          aria-label="Close composer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {formError ? (
        <p className="mx-4 mt-4 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100 md:mx-5">
          {formError}
        </p>
      ) : null}

      <div className="grid gap-4 px-4 py-4 md:px-5 md:py-5">
        <input
          type="text"
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="Give your thread a sharp title"
          maxLength={140}
          className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-base font-semibold text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45"
        />

        <textarea
          value={form.body}
          onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
          rows={7}
          placeholder="Share context, details, links, or what help you need..."
          maxLength={5000}
          className="min-h-[180px] w-full rounded-[24px] border border-white/12 bg-white/[0.04] px-4 py-4 text-sm leading-relaxed text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={form.tag}
            onChange={(event) => setForm((current) => ({ ...current, tag: event.target.value as ForumTag }))}
            className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-accent-blue/45"
          >
            <option value="lost" className="bg-campus-black">
              #lost
            </option>
            <option value="help" className="bg-campus-black">
              #help
            </option>
            <option value="rant" className="bg-campus-black">
              #rant
            </option>
            <option value="events" className="bg-campus-black">
              #events
            </option>
            <option value="general" className="bg-campus-black">
              #general
            </option>
          </select>

          <select
            value={form.relation_type || ""}
            onChange={(event) => setForm((current) => ({ ...current, relation_type: (event.target.value || null) as RelationType }))}
            className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-accent-blue/45"
          >
            <option value="" className="bg-campus-black">
              #no-context
            </option>
            <option value="lost_found" className="bg-campus-black">
              #lost-found
            </option>
            <option value="event" className="bg-campus-black">
              #event
            </option>
          </select>
        </div>

        <input
          type="text"
          value={form.location}
          onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
          placeholder="Optional location"
          maxLength={120}
          className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45"
        />

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-white/65">Anonymous mode</p>
              <p className="mt-1 text-sm text-white/72">
                Show as <span className="font-semibold text-white">Anonymous Student</span> while keeping account ownership.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.anonymous}
              onClick={() => setForm((current) => ({ ...current, anonymous: !current.anonymous }))}
              className={cx(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
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
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-white/65">
                Images ({draftImages.length}/{MAX_IMAGES})
              </p>
              <p className="mt-1 text-xs text-white/50">Up to 6 images. Source up to 18MB each, auto-compressed on upload.</p>
            </div>
            <label className="cursor-pointer rounded-full border border-accent-blue/30 bg-accent-blue/15 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-accent-blue/25">
              Add images
              <input
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(event) => {
                  pickImages(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {draftImages.length ? (
            <div className="mt-3 grid h-[260px] grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30 md:h-[330px]">
              {draftImages.slice(0, 4).map((img, idx) => (
                <div key={`${img.file.name}-${idx}`} className={cx("relative", draftImages.length === 3 && idx === 0 ? "row-span-2" : "")}>
                  <img src={img.preview} alt={img.file.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeDraftImage(idx)}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {idx === 3 && draftImages.length > 4 ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-black text-white">
                      +{draftImages.length - 4}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/8 px-4 py-4 sm:flex-row sm:justify-end md:px-5">
        <button
          type="button"
          onClick={closeComposer}
          className="rounded-full border border-white/12 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white/80"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void savePost()}
          disabled={savingPost}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue/22 px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-60"
        >
          {savingPost ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {composerMode === "create" ? "Publish thread" : "Save changes"}
        </button>
      </div>
    </section>
  );

  const renderQuickComposer = () => (
    <section className={cx(railCardClass, "forum-fade-up")}>
      <div className="flex items-start gap-3 p-4 md:p-5">
        <Avatar profile={viewerProfile} anonymous={false} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={composerToggle}
            className="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/55 transition hover:border-accent-blue/30 hover:bg-accent-blue/10 hover:text-white"
          >
            <span>What's happening in NIESYNC Forum?</span>
            <Sparkles className="h-4 w-4 text-accent-amber" />
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={composerToggle}
              className="inline-flex items-center gap-2 rounded-full border border-accent-blue/30 bg-accent-blue/15 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white"
            >
              <PenSquare className="h-4 w-4" />
              New thread
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  const renderFeedPost = (
    post: ForumPost,
    emphasized = false,
    connectToPrev = false,
    connectToNext = false
  ) => {
    const profile = post.is_anonymous ? null : profilesById[post.author_id] || null;
    const userTag = post.is_anonymous ? "" : usernameOf(profile);
    const images = imagesByPostId[post.id] || [];
    const vote = votesByPostId[post.id] || 0;
    const liked = likedIds.has(post.id);
    const own = post.author_id === userId;
    const open = detailMode && activePostId === post.id;

    const titleBlock = (
      <>
        <h2 className={cx("font-black tracking-tight text-white", emphasized ? "text-[26px] md:text-[30px]" : "text-xl md:text-[22px]")}>
          {post.title}
        </h2>
        <p className={cx("mt-2 whitespace-pre-wrap leading-relaxed text-white/82", emphasized ? "text-[15px] md:text-base" : "text-sm md:text-[15px]")}>
          {post.body}
        </p>
        {renderPostImages(images, post.title, (index) => openImageLightbox(post.id, images, index))}
        {(post.location_label || post.relation_type) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.location_label ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65">
                <MapPin className="h-3.5 w-3.5" />
                {post.location_label}
              </span>
            ) : null}
            {post.relation_type ? (
              <span className="rounded-full border border-accent-amber/35 bg-accent-amber/14 px-3 py-1.5 text-xs font-semibold text-accent-amber">
                {relationHashtag(post.relation_type)}
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    );

    return (
      <article
        key={post.id}
        className={cx(
          "group relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-4 py-4 transition-colors duration-200 md:px-5 md:py-5",
          emphasized
            ? "border-accent-blue/28 shadow-[0_16px_40px_rgba(8,20,44,0.36)]"
            : "hover:border-accent-blue/22 hover:bg-white/[0.03]"
        )}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(37,99,235,0.45),transparent)] opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="flex gap-3">
          <div className={cx("relative flex w-11 shrink-0 justify-center", emphasized && "w-12")}>
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
            <Avatar profile={profile} anonymous={post.is_anonymous} className={emphasized ? "h-11 w-11" : "h-10 w-10"} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                  <p className="truncate text-sm font-black text-white">
                    {post.is_anonymous ? "Anonymous Student" : nameOf(profile)}
                  </p>
                  {!post.is_anonymous && isVerified(profile) ? <VerifiedGif sizeClass="h-4 w-4" /> : null}
                  <p className="truncate text-sm text-white/45">
                    {userTag ? `${userTag} | ` : ""}
                    {ago(post.created_at)}
                  </p>
                  {!emphasized && post.tag ? (
                    <span className="rounded-full border border-accent-blue/25 bg-accent-blue/12 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/85">
                      {tagHashtag(post.tag)}
                    </span>
                  ) : null}
                </div>
                {emphasized ? (
                  <p className="mt-1 text-[12px] text-white/42" title={fullDate(post.created_at)}>
                    {fullDate(post.created_at)}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!emphasized && post.relation_type ? (
                  <span className="hidden rounded-full border border-accent-amber/30 bg-accent-amber/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-accent-amber md:inline-flex">
                    {relationHashtag(post.relation_type)}
                  </span>
                ) : null}
                <button
                  type="button"
                  title="Share post"
                  aria-label="Share post"
                  onClick={() => openShareDialog(post.id, post.title)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                {own ? (
                  <>
                    <button
                      type="button"
                      title="Edit post"
                      aria-label="Edit post"
                      onClick={() => openComposer(post)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete post"
                      aria-label="Delete post"
                      onClick={() => openDeleteDialog(post)}
                      disabled={deletingPostId === post.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/28 bg-red-500/10 text-red-100 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingPostId === post.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {detailMode ? (
              <div className="mt-3">{titleBlock}</div>
            ) : (
              <div
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/forum/${post.id}`)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  router.push(`/forum/${post.id}`);
                }}
                className="mt-3 block w-full cursor-pointer text-left"
              >
                {titleBlock}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 md:gap-x-3">
              <StatPill
                icon={<MessageSquare className="h-4 w-4" />}
                label="Replies"
                value={post.comments_count}
                active={open}
                onClick={() => {
                  if (detailMode) {
                    void toggleDiscussion(post.id);
                    return;
                  }
                  router.push(`/forum/${post.id}`);
                }}
              />
              <StatPill
                icon={<ArrowBigUp className="h-4 w-4" />}
                label="Up"
                value={post.upvotes_count}
                tone="green"
                active={vote === 1}
                onClick={() => void votePost(post.id, 1)}
              />
              <StatPill
                icon={<ArrowBigDown className="h-4 w-4" />}
                label="Down"
                value={post.downvotes_count}
                tone="rose"
                active={vote === -1}
                onClick={() => void votePost(post.id, -1)}
              />
              <button
                type="button"
                onClick={() => void likePost(post.id)}
                className={cx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200",
                  liked
                    ? "border-pink-400/45 bg-pink-500/16 text-pink-100"
                    : "border-white/10 bg-white/[0.03] text-white/72 hover:border-pink-400/28 hover:bg-pink-500/10 hover:text-pink-100"
                )}
              >
                <span className="relative inline-flex h-4 w-4 items-center justify-center">
                  {likeAnimatingIds.has(post.id) && liked ? (
                    <span className="forum-like-ring absolute inset-[-7px]" />
                  ) : null}
                  <Heart className={cx("relative z-[1] h-4 w-4", liked && "fill-current", likeAnimatingIds.has(post.id) && "forum-heart-pop")} />
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em]">Likes</span>
                <span className="font-black text-white">{compactNumber(post.likes_count)}</span>
              </button>
            </div>

            {open ? (
              <div className="forum-fade-up mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))]">
                <div className="border-b border-white/8 px-4 py-3 md:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-secondary">Conversation</p>
                      <p className="mt-1 text-sm text-white/60">{compactNumber(post.comments_count)} replies in this thread</p>
                    </div>
                    {commentError ? (
                      <p className="rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs text-red-100">
                        {commentError}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4 md:px-5">
                  {loadingComments ? (
                    <>
                      <div className="forum-skeleton h-20 rounded-2xl" />
                      <div className="forum-skeleton h-20 rounded-2xl" />
                    </>
                  ) : (commentsByParent["__root__"] || []).length ? (
                    (commentsByParent["__root__"] || []).map((comment) => renderComment(comment))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-5 text-center">
                      <p className="text-sm font-semibold text-white">No replies yet</p>
                      <p className="mt-1 text-xs text-white/55">Be the first one to keep the conversation moving.</p>
                    </div>
                  )}

                  {replyToId ? (
                    <div className="flex items-center justify-between rounded-2xl border border-accent-amber/30 bg-accent-amber/10 px-4 py-3 text-sm text-accent-amber">
                      <span>Reply mode on</span>
                      <button type="button" onClick={() => setReplyToId(null)} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.11em]">
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-3 md:p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar profile={viewerProfile} anonymous={commentAnonymous} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {commentAnonymous ? "Anonymous Student" : nameOf(viewerProfile)}
                          </p>
                          <p className="text-[11px] text-white/45">{commentAnonymous ? "Replying anonymously" : "Replying with your profile"}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={commentAnonymous}
                        onClick={() => setCommentAnonymous((current) => !current)}
                        className={cx(
                          "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                          commentAnonymous ? "border-accent-blue/60 bg-accent-blue/35" : "border-white/20 bg-white/[0.08]"
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

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <textarea
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        rows={3}
                        placeholder={replyToId ? "Write a reply..." : "Write a reply to this thread..."}
                        className="min-h-[92px] flex-1 rounded-[22px] border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45"
                      />
                      <button
                        type="button"
                        onClick={() => void sendComment()}
                        disabled={sendingComment || !clean(commentDraft)}
                        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-accent-blue/35 bg-accent-blue/20 px-5 text-xs font-black uppercase tracking-[0.12em] text-white disabled:opacity-60"
                      >
                        {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                        {replyToId ? "Reply" : "Comment"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  };

  if (isBooting) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_88%_10%,rgba(255,176,0,0.14),transparent_28%),#050506] px-4 pb-24 pt-24 text-white">
        <div className="mx-auto max-w-[1280px]">
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
            <div className="hidden space-y-4 xl:block">
              <div className="forum-skeleton h-60 rounded-[28px]" />
            </div>
            <div className="space-y-4">
              <div className="forum-skeleton h-32 rounded-[28px]" />
              <div className="forum-skeleton h-28 rounded-[28px]" />
              <div className="forum-skeleton h-56 rounded-[28px]" />
              <div className="forum-skeleton h-56 rounded-[28px]" />
            </div>
            <div className="hidden space-y-4 xl:block">
              <div className="forum-skeleton h-72 rounded-[28px]" />
            </div>
          </div>
        </div>
        <style jsx global>{forumGlobalStyles}</style>
      </main>
    );
  }

  const desktopLeftRail = !detailMode ? (
    <aside className="hidden xl:block">
      <div className="sticky top-24 space-y-4">
        <section className={railCardClass}>
          <div className="border-b border-white/8 px-5 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-text-secondary">NIESYNC Forum</p>
            <h1 className="mt-2 text-[28px] font-black leading-none tracking-tight text-white">Campus conversations</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/62">
              Stay updated with campus posts and discussions.
            </p>
          </div>

          <div className="space-y-2 p-4">
            <Link
              href="/forum"
              className="flex items-center justify-between rounded-2xl border border-accent-blue/25 bg-accent-blue/12 px-4 py-3 text-sm font-black text-white transition hover:bg-accent-blue/18"
            >
              <span className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-accent-amber" />
                Forum feed
              </span>
              <Clock3 className="h-4 w-4 text-white/50" />
            </Link>

            <button
              type="button"
              onClick={composerToggle}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue px-4 py-3 text-sm font-black text-white shadow-[0_16px_36px_rgba(37,99,235,0.35)] transition hover:translate-y-[-1px]"
            >
              <PenSquare className="h-4 w-4" />
              Start thread
            </button>
          </div>
        </section>
      </div>
    </aside>
  ) : null;

  const desktopRightRail = !detailMode ? (
    <aside className="hidden xl:block">
      <div className="sticky top-24 space-y-4">
        <section className={railCardClass}>
          <div className="border-b border-white/8 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-secondary">Discover</p>
            <h2 className="mt-1 text-lg font-black text-white">Trending on campus</h2>
          </div>
          <div className="space-y-2 p-4">
            {trending.length ? (
              trending.map((post, index) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => router.push(`/forum/${post.id}`)}
                  className={cx(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    activePostId === post.id
                      ? "border-accent-blue/35 bg-accent-blue/14"
                      : "border-white/10 bg-white/[0.03] hover:border-accent-blue/22 hover:bg-accent-blue/10"
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">#{index + 1} trending</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">{post.title}</p>
                  <p className="mt-2 text-[11px] text-white/48">
                    {compactNumber(post.comments_count)} replies | {compactNumber(post.likes_count)} likes
                  </p>
                </button>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/55">
                Trending threads will appear here as soon as people start engaging.
              </p>
            )}
          </div>
        </section>

      </div>
    </aside>
  ) : null;

  const collapseLocked = !detailMode && composerOpen && composerMode === "create";
  const effectiveHeaderState: HeaderState = detailMode ? "expanded" : headerState;
  const headerCompact = effectiveHeaderState === "compact";
  const headerHidden = effectiveHeaderState === "hidden";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_32%),radial-gradient(circle_at_88%_10%,rgba(255,176,0,0.14),transparent_28%),#050506] px-3 pb-36 pt-20 text-white md:px-4 md:pb-24 md:pt-24">
      <style jsx global>{forumGlobalStyles}</style>

      <MobileToast
        kind={mobileToast?.kind || "info"}
        message={mobileToast?.message || ""}
        open={Boolean(mobileToast?.message)}
        onClose={() => setMobileToast(null)}
      />

      <div className={cx("mx-auto", detailMode ? "max-w-[860px]" : "max-w-[1380px]")}>
        <div className={cx("grid gap-6", detailMode ? "grid-cols-1" : "xl:grid-cols-[260px_minmax(0,1fr)_320px]")}>
          {desktopLeftRail}

          <section className="min-w-0">
            <header
              className={cx(
                railCardClass,
                "sticky top-16 z-30 overflow-hidden transition-[box-shadow,border-color] duration-200 md:top-24",
                headerCompact && !detailMode && "shadow-[0_20px_65px_rgba(0,0,0,0.5)]",
                headerHidden && !detailMode && "max-md:border-white/0 max-md:shadow-none"
              )}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(37,99,235,0.55),rgba(255,176,0,0.35),transparent)]" />
              <div
                className={cx(
                  "overflow-hidden px-4 md:px-5",
                  detailMode
                    ? "py-4"
                    : headerHidden
                    ? "max-h-0 py-0 opacity-0 pointer-events-none transition-[max-height,opacity,padding] duration-300"
                    : headerCompact
                    ? "max-h-[64px] py-1 opacity-100 transition-[max-height,opacity,padding] duration-300"
                    : "max-h-[560px] py-4 opacity-100 transition-[max-height,opacity,padding] duration-300"
                )}
              >
                {detailMode ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href="/forum"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                        aria-label="Back to forum"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Link>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Thread view</p>
                        <h1 className="mt-1 text-xl font-black tracking-tight text-white md:text-2xl">
                          {activePost?.title || "Forum Thread"}
                        </h1>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href="/forum/me"
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/80 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                      >
                        <UserRound className="h-4 w-4" />
                        Your posts
                      </Link>
                      <button
                        type="button"
                        onClick={composerToggle}
                        className="inline-flex items-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue/20 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white"
                      >
                        <PenSquare className="h-4 w-4" />
                        New thread
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={cx("transition-[gap] duration-300", headerCompact || headerHidden ? "space-y-0" : "space-y-3 md:space-y-4")}>
                    <div
                      className={cx(
                        "overflow-hidden transition-all duration-300",
                        headerCompact || headerHidden ? "max-h-0 opacity-0" : "max-h-[260px] opacity-100"
                      )}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-text-secondary">NIESYNC Forum</p>
                      <h1 className="mt-2 text-[28px] font-black tracking-tight text-white md:text-[36px]">Campus discussions</h1>
                    </div>

                    <div
                      className={cx(
                        "flex w-full flex-wrap items-center gap-2 overflow-hidden transition-all duration-300",
                        headerCompact || headerHidden ? "max-h-0 opacity-0 pointer-events-none" : "max-h-16 opacity-100"
                      )}
                    >
                      <Link
                        href="/forum/me"
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white/85 transition hover:border-accent-blue/25 hover:bg-accent-blue/12 hover:text-white"
                      >
                        <UserRound className="h-4 w-4" />
                        Your posts
                      </Link>
                      <button
                        type="button"
                        onClick={composerToggle}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-accent-blue/40 bg-accent-blue px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(37,99,235,0.28)] transition hover:translate-y-[-1px]"
                      >
                        <PenSquare className="h-4 w-4" />
                        {composerOpen && composerMode === "create" ? "Close composer" : "New thread"}
                      </button>
                    </div>

                    <div className={cx("grid gap-0 md:gap-0", headerCompact || headerHidden ? "grid-cols-1" : "gap-2 md:gap-3 lg:grid-cols-[minmax(0,1fr)_auto]")}>
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                        <input
                          type="text"
                          value={searchInput}
                          onChange={(event) => setSearchInput(event.target.value)}
                          placeholder="Search threads, context, or locations"
                          className="w-full rounded-full border border-white/12 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-accent-blue/45"
                        />
                      </label>

                      <div
                        className={cx(
                          "grid grid-cols-2 gap-2 overflow-hidden transition-all duration-300 sm:flex",
                          headerCompact || headerHidden ? "max-h-0 opacity-0 pointer-events-none" : "max-h-16 opacity-100"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setMode("latest")}
                          className={cx(
                            "rounded-full border px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition",
                            mode === "latest"
                              ? "border-accent-blue/40 bg-accent-blue/18 text-white"
                              : "border-white/10 bg-white/[0.03] text-white/70 hover:border-accent-blue/25 hover:bg-accent-blue/10 hover:text-white"
                          )}
                        >
                          Latest
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode("trending")}
                          className={cx(
                            "rounded-full border px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition",
                            mode === "trending"
                              ? "border-accent-amber/40 bg-accent-amber/14 text-accent-amber"
                              : "border-white/10 bg-white/[0.03] text-white/70 hover:border-accent-amber/25 hover:bg-accent-amber/10 hover:text-accent-amber"
                          )}
                        >
                          Trending
                        </button>
                      </div>
                    </div>

                    <div
                      className={cx(
                        "grid gap-2 overflow-hidden transition-all duration-300 sm:grid-cols-2",
                        headerCompact || headerHidden ? "max-h-0 opacity-0 pointer-events-none" : "max-h-40 opacity-100"
                      )}
                    >
                      <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Topic tag</p>
                        <select
                          value={tagFilter}
                          onChange={(event) => setTagFilter(event.target.value as TagFilter)}
                          className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                        >
                          {(["all", "lost", "help", "rant", "events", "general"] as TagFilter[]).map((tag) => (
                            <option key={tag} value={tag} className="bg-campus-black text-white">
                              {tagHashtag(tag)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Relation tag</p>
                        <select
                          value={relationFilter}
                          onChange={(event) => setRelationFilter(event.target.value as RelationFilter)}
                          className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                        >
                          {(["all", "lost_found", "event"] as RelationFilter[]).map((relation) => (
                            <option key={relation} value={relation} className="bg-campus-black text-white">
                              {relationHashtag(relation)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {effectiveHeaderState === "expanded" && clean(searchInput) && clean(searchInput).length < 3 ? (
                      <p className="text-xs text-white/55">Type at least 3 letters to start search.</p>
                    ) : null}
                  </div>
                )}
              </div>
            </header>

            <div className="mt-4 space-y-4">
              {!detailMode ? <div className="hidden md:block">{renderQuickComposer()}</div> : null}
              {composerOpen ? renderComposerPanel() : null}

              {error ? (
                <p className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>
              ) : null}
              {feedError ? (
                <p className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{feedError}</p>
              ) : null}
              {feedNotice ? (
                <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{feedNotice}</p>
              ) : null}

              {!detailMode ? (
                <section id="mobile-trending" ref={mobileTrendingRef} className={cx(railCardClass, "md:hidden")}>
                  <div className="border-b border-white/8 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-text-secondary">Trending</p>
                    <h2 className="mt-1 text-base font-black text-white">Campus now</h2>
                  </div>
                  <div className="space-y-2 p-3">
                    {trending.slice(0, 4).map((post, index) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => router.push(`/forum/${post.id}`)}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-accent-blue/24 hover:bg-accent-blue/10"
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/45">#{index + 1} trending</p>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">{post.title}</p>
                        <p className="mt-1 text-[11px] text-white/52">
                          {compactNumber(post.comments_count)} replies | {compactNumber(post.likes_count)} likes
                        </p>
                      </button>
                    ))}
                    {trending.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/55">
                        Trending threads will appear here.
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section className={cx(railCardClass, "p-3 md:p-4")}>
                {loadingFeed ? (
                  <div className="space-y-3 md:space-y-4">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className="rounded-[22px] border border-white/10 bg-white/[0.02] p-4 md:p-5">
                        <div className="forum-skeleton h-40 rounded-[22px]" />
                      </div>
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                      <Search className="h-6 w-6 text-white/45" />
                    </div>
                    <h2 className="mt-4 text-xl font-black text-white">{detailMode ? "Thread not found" : "No threads matched"}</h2>
                    <p className="mt-2 text-sm text-white/58">
                      {detailMode
                        ? "This thread may have been removed or you may not have permission to open it."
                        : "Try another search or filter, or start a fresh discussion."}
                    </p>
                    {!detailMode ? (
                      <button
                        type="button"
                        onClick={composerToggle}
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent-blue/35 bg-accent-blue/18 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white"
                      >
                        <PenSquare className="h-4 w-4" />
                        Start thread
                      </button>
                    ) : (
                      <Link
                        href="/forum"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent-blue/35 bg-accent-blue/18 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back to forum
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 md:space-y-4">
                    {posts.map((post, index) => {
                      const previousPost = posts[index - 1];
                      const nextPost = posts[index + 1];
                      const canConnectWith = (peer: ForumPost | undefined) =>
                        Boolean(peer && !post.is_anonymous && !peer.is_anonymous && peer.author_id === post.author_id);

                      return renderFeedPost(
                        post,
                        detailMode && index === 0,
                        canConnectWith(previousPost),
                        canConnectWith(nextPost)
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </section>

          {desktopRightRail}
        </div>
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
            className="relative z-10 w-full max-w-md rounded-[28px] border border-accent-blue/35 bg-[linear-gradient(145deg,rgba(9,12,28,0.98)_0%,rgba(17,23,44,0.92)_55%,rgba(37,99,235,0.16)_100%)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.65)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black">Share thread</p>
                <p className="mt-1 truncate text-xs text-white/65">{shareDialog.title || "NIE Forum Thread"}</p>
              </div>
              <button
                type="button"
                onClick={closeShareDialog}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 truncate rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/65">
              {shareUrlForPost(shareDialog.postId)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void shareViaNative()}
                className="rounded-full border border-accent-blue/45 bg-accent-blue/22 px-3 py-3 text-xs font-black uppercase tracking-[0.11em] text-white hover:bg-accent-blue/32"
              >
                Share
              </button>
              <button
                type="button"
                onClick={() => void copyShareLink()}
                className={cx(
                  "rounded-full border px-3 py-3 text-xs font-black uppercase tracking-[0.11em]",
                  shareCopied
                    ? "border-emerald-300/45 bg-emerald-500/20 text-emerald-100"
                    : "border-accent-amber/35 bg-accent-amber/14 text-accent-amber hover:bg-accent-amber/24"
                )}
              >
                {shareCopied ? "Copied" : "Copy link"}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => shareToChannel("whatsapp")}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-2.5 text-xs font-semibold text-white/88 hover:bg-white/[0.06]"
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => shareToChannel("x")}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-2.5 text-xs font-semibold text-white/88 hover:bg-white/[0.06]"
              >
                X
              </button>
              <button
                type="button"
                onClick={() => shareToChannel("telegram")}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-2.5 text-xs font-semibold text-white/88 hover:bg-white/[0.06]"
              >
                Telegram
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
                <span className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/85">
                  {lightbox.index + 1} / {lightbox.urls.length}
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

      <button
        type="button"
        onClick={jumpToTop}
        className={cx(
          "fixed left-1/2 top-[144px] z-[126] inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-accent-blue/50 bg-[linear-gradient(180deg,#2e67e8,#2053c2)] text-white shadow-[0_16px_36px_rgba(37,99,235,0.42)] transition-all duration-200 hover:border-accent-blue/65 hover:brightness-110 md:top-[180px]",
          showScrollTop && (headerCompact || headerHidden) ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
        )}
        aria-label="Scroll to top"
        title="Scroll to top"
      >
        <ArrowUp className="h-5 w-5" />
      </button>

      {!detailMode ? (
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
            onClick={jumpToMobileTrending}
            aria-current="page"
            className="relative inline-flex min-w-[124px] flex-col items-center gap-1 rounded-[16px] border border-white/18 bg-white/14 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_rgba(37,99,235,0.16)] transition-all duration-200 hover:bg-white/18 active:scale-[0.96]"
          >
            <Flame className="h-4 w-4 text-accent-amber drop-shadow-[0_0_10px_rgba(255,176,0,0.35)]" />
            Trending
          </button>

          <button
            type="button"
            onClick={() => router.push("/forum/me")}
            className="relative inline-flex min-w-[124px] flex-col items-center gap-1 rounded-[16px] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/82 transition-all duration-200 hover:bg-white/12 hover:text-white active:scale-[0.96]"
          >
            <UserRound className="h-4 w-4" />
            Your Profile
          </button>
        </nav>
      ) : null}

      {!detailMode ? (
        <button
          type="button"
          onClick={composerToggle}
          className="fixed bottom-24 right-5 z-[125] inline-flex h-14 w-14 items-center justify-center rounded-full border border-accent-blue/50 bg-accent-blue text-white shadow-[0_16px_40px_rgba(37,99,235,0.45)] transition-transform hover:scale-105 active:scale-95 md:hidden"
          aria-label={composerOpen && composerMode === "create" ? "Close post composer" : "Create new post"}
          title={composerOpen && composerMode === "create" ? "Close composer" : "Create post"}
        >
          {composerOpen && composerMode === "create" ? <X className="h-6 w-6" /> : <PenSquare className="h-6 w-6" />}
        </button>
      ) : null}
    </main>
  );
}

const forumGlobalStyles = `
  .forum-fade-up {
    animation: forumFadeUp 0.26s ease;
  }

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

  .forum-heart-pop {
    animation: forumHeartPop 0.42s cubic-bezier(.2,.9,.2,1.2);
  }

  .forum-like-ring {
    border-radius: 9999px;
    border: 2px solid rgba(244,114,182,0.5);
    animation: forumLikeRing 0.5s ease-out forwards;
  }

  .forum-action-icon-small {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes forumFadeUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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

  @keyframes forumHeartPop {
    0% {
      transform: scale(0.75);
    }
    60% {
      transform: scale(1.18);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes forumLikeRing {
    0% {
      opacity: 0.7;
      transform: scale(0.72);
    }
    100% {
      opacity: 0;
      transform: scale(1.55);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .forum-fade-up,
    .forum-dock-float,
    .forum-heart-pop,
    .forum-skeleton::after,
    .forum-like-ring {
      animation: none !important;
    }

    * {
      scroll-behavior: auto !important;
    }
  }
}
`;
