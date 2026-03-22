function ParkingCard() {
  const [violation, setViolation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLatestViolation() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('parking_violations') // Ensure this matches the exact Supabase table name
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data && !error) {
        setViolation(data);
      }
      setLoading(false);
    }
    fetchLatestViolation();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="glass-card shine-effect w-full lg:w-[420px] p-6 rounded-sm relative group cursor-pointer hover:border-white/40 transition-all duration-500 z-10"
    >
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-white font-bold text-xs uppercase tracking-[0.15em]">Recent Violation</h3>
        <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1.5 rounded-full border border-green-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse relative"></span>
          <span className="text-green-400 text-[10px] font-black uppercase tracking-widest">Active Report</span>
        </div>
      </div>

      <div className="bg-campus-black/80 border border-white/10 rounded-sm flex items-center p-4 gap-5 group-hover:bg-campus-black transition-colors min-h-[86px]">
        {loading ? (
          // SKELETON LOADING STATE
          <div className="flex items-center gap-5 w-full animate-pulse">
            <div className="w-[84px] h-[52px] bg-white/10 rounded-sm"></div>
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-4 bg-white/10 rounded w-3/4"></div>
              <div className="h-3 bg-white/5 rounded w-1/2"></div>
            </div>
          </div>
        ) : !violation ? (
           // EMPTY STATE
           <div className="flex items-center justify-center w-full py-2">
             <span className="text-white/50 text-sm font-medium tracking-wide">No active violations reported.</span>
           </div>
        ) : (
          // ACTUAL DATA
          <>
            <div className="w-[84px] h-[52px] bg-white/10 rounded-sm flex items-center justify-center overflow-hidden relative border border-white/10 shrink-0">
              <div className="absolute inset-0 bg-white/5 backdrop-blur-md" />
              <span className="text-white/90 font-mono text-sm z-10 font-bold tracking-[0.2em] blur-[2px] select-none group-hover:blur-0 transition-all duration-300">
                {violation.vehicle_number || "KA09***"}
              </span>
            </div>
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="text-white text-sm font-bold tracking-wide truncate">
                {violation.reason || "Unauthorized Parking"}
              </span>
              <span className="text-text-secondary text-xs font-medium uppercase tracking-wider truncate">
                {violation.location || "Campus Grounds"}
              </span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function LostFoundCard() {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLatestItem() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('lost_and_found') // Ensure this matches the exact Supabase table name
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data && !error) {
        setItem(data);
      }
      setLoading(false);
    }
    fetchLatestItem();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="glass-card shine-effect w-full lg:w-[360px] p-6 rounded-sm relative group cursor-pointer hover:border-white/40 transition-all duration-500 lg:-ml-12 z-20 lg:mb-6 lg:shadow-[-30px_0_50px_-10px_rgba(0,0,0,0.8)]"
    >
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-white font-bold text-xs uppercase tracking-[0.15em]">Recently Found</h3>
      </div>

      <div className="flex items-center justify-between mt-2 min-h-[48px]">
        {loading ? (
           // SKELETON LOADING STATE
           <div className="flex items-center gap-4 w-full animate-pulse">
             <div className="w-12 h-12 bg-white/10 rounded-full shrink-0"></div>
             <div className="flex flex-col gap-2 flex-1">
               <div className="h-4 bg-white/10 rounded w-2/3"></div>
               <div className="h-3 bg-white/5 rounded w-1/3"></div>
             </div>
           </div>
        ) : !item ? (
           // EMPTY STATE
           <div className="flex items-center w-full">
              <span className="text-white/50 text-sm font-medium tracking-wide">No recent items found.</span>
           </div>
        ) : (
          // ACTUAL DATA
          <div className="flex items-center gap-4 w-full">
            <div className="w-12 h-12 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-full flex items-center justify-center text-white shadow-inner group-hover:text-accent-blue transition-colors shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="text-white text-sm font-bold tracking-wide truncate">
                {item.item_name || "Unknown Item"}
              </span>
              <span className="text-text-secondary text-xs font-medium uppercase tracking-wider truncate">
                {item.location || "Campus"} • {item.status || "Reported"}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
