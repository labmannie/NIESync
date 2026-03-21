import Link from "next/link";
import { CheckCircle2, CircleX } from "lucide-react";
import { createClient } from "@/utils/supabase/server";

type ResolvePageProps = {
  params: Promise<{
    reportId: string;
    token: string;
  }>;
};

export default async function ResolveParkingReportPage({ params }: ResolvePageProps) {
  const { reportId, token } = await params;
  const supabase = await createClient();

  let resolved = false;
  let errorMessage = "";

  const { data, error } = await supabase.rpc("parking_resolve_by_token", {
    _report_id: reportId,
    _token: token,
  });

  if (error) {
    errorMessage = error.message || "Unable to verify this link.";
  } else {
    resolved = Boolean(data);
  }

  return (
    <main className="min-h-screen bg-campus-black px-4 py-32 text-white selection:bg-accent-blue/30">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.04]">
          {resolved ? (
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          ) : (
            <CircleX className="h-7 w-7 text-red-400" />
          )}
        </div>

        <h1 className="text-2xl font-black uppercase tracking-wide">
          {resolved ? "Vehicle Marked as Moving" : "Link Not Valid"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {resolved
            ? "Thanks. The parking report has been resolved in NIE Sync."
            : errorMessage || "This resolve link is invalid, expired, or already used."}
        </p>

        <div className="mt-7">
          <Link
            href="/"
            className="inline-flex rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] transition-colors hover:bg-white/[0.12]"
          >
            Go to NIE Sync
          </Link>
        </div>
      </div>
    </main>
  );
}
