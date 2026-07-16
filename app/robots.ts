import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://niesync.vercel.app").replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/parking-patrol",
        "/parking-patrol/",
        "/forum",
        "/forum/",
        "/lost-and-found",
        "/lost-and-found/",
        "/profile",
        "/profile/",
        "/resolve",
        "/resolve/",
        "/status",
        "/reset-password",
        "/forgot-password",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
