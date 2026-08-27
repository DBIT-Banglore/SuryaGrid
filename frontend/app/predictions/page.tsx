"use client";
import { useState } from "react";
import { predict } from "@/lib/api";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import type { PredictResult } from "@/lib/types";

const SCENARIOS = [
  { label: "Clear Sky", desc: "Optimal conditions", ghi: 950, dni: 820, dhi: 110, cloud: 5, temp: 25, accent: "from-amber-400 to-orange-500", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
  { label: "Partly Cloudy", desc: "Moderate output", ghi: 620, dni: 400, dhi: 240, cloud: 45, temp: 32, accent: "from-blue-400 to-cyan-500", icon: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" },
  { label: "Overcast", desc: "Significant losses", ghi: 300, dni: 90, dhi: 230, cloud: 80, temp: 30, accent: "from-slate-400 to-slate-500", icon: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" },
  { label: "Storm", desc: "Minimal generation", ghi: 110, dni: 20, dhi: 95, cloud: 95, temp: 28, accent: "from-purple-400 to-indigo-500", icon: "M11.412 15.655L9.75 21.75l3.745-4.012M9.257 13.5H3.75l2.659-2.849m2.048-2.194L14.25 2.25 12 10.5h8.25l-4.707 5.043" },
];

const CAPACITY = 100;
const SCHEDULED = 70;

export default function Predictions() {
  const [results, setResults] = useState<(PredictResult & { label: string; desc: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const batch = await Promise.all(
        SCENARIOS.map(async (sc) => {
          const r = await predict({
            capacity_mw: CAPACITY,
            latitude: 27.53,
            longitude: 71.91,
            ghi_w_m2: sc.ghi,
            dni_w_m2: sc.dni,
            dhi_w_m2: sc.dhi,
            cloud_cover_percent: sc.cloud,
            temperature_c: sc.temp,
            scheduled_generation_mw: SCHEDULED,
            allowed_dsm_threshold_percent: 10,
            penalty_rate_per_mwh: 12000,
          });
          return { ...r, label: sc.label, desc: sc.desc };
        })
      );
      setResults(batch);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const riskBadge = (level: string) => {
    const cls: Record<string, string> = { LOW: "badge-green", MEDIUM: "badge-yellow", HIGH: "badge-orange", CRITICAL: "badge-red" };
    return <span className={`badge ${cls[level] || "badge-green"}`}>{level}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Scenario Analysis</h1>
        <p className="text-white/40 mt-1">
          DSM outcomes across weather regimes · {CAPACITY} MW plant, {SCHEDULED} MW scheduled (pvlib physics)
        </p>
      </div>

      <HowItWorks
        title="How scenario analysis works"
        subtitle="Predefined weather scenarios → pvlib physics → DSM deviation and risk classification"
        steps={[
          { step: "Define 4 weather scenarios", detail: "Clear Sky (GHI 950, 5% cloud), Partly Cloudy (620, 45%), Overcast (300, 80%), Storm (110, 95%). Each scenario has GHI, DNI, DHI, cloud cover, and temperature values." },
          { step: "Run pvlib physics for each scenario", detail: "For each set of irradiance values, the pipeline computes: Erbs decomposition (if needed) → POA transposition → Faiman cell temp → PVWatts DC → inverter AC → predicted generation MW." },
          { step: "Compute DSM deviation", detail: "deviation_pct = (|predicted − scheduled| / Δt_h) × block_h / capacity × 100, with the 10% DSM threshold band." },
          { step: "Classify risk level", detail: "The fuzzy risk agent combines breach ratio, cloud cover, and confidence into LOW/MEDIUM/HIGH/CRITICAL bands via triangular membership functions." },
          { step: "Compare side-by-side", detail: "All four scenarios are run in parallel and displayed in a table so you can see how generation, deviation, and penalty risk change with weather conditions." },
        ]}
      />

      <SourceBadges sources={[
        { name: "pvlib", label: "GHI→DNI/DHI + POA + PVWatts" },
        { name: "DSM Engine", label: "deviation + slab charges" },
        { name: "Fuzzy Risk", label: "LOW/MEDIUM/HIGH/CRITICAL" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="PV generation (PVWatts)"
          formula={"DC = pvwatts_dc(poa, t_cell, pdc0, γ=-0.0035)\nAC = pvwatts_inverter(DC, pdc0, η=0.96)\npredicted_mw = min(AC / 1e6, capacity_mw)"}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="DSM deviation (per scenario)"
          formula={"dev_pct = (|predicted − scheduled| / Δt_h)\n         × block_h / capacity × 100\nstatus = dev_pct > threshold ? PENALTY_RISK : OK"}
          variables={[
            { name: "threshold", desc: "Configured DSM band (default 10%)" },
            { name: "capacity", desc: "Installed capacity (MW)" },
          ]}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Penalty cost estimate"
          formula={"penalty_cost = chargeable_kWh × penalty_rate\nchargeable_kWh = (dev_pct / 100) × capacity × 1000 × Δt_h"}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Fuzzy risk classification"
          formula={"inputs: breach_ratio = dev_pct / band\n         confidence = 1 − 0.35 × cloud\n         cloud_volatility\n→ triangular MFs → LOW / MEDIUM / HIGH / CRITICAL"}
          source="FALLBACK_DEFAULT"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="OFFICIAL_SOURCE + FALLBACK_DEFAULT"
        note="Generation is computed via pvlib physics (OFFICIAL_SOURCE). Risk classification uses fuzzy membership functions (FALLBACK_DEFAULT, tunable). Penalty cost is an estimate — not a regulatory charge."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {SCENARIOS.map((s, i) => (
          <div key={i} className="glass-card glass-hover p-5 text-center">
            <div className={`w-11 h-11 mx-auto mb-3 rounded-xl bg-gradient-to-br ${s.accent} flex items-center justify-center shadow-lg`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            </div>
            <div className="font-semibold text-sm text-white">{s.label}</div>
            <div className="text-[11px] text-white/40 mt-0.5">{s.ghi} W/m² · {s.cloud}% cloud</div>
          </div>
        ))}
      </div>

      <button onClick={run} disabled={loading} className="btn-primary mb-8">
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Analyzing Scenarios…
          </span>
        ) : "Run All Scenarios"}
      </button>

      {results.length > 0 && (
        <div className="glass-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Scenario</th>
                  <th className="px-5 py-3 text-right font-medium">Predicted</th>
                  <th className="px-5 py-3 text-right font-medium">Deviation</th>
                  <th className="px-5 py-3 text-center font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Penalty Cost</th>
                  <th className="px-5 py-3 text-center font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="table-row">
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">{r.label}</div>
                      <div className="text-xs text-white/35">{r.desc}</div>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-white/90">{r.predicted_generation_mw.toFixed(2)} MW</td>
                    <td className="px-5 py-4 text-right font-mono text-white/70">{r.deviation_percent.toFixed(1)}%</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`badge ${r.penalty_status === "PENALTY_RISK" ? "badge-red" : "badge-green"}`}>
                        {r.penalty_status === "PENALTY_RISK" ? "PENALTY" : "OK"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-white/80">
                      {r.estimated_penalty_cost > 0 ? `\u20B9${r.estimated_penalty_cost.toLocaleString()}` : "\u2014"}
                    </td>
                    <td className="px-5 py-4 text-center">{riskBadge(r.risk_level)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !loading && (
        <div className="glass-card text-center py-16">
          <h3 className="text-lg font-medium text-white/60">No scenarios run yet</h3>
          <p className="text-white/30 mt-1 text-sm">Run all scenarios to compare DSM outcomes side by side</p>
        </div>
      )}
    </div>
  );
}
