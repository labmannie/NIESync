import { Trophy, Medal, Star, ShieldAlert, Award } from "lucide-react";

export default function Leaderboard() {
  const leaders = [
    { rank: 1, name: "Arjun M.", score: 2450, reports: 112, badge: "Grandmaster" },
    { rank: 2, name: "Priya S.", score: 2100, reports: 94, badge: "Master" },
    { rank: 3, name: "Rahul K.", score: 1850, reports: 86, badge: "Expert" },
    { rank: 4, name: "Neha G.", score: 1520, reports: 61, badge: "Pro" },
    { rank: 5, name: "Vikram R.", score: 1240, reports: 52, badge: "Pro" },
    { rank: 6, name: "Anjali D.", score: 980, reports: 41, badge: "Scout" },
    { rank: 7, name: "Karan B.", score: 850, reports: 34, badge: "Scout" },
  ];

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

        {/* Top 3 Podium */}
        <div className="flex flex-col md:flex-row justify-center items-end gap-6 mb-16 h-auto md:h-64 mt-10">
          {/* 2nd Place */}
          <div className="flex flex-col items-center w-full md:w-64 glass-card p-6 !pb-10 rounded-t-sm border-b-0 border-white/20 relative md:translate-y-8">
            <div className="absolute -top-6 w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center border-4 border-campus-black shadow-xl">
              <Medal className="w-6 h-6 text-gray-600" />
            </div>
            <h3 className="text-xl font-bold mt-4">{leaders[1].name}</h3>
            <span className="text-gray-400 text-sm font-medium mt-1">{leaders[1].badge}</span>
            <div className="mt-4 text-center">
              <p className="text-3xl font-bold text-white tracking-tighter">{leaders[1].score}</p>
              <p className="text-xs text-text-secondary uppercase tracking-widest mt-1">Points</p>
            </div>
          </div>

          {/* 1st Place */}
          <div className="flex flex-col items-center w-full md:w-72 glass-card p-6 !pb-12 border-accent-blue/50 border-2 rounded-t-sm shadow-[0_-20px_50px_-20px_rgba(37,99,235,0.4)] relative z-10">
            <div className="absolute -top-8 w-16 h-16 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-full flex items-center justify-center border-4 border-campus-black shadow-xl">
              <Trophy className="w-8 h-8 text-yellow-900" />
            </div>
            <h3 className="text-2xl font-bold mt-6">{leaders[0].name}</h3>
            <span className="text-accent-blue font-bold text-sm mt-1">{leaders[0].badge}</span>
            <div className="mt-6 text-center">
              <p className="text-4xl font-bold text-white tracking-tighter drop-shadow-md">{leaders[0].score}</p>
              <p className="text-xs text-text-secondary uppercase tracking-widest mt-1">Points</p>
            </div>
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center w-full md:w-64 glass-card p-6 !pb-8 rounded-t-sm border-b-0 border-white/20 relative md:translate-y-12">
            <div className="absolute -top-6 w-12 h-12 bg-amber-700 rounded-full flex items-center justify-center border-4 border-campus-black shadow-xl">
              <Award className="w-6 h-6 text-amber-200" />
            </div>
            <h3 className="text-xl font-bold mt-4">{leaders[2].name}</h3>
            <span className="text-amber-600 text-sm font-medium mt-1">{leaders[2].badge}</span>
            <div className="mt-4 text-center">
              <p className="text-3xl font-bold text-white tracking-tighter">{leaders[2].score}</p>
              <p className="text-xs text-text-secondary uppercase tracking-widest mt-1">Points</p>
            </div>
          </div>
        </div>

        {/* List View */}
        <div className="max-w-4xl mx-auto w-full glass-card rounded-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-text-secondary">
            <div className="col-span-2 md:col-span-1 text-center">Rank</div>
            <div className="col-span-6 md:col-span-5">Student</div>
            <div className="col-span-4 md:col-span-3 text-right md:text-left">Total Reports</div>
            <div className="hidden md:block col-span-3 text-right">Score</div>
          </div>
          
          <div className="flex flex-col">
            {leaders.slice(3).map((leader) => (
              <div key={leader.rank} className="grid grid-cols-12 gap-4 px-6 py-5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors items-center">
                <div className="col-span-2 md:col-span-1 text-center text-xl font-bold text-text-secondary">
                  #{leader.rank}
                </div>
                <div className="col-span-6 md:col-span-5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">{leader.name.charAt(0)}</div>
                  <span className="font-semibold text-white/90">{leader.name}</span>
                </div>
                <div className="col-span-4 md:col-span-3 flex items-center justify-end md:justify-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-white/80">{leader.reports} Reports</span>
                </div>
                <div className="hidden md:flex col-span-3 justify-end items-center gap-2">
                  <Star className="w-4 h-4 text-accent-blue" />
                  <span className="font-bold text-lg">{leader.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </main>
  );
}
