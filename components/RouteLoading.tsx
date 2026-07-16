import { Loader2 } from "lucide-react";

export default function RouteLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent-blue/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-text-secondary">{label}</p>
      </div>
    </main>
  );
}
