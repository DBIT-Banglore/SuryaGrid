import Link from "next/link";

const features = [
  { title: "Solar Nowcasting", desc: "pvlib physics forecasts from real GHI/DNI/DHI irradiance, cloud cover, and temperature.", color: "from-amber-400 to-orange-500", icon: "M12 3v2m0 14v2m9-9h-2M5 12H3m14.5-6.5l-1.4 1.4M7.9 16.1l-1.4 1.4m12.6 0l-1.4-1.4M7.9 7.9L6.5 6.5M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
  { title: "DSM Penalty Engine", desc: "Deviation Settlement analysis against scheduled MW with penalty cost estimates.", color: "from-blue-400 to-cyan-500", icon: "M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" },
  { title: "Energy Balance", desc: "Production vs consumption, surplus/deficit, self-consumption and grid flow.", color: "from-emerald-400 to-green-500", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { title: "Settlement Engine", desc: "Reward, penalty and discount settlement between owners and consumers.", color: "from-purple-400 to-fuchsia-500", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { title: "RL Optimization", desc: "Reinforcement learning tunes rates, trained on real historical irradiance.", color: "from-pink-400 to-rose-500", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  { title: "Live Real Data", desc: "Open-Meteo irradiance, NLR NSRDB, Kaggle PV, persisted in a real database.", color: "from-cyan-400 to-blue-500", icon: "M4 7v10c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3V7M4 7c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3M4 7c0-2 1.5-3 4-3h8c2.5 0 4 1 4 3" },
];

const pipeline = [
  { label: "WeatherAgent", desc: "Open-Meteo live GHI/DNI/DHI", color: "text-cyan-300" },
  { label: "SolarIrradianceAgent", desc: "Erbs decomposition → DNI/DHI", color: "text-amber-300" },
  { label: "CloudRiskAgent", desc: "P(cloud drop) per hour", color: "text-purple-300" },
  { label: "GenerationTimelineAgent", desc: "pvlib → MW per hour", color: "text-emerald-300" },
  { label: "DSMAgent", desc: "deviation risk + dynamic risk", color: "text-orange-300" },
  { label: "OrchestratorAgent", desc: "trace assembly + output", color: "text-blue-300" },
];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] relative animate-fade-up">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="text-center max-w-2xl relative z-10">
        <svg viewBox="0 0 120 120" className="w-24 h-24 mx-auto mb-8 animate-float" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="sunCore" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="60%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </radialGradient>
            <filter id="sunShadow">
              <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#f59e0b" floodOpacity="0.4" />
            </filter>
          </defs>
          <circle cx="60" cy="60" r="45" fill="#f59e0b" opacity="0.1">
            <animate attributeName="r" values="42;48;42" dur="4s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="60" r="30" fill="url(#sunCore)" filter="url(#sunShadow)" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
            <line
              key={i}
              x1={60 + Math.cos(a * Math.PI / 180) * 35}
              y1={60 + Math.sin(a * Math.PI / 180) * 35}
              x2={60 + Math.cos(a * Math.PI / 180) * 48}
              y2={60 + Math.sin(a * Math.PI / 180) * 48}
              stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" opacity="0.7"
            />
          ))}
        </svg>

        <h1 className="text-5xl font-bold text-white mb-3">
          Surya<span className="text-gradient">Grid</span> AI
        </h1>
        <p className="text-xl text-white/60 mb-3">Real-Data Solar Forecasting & DSM Risk Engine</p>
        <p className="text-sm text-white/35 mb-4 max-w-md mx-auto leading-relaxed">
          Phase 1.5 · Real weather (Open-Meteo), NLR NSRDB historical, Kaggle-trained ML forecasting,
          an advanced configurable DSM engine, 344 Bengaluru substations, and a fully sourced
          multi-agent pipeline with pvlib physics.
        </p>

        {/* Pipeline diagram */}
        <div className="glass-card p-4 mb-8 max-w-2xl mx-auto">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-3">Substation-Driven Agent Pipeline</div>
          <div className="flex flex-col gap-2">
            {pipeline.map((stage, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
                  {i + 1}
                </div>
                <div className="text-left flex-1">
                  <span className={`text-sm font-medium ${stage.color}`}>{stage.label}</span>
                  <span className="text-white/30 text-xs ml-2">{stage.desc}</span>
                </div>
                {i < pipeline.length - 1 && (
                  <svg className="w-3 h-3 text-white/10 absolute" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>

        <Link href="/dashboard" className="btn-primary text-base px-8 py-3.5">
          Open Dashboard
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        </Link>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-14 max-w-4xl w-full relative z-10">
        {features.map((f, i) => (
          <div key={i} className="glass-card glass-hover p-5 text-left">
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${f.color} flex items-center justify-center shadow-lg mb-3`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
                <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
              </svg>
            </div>
            <div className="font-semibold text-white">{f.title}</div>
            <div className="text-sm text-white/40 mt-1 leading-relaxed">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
