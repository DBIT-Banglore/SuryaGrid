"use client";
import { useEffect, useState } from "react";
import { getRLRuns, trainRL } from "@/lib/api";
import { LOCATIONS } from "@/lib/locations";
import MetricCard from "@/components/cards/MetricCard";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import type { TrainingRun } from "@/lib/types";

export default function RLPage() {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState(0);
  const [episodes, setEpisodes] = useState(200);
  const [daysBack, setDaysBack] = useState(90);
  const [years, setYears] = useState(0);
  const [useReal, setUseReal] = useState(true);
  const [lastRun, setLastRun] = useState<any>(null);

  const refresh = () => getRLRuns().then(setRuns).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const train = async () => {
    setLoading(true);
    try {
      const l = LOCATIONS[loc];
      const res = await trainRL({
        episodes,
        use_real_data: useReal,
        latitude: l.latitude,
        longitude: l.longitude,
        capacity_mw: l.capacity_mw,
        days_back: daysBack,
        years,
      });
      setLastRun(res);
      await refresh();
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Reinforcement Learning Lab</h1>
        <p className="text-white/40 mt-1">
          Train the reward policy on real historical irradiance (Open-Meteo archive → pvlib digital twin)
        </p>
      </div>

      <HowItWorks
        title="How the RL policy training works"
        subtitle="REINFORCE policy gradient on a pvlib digital twin of the plant"
        steps={[
          { step: "Fetch real historical weather", detail: "Open-Meteo Archive API provides past GHI, DNI, DHI, cloud cover, temperature for the site coordinates. Days (days_back) or Years (years) of data are fetched." },
          { step: "Build pvlib digital twin", detail: "The historical irradiance is converted to hourly generation using the same pvlib physics pipeline (Erbs → POA → Faiman → PVWatts → inverter). This becomes the 'ground truth' production curve." },
          { step: "Define the RL environment", detail: "State = {hour, GHI, cloud, forecast_confidence, current_deviation}. Action = adjust {penalty_rate, bonus_rate, discount_rate} within bounds. Reward = Σ(bonus − penalty) − α × variance(deviation)." },
          { step: "REINFORCE policy gradient", detail: "A policy network π(a|s) is trained to maximize expected discounted return G_t. The gradient is ∇θ J = E[∇θ log π(a|s) × G_t]. Training runs for the specified number of episodes." },
          { step: "Output: learned rate policy", detail: "The trained policy outputs optimized penalty/bonus/discount rates that minimize penalty exposure while maintaining surplus. These rates feed into the Settlement Engine." },
        ]}
      />

      <SourceBadges sources={[
        { name: "Open-Meteo Archive", label: "historical irradiance" },
        { name: "pvlib", label: "digital twin" },
        { name: "REINFORCE", label: "policy gradient" },
        { name: "gymnasium", label: "RL environment" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="RL reward function"
          formula={"reward_t = bonus_t − penalty_t\nreturn G_t = Σ_{k=0}^{T} γ^k × reward_{t+k}\n# γ = discount rate (0.99 default)"}
          variables={[
            { name: "bonus_t", desc: "Surplus reward at hour t (₹/kWh × surplus_kWh)" },
            { name: "penalty_t", desc: "Shortfall charge at hour t (₹/kWh × deficit_kWh)" },
          ]}
          source="MODEL_LEARNED"
        />
        <FormulaCard
          label="REINFORCE policy gradient"
          formula={"∇θ J(θ) = E_{τ ~ π_θ}\n  [ Σ_{t=0}^{T} ∇θ log π_θ(a_t | s_t) × G_t ]\n# θ ← θ + α × ∇θ J"}
          variables={[
            { name: "π_θ(a|s)", desc: "Policy network (action probabilities given state)" },
            { name: "α", desc: "Learning rate" },
            { name: "G_t", desc: "Discounted return from time t" },
          ]}
          source="OFFICIAL_SOURCE · REINFORCE"
        />
        <FormulaCard
          label="Policy state space"
          formula={"state = {\n  hour_of_day,      # 0-23\n  ghi_w_m2,         # current irradiance\n  cloud_cover_pct,  # cloud conditions\n  forecast_conf,    # 0.4–0.99\n  current_dev_pct   # |actual − scheduled| / scheduled\n}"}
          source="MODEL_LEARNED"
        />
        <FormulaCard
          label="Policy action space"
          formula={"action = {\n  penalty_rate,   # ₹/kWh for under-production\n  bonus_rate,     # ₹/kWh for over-production\n  discount_rate   # ₹/kWh consumer credit\n}\n# bounds: penalty [1, 10], bonus [0, 5], discount [0, 3]"}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Hourly production (digital twin)"
          formula={"Erbs(ghi, zenith) → DNI, DHI\nPOA = get_total_irradiance(...)\nDC = pvwatts_dc(poa, t_cell, pdc0, γ)\nAC = pvwatts_inverter(DC, pdc0, η=0.96)\nprod_kWh = (AC / 1e6) × capacity_mw × Δt"}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="Confidence score"
          formula={"confidence = clamp(1 − 0.35 × cloud_fraction, 0.4, 0.99)\n# Used as a state feature and for hybrid forecast blending"}
          source="FALLBACK_DEFAULT"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="MODEL_LEARNED"
        note="The RL policy is trained on real historical irradiance data via a pvlib digital twin. Rates are optimized, not declared by a regulator — they are decision-support, not binding tariffs."
      />

      <div className="glass-card p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="eyebrow block mb-1">Site</label>
            <select className="input-field" value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
              {LOCATIONS.map((l, i) => (
                <option key={i} value={i} className="bg-slate-800">{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="eyebrow block mb-1">Episodes</label>
            <input type="number" className="input-field" value={episodes} onChange={(e) => setEpisodes(Number(e.target.value) || 100)} />
          </div>
          <div>
            <label className="eyebrow block mb-1">Years (ERA5)</label>
            <input type="number" className="input-field" value={years} onChange={(e) => setYears(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label className="eyebrow block mb-1">Days (if 0 yrs)</label>
            <input type="number" className="input-field" value={daysBack} onChange={(e) => setDaysBack(Number(e.target.value) || 30)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/60 pb-2">
            <input type="checkbox" checked={useReal} onChange={(e) => setUseReal(e.target.checked)} className="accent-blue-500" />
            Real data
          </label>
          <button onClick={train} disabled={loading} className="btn-primary">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Training
              </span>
            ) : "Train Policy"}
          </button>
        </div>
        <p className="text-[11px] text-white/30 mt-3">
          Real-data training fetches genuine past weather (set Years ≥ 1 for multi-year ERA5 history),
          runs pvlib physics to build production/target curves, then optimizes penalty/bonus/discount
          rates with a REINFORCE policy gradient.
        </p>
      </div>

      {lastRun && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard title="Data Source" value={lastRun.real_days_used > 0 ? `${lastRun.real_days_used} real days` : "Synthetic"} color="green" subtitle={lastRun.data_source} />
          <MetricCard title="Best Reward" value={lastRun.best_reward.toFixed(1)} color="blue" subtitle="Top episode" />
          <MetricCard title="Penalty Rate" value={`₹${lastRun.final_rates.penalty_rate}`} color="red" subtitle="Learned" />
          <MetricCard title="Bonus Rate" value={`₹${lastRun.final_rates.bonus_rate}`} color="purple" subtitle="Learned" />
        </div>
      )}

      <div className="glass-card overflow-hidden p-0">
        <div className="px-5 py-3 border-b border-white/5 eyebrow">Training Run History</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3 text-left font-medium">When</th>
                <th className="px-5 py-3 text-left font-medium">Algorithm</th>
                <th className="px-5 py-3 text-right font-medium">Episodes</th>
                <th className="px-5 py-3 text-left font-medium">Data Source</th>
                <th className="px-5 py-3 text-right font-medium">Best Reward</th>
                <th className="px-5 py-3 text-right font-medium">Rates (P/B/D)</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="table-row">
                  <td className="px-5 py-3 text-white/60 font-mono text-xs">{r.created_at?.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-5 py-3 text-white/80">{r.algorithm}</td>
                  <td className="px-5 py-3 text-right text-white/70">{r.episodes}</td>
                  <td className="px-5 py-3 text-white/60 text-xs">{r.data_source}</td>
                  <td className="px-5 py-3 text-right font-mono text-white/80">{r.best_reward.toFixed(1)}</td>
                  <td className="px-5 py-3 text-right font-mono text-white/70">
                    {r.final_rates ? `${r.final_rates.penalty_rate}/${r.final_rates.bonus_rate}/${r.final_rates.discount_rate}` : "—"}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-white/30">No training runs yet — train a policy above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
