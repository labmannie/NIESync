import { Trophy, Medal, Star, ShieldAlert, Award } from "lucide-react";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type LeaderboardRow = {
  rank: number;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  points: number;
  total_reports: number;
  resolved_parking_reports: number;
  returned_lost_and_found_items: number;
  accepted_claims: number;
};

function displayName(row: LeaderboardRow) {
  const full = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (row.username) return `@${row.username}`;
  return "Anonymous Student";
}

function badgeFor(points: number) {
  if (points >= 2000) return "Grandmaster";
  if (points >= 1200) return "Master";
  if (points >= 700) return "Expert";
  if (points >= 300) return "Pro";
  return "Scout";
}

async function getLeaders(): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leaderboard", { _limit: 50 });

  if (error) {
    console.error("Failed to load leaderboard:", error.message);
    return [];
  }

  return (data || []) as LeaderboardRow[];
}

export default async function Leaderboard() {
  const leaders = await getLeaders();
  const top3 = leaders.slice(0, 3);
  const rest = leaders.slice(3);

  return (
    <main className="min-h-screen w-full bg-campus-black text-white flex flex-col relative overflow-hidden pt-28">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-accent-blue/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 flex flex-col flex-grow px-8 md:px-16 pt-32 pb-12 max-w-[1920px] mx-auto w-full">

        {/* Header Section */}
        <div className="flex flex-col items-center justify-center text-center mt-12 mb-16">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(37,99,235,0.3)]">
            <Trophy className="w-8 h-8 text-accent-blue" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-4">
            Campus <span className="text-accent-blue">Leaderboard</span>
          </h1>
          <p className="text-text-secondary text-base max-w-2xl">
            Recognizing the top contributors who help keep NIE campus secure and organized. Earn points by reporting parking violations and turning in lost items.
          </p>
        </div>

        {leaders.length === 0 ? (
          <div className="max-w-2xl mx-auto w-full glass-card rounded-sm p-12 text-center">
            <Trophy className="w-10 h-10 text-text-secondary mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No contributors yet</h3>
            <p className="text-text-secondary text-sm">
              Resolve a parking report or return a lost item to claim the very first spot on the board.
            </p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {top3.length > 0 && (
              <div className="flex flex-col md:flex-row justify-center items-end gap-6 mb-16 h-auto md:h-64 mt-10">
                {/* 2nd Place */}
                {top3[1] && (
                  <div className="flex flex-col items-center w-full md:w-64 glass-card p-6 !pb-10 rounded-t-sm border-b-0 border-white/20 relative md:translate-y-8">
                    <div className="absolute -top-6 w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center border-4 border-campus-black shadow-xl">
                      <Medal className="w-6 h-6 text-gray-600" />
                    </div>
                    <h3 className="text-xl font-bold mt-4">{displayName(top3[1])}</h3>
                    <span className="text-gray-400 text-sm font-medium mt-1">{badgeFor(top3[1].points)}</span>
                    <div className="mt-4 text-center">
                      <p className="text-3xl font-bold text-white tracking-tighter">{top3[1].points}</p>
                      <p className="text-xs text-text-secondary uppercase tracking-widest mt-1">Points</p>
                    </div>
                  </div>
                )}

                {/* 1st Place */}
                {top3[0] && (
                  <div className="flex flex-col items-center w-full md:w-72 glass-card p-6 !pb-12 border-accent-blue/50 border-2 rounded-t-sm shadow-[0_-20px_50px_-20px_rgba(37,99,235,0.4)] relative z-10">
                    <div className="absolute -top-8 w-16 h-16 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-full flex items-center justify-center border-4 border-campus-black shadow-xl">
                      <Trophy className="w-8 h-8 text-yellow-900" />
                    </div>
                    <h3 className="text-2xl font-bold mt-6">{displayName(top3[0])}</h3>
                    <span className="text-accent-blue font-bold text-sm mt-1">{badgeFor(top3[0].points)}</span>
                    <div className="mt-6 text-center">
                      <p className="text-4xl font-bold text-white tracking-tighter drop-shadow-md">{top3[0].points}</p>
                      <p className="text-xs text-text-secondary uppercase tracking-widest mt-1">Points</p>
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {top3[2] && (
                  <div className="flex flex-col items-center w-full md:w-64 glass-card p-6 !pb-8 rounded-t-sm border-b-0 border-white/20 relative md:translate-y-12">
                    <div className="absolute -top-6 w-12 h-12 bg-amber-700 rounded-full flex items-center justify-center border-4 border-campus-black shadow-xl">
                      <Award className="w-6 h-6 text-amber-200" />
                    </div>
                    <h3 className="text-xl font-bold mt-4">{displayName(top3[2])}</h3>
                    <span className="text-amber-600 text-sm font-medium mt-1">{badgeFor(top3[2].points)}</span>
                    <div className="mt-4 text-center">
                      <p className="text-3xl font-bold text-white tracking-tighter">{top3[2].points}</p>
                      <p className="text-xs text-text-secondary uppercase tracking-widest mt-1">Points</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* List View */}
            {rest.length > 0 && (
              <div className="max-w-4xl mx-auto w-full glass-card rounded-sm overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-text-secondary">
                  <div className="col-span-2 md:col-span-1 text-center">Rank</div>
                  <div className="col-span-6 md:col-span-5">Student</div>
                  <div className="col-span-4 md:col-span-3 text-right md:text-left">Total Reports</div>
                  <div className="hidden md:block col-span-3 text-right">Score</div>
                </div>

                <div className="flex flex-col">
                  {rest.map((leader) => (
                    <div key={leader.profile_id} className="grid grid-cols-12 gap-4 px-6 py-5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors items-center">
                      <div className="col-span-2 md:col-span-1 text-center text-xl font-bold text-text-secondary">
                        #{leader.rank}
                      </div>
                      <div className="col-span-6 md:col-span-5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">{displayName(leader).charAt(0)}</div>
                        <span className="font-semibold text-white/90">{displayName(leader)}</span>
                      </div>
                      <div className="col-span-4 md:col-span-3 flex items-center justify-end md:justify-start gap-2">
                        <ShieldAlert className="w-4 h-4 text-text-secondary" />
                        <span className="font-medium text-white/80">{leader.total_reports} Reports</span>
                      </div>
                      <div className="hidden md:flex col-span-3 justify-end items-center gap-2">
                        <Star className="w-4 h-4 text-accent-blue" />
                        <span className="font-bold text-lg">{leader.points}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </main>
  );
}
