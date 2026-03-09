import { Search, MapPin, Clock, Tag } from "lucide-react";

export default function LostAndFound() {
  // Sample Data for highly styled UI
  const items = [
    { id: 1, title: "Apple AirPods Pro", location: "Library 2nd Floor", time: "2 hours ago", status: "found", type: "Electronics" },
    { id: 2, title: "Hydro Flask (Blue)", location: "Gymnasium", time: "5 hours ago", status: "lost", type: "Accessories" },
    { id: 3, title: "Calculus Textbook", location: "Block C1", time: "1 day ago", status: "found", type: "Books" },
    { id: 4, title: "Honda Car Keys", location: "Cafeteria", time: "30 mins ago", status: "found", type: "Keys" },
  ];

  return (
    <main className="min-h-screen w-full bg-campus-black text-white selection:bg-accent-blue/30 flex flex-col">
      <div className="relative z-10 flex flex-col flex-grow px-8 md:px-16 pt-32 pb-12 max-w-[1920px] mx-auto w-full">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-white/10 pb-8 mt-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-3 flex items-center gap-4">
              Lost & <span className="text-accent-blue">Found</span>
            </h1>
            <p className="text-text-secondary text-base max-w-xl">
              Report lost items or browse recently found properties across the NIE campus. Authenticated students can claim items securely.
            </p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <div className="relative flex-grow md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input 
                type="text" 
                placeholder="Search items..." 
                className="w-full bg-white/5 border border-white/10 rounded-sm py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
            </div>
            <button className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium text-sm px-6 py-2.5 rounded-sm transition-colors whitespace-nowrap">
              Filter
            </button>
          </div>
        </div>

        {/* Action Widgets / Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            { label: "Items Recovered Today", value: "24", color: "text-green-400" },
            { label: "Active Reports", value: "142", color: "text-accent-amber" },
            { label: "Success Rate", value: "86%", color: "text-accent-blue" }
          ].map((stat, i) => (
            <div key={i} className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 p-6 rounded-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-white/10 transition-colors"></div>
              <p className="text-text-secondary text-sm font-medium mb-1">{stat.label}</p>
              <p className={`text-4xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Grid Feed */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-wide">Recent Activity Feed</h2>
          <div className="flex gap-2">
            <button className="text-sm font-medium text-white px-4 py-1.5 bg-white/10 rounded-full">All</button>
            <button className="text-sm font-medium text-text-secondary px-4 py-1.5 hover:text-white transition-colors">Lost</button>
            <button className="text-sm font-medium text-text-secondary px-4 py-1.5 hover:text-white transition-colors">Found</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <div key={item.id} className="glass-card shine-effect p-5 rounded-sm flex flex-col group hover:border-white/30 transition-all duration-300">
              <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm ${item.status === 'found' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-accent-amber/20 text-accent-amber border border-accent-amber/30'}`}>
                  {item.status}
                </span>
                <span className="text-text-secondary text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {item.time}
                </span>
              </div>
              
              <h3 className="text-lg font-semibold text-white/95 mb-2 group-hover:text-accent-blue transition-colors">{item.title}</h3>
              
              <div className="space-y-2 mt-auto pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <MapPin className="w-4 h-4 opacity-70" />
                  <span>{item.location}</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <Tag className="w-4 h-4 opacity-70" />
                  <span>{item.type}</span>
                </div>
              </div>
              
              <button className={`w-full mt-6 py-2.5 text-sm font-bold uppercase tracking-wide rounded-sm transition-colors ${item.status === 'found' ? 'bg-white text-campus-black hover:bg-gray-200' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                {item.status === 'found' ? 'Claim Property' : 'I Found This'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
