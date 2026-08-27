"use client";
import { useEffect, useState } from "react";
import { advancedDsmCheck, API_BASE, getRuleProfiles, probeBackend } from "@/lib/api";
import OfflineBanner from "@/components/OfflineBanner";
import SubstationWorkflowPanel from "@/components/SubstationWorkflowPanel";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";

function StatusChip({ status }: { status: string }) {
  const official = status === "OFFICIAL_SOURCE";
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${
        official
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
          : "bg-orange-500/10 text-orange-300 border-orange-500/30"
      }`}
    >
      {status}
    </span>
  );
}

export default function DSMPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    scheduled_generation_mw: 20,
    predicted_generation_mw: 17,
    actual_generation_mw: "" as string | number,
    installed_capacity_mw: 50,
    interval_hours: 1,
  });

  useEffect(() => {
    (async () => {
      const p = await probeBackend();
      setOnline(p.online);
      if (p.online) {
        try { setProfiles(await getRuleProfiles()); } catch { /* */ }
      }
    })();
  }, []);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await advancedDsmCheck({
        scheduled_generation_mw: form.scheduled_generation_mw,
        predicted_generation_mw: form.predicted_generation_mw,
        actual_generation_mw: form.actual_generation_mw === "" ? undefined : Number(form.actual_generation_mw),
        installed_capacity_mw: form.installed_capacity_mw,
        interval_hours: form.interval_hours,
      });
      setResult(r);
    } catch (e: any) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  const dr = result?.dynamic_risk;

  return (
    <div className="max-w-6xl mx-auto animate-fade-up">
      <h1 className="text-3xl font-bold text-white">Advanced DSM Engine</h1>
      <p className="text-white/40 mt-1 mb-6">
        Deviation Settlement Mechanism analysis with interval-normalized deviation,
        dynamic risk scoring, and configurable KERC/CERC rule profiles.
      </p>

      <HowItWorks
        title="How the DSM Engine works"
        subtitle="From scheduled vs actual generation to deviation %, penalty, and dynamic risk"
        steps={[
          { step: "Input: scheduled vs predicted/actual MW", detail: "The DSM engine compares the scheduled (declared) generation against the actual (or predicted) generation, with the plant's installed capacity as the denominator." },
          { step: "Compute interval-normalized deviation", detail: "deviation_pct = (|actual − scheduled| / Δt_hours) × block_hours / denominator × 100. When Δt = block length, this reduces to the classic per-block percentage." },
          { step: "Determine direction", detail: "WITHIN_LIMIT if deviation ≤ band %, UNDER_INJECTION if actual < scheduled beyond band, OVER_INJECTION if actual > scheduled beyond band." },
          { step: "Apply slab charges (if configured)", detail: "Chargeable energy per slab = (pct_in_slab/100) × capacity × interval_hours. DSM charge = Σ chargeable_kWh × slab_rate. KERC solar band: ±5%, escalating slabs." },
          { step: "Compute dynamic risk score", detail: "0.6 × deviation_pct + 0.4 × (1 − pv_score) × 100, clamped to [0, 100]. Weight on deviation (0.6) dominates; PV health is secondary." },
          { step: "Fuzzy risk classification", detail: "The fuzzy risk agent combines breach ratio, forecast confidence, and cloud volatility into LOW/MEDIUM/HIGH/CRITICAL bands via triangular membership functions." },
        ]}
      />

      <SourceBadges sources={[
        { name: "DSM Engine", label: "interval-normalized deviation" },
        { name: "Dynamic Risk", label: "w_dev=0.6, w_pv=0.4" },
        { name: "KERC", label: "±5% solar band" },
        { name: "Fuzzy Risk", label: "triangular MFs" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="DSM deviation (interval-normalized %)"
          formula={"deviation_pct = (|actual − scheduled| / Δt_h)\n             × block_h / denom × 100"}
          variables={[
            { name: "actual, scheduled", desc: "Generation in MW (actual or predicted vs declared schedule)" },
            { name: "Δt_h", desc: "Evaluation interval in hours (1 for hourly, 0.25 for 15-min)" },
            { name: "block_h", desc: "DSM time-block length = profile.time_block_minutes / 60" },
            { name: "denom", desc: "available_capacity (CERC) or scheduled (simple mode), in MW" },
          ]}
          source="USER_CONFIGURABLE"
          sourceUrl="/docs/FORMULA_SOURCES.md#9-deviation--dsm"
        />
        <FormulaCard
          label="Dynamic risk score"
          formula={"dev_pct = |actual − scheduled| / scheduled × 100\npv_risk = (1 − clamp(pv_score, 0, 1)) × 100\nraw = 0.6 × dev_pct + 0.4 × pv_risk\nscore = clamp(raw, 0, 100)"}
          variables={[
            { name: "w_dev", desc: "Weight on deviation (default 0.6 — deviation dominates)" },
            { name: "w_pv", desc: "Weight on PV health risk (default 0.4)" },
            { name: "pv_score", desc: "PV health: min(1, measured / predicted_generation_mw)" },
          ]}
          source="FALLBACK_DEFAULT"
          sourceUrl="/docs/FORMULA_SOURCES.md#11-dynamic-risk-score"
        />
        <FormulaCard
          label="DSM charge (slab-based)"
          formula={"chargeable_kWh_slab = (pct_in_slab / 100)\n  × capacity_mw × 1000 × interval_hours\ndsm_charge = Σ chargeable_kWh_slab × slab_rate"}
          variables={[
            { name: "pct_in_slab", desc: "% of deviation falling in each slab band" },
            { name: "slab_rate", desc: "₹/kWh for that slab (KERC: 2/4/6 INR)" },
          ]}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Fuzzy risk classification"
          formula={"risk = f(breach_ratio, confidence, cloud_volatility)\n→ LOW / MEDIUM / HIGH / CRITICAL\n# Triangular membership functions"}
          variables={[
            { name: "breach_ratio", desc: "deviation_pct / band_percent" },
            { name: "confidence", desc: "Forecast confidence (0.4–0.99)" },
            { name: "cloud_volatility", desc: "Hourly cloud cover variance" },
          ]}
          source="FALLBACK_DEFAULT"
        />
        <FormulaCard
          label="Irradiance closure (data quality)"
          formula={"GHI = DNI · cos(θz) + DHI\n# Verified on NSRDB Himawari 2019\n# MAE 0.4 W/m² (0.13%)"}
          source="OFFICIAL_SOURCE · pvlib"
          sourceUrl="/docs/FORMULA_SOURCES.md#1-irradiance-decomposition"
        />
        <FormulaCard
          label="KERC solar DSM band"
          formula={"band = ±5% of available capacity\nslab_1 = 0–15% beyond band → ₹2/kWh\nslab_2 = 15–25% → ₹4/kWh\nslab_3 = >25% → ₹6/kWh"}
          source="USER_CONFIGURABLE · KERC"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="USER_CONFIGURABLE + FALLBACK_DEFAULT"
        note="Deviation formula and slab rates are configurable per rule profile. Dynamic risk uses fixed w_dev=0.6/w_pv=0.4 defaults. No rupee charge is computed without an official tariff."
      />

      {online === false && <OfflineBanner base={API_BASE} />}
      {online === null && <div className="glass-card p-6 text-white/50">Checking backend…</div>}

      {profiles.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">DSM Rule Profiles ({profiles.length})</div>
          <div className="space-y-3">
            {profiles.map((p: any) => (
              <div key={p.id} className="border border-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white/90 text-sm">{p.name}</span>
                  {p.regulator && <span className="text-[10px] text-white/40">· {p.regulator}</span>}
                  <span className="text-[10px] text-white/30 ml-auto">±{p.tolerance_band_percent}% band</span>
                </div>
                {p.bands?.length > 0 && (
                  <table className="w-full text-xs mt-2">
                    <tbody>
                      {p.bands.map((b: any, i: number) => (
                        <tr key={i}>
                          <td className="py-1 pr-3 text-white/50">{b.lower_pct}% → {b.upper_pct}%</td>
                          <td className="py-1 pr-3 text-amber-300 font-mono">₹{b.rate_inr_per_kwh}/kWh</td>
                          <td className="py-1 pr-3 text-white/40 font-mono text-xs">{b.source_reference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-6 mb-6">
        <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">Advanced DSM Check</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Scheduled (MW)</label>
            <input type="number" step="any" className="input-field" value={form.scheduled_generation_mw}
              onChange={(e) => setForm({ ...form, scheduled_generation_mw: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Predicted (MW)</label>
            <input type="number" step="any" className="input-field" value={form.predicted_generation_mw}
              onChange={(e) => setForm({ ...form, predicted_generation_mw: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Actual (MW, optional)</label>
            <input type="number" step="any" className="input-field" value={form.actual_generation_mw}
              onChange={(e) => setForm({ ...form, actual_generation_mw: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Capacity (MW)</label>
            <input type="number" step="any" className="input-field" value={form.installed_capacity_mw}
              onChange={(e) => setForm({ ...form, installed_capacity_mw: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Interval (h)</label>
            <input type="number" step="any" className="input-field" value={form.interval_hours}
              onChange={(e) => setForm({ ...form, interval_hours: parseFloat(e.target.value) || 1 })} />
          </div>
        </div>
        <button onClick={run} disabled={loading} className="btn-primary mt-4">
          {loading ? "Computing…" : "Run DSM Check"}
        </button>
      </div>

      {result && !result.error && (
        <div className="glass-card p-6 mb-6">
          <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">DSM Result</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Deviation</div>
              <div className="text-2xl font-bold text-white">{result.deviation_percent?.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Direction</div>
              <div className="text-lg font-bold text-white/80">{result.deviation_direction || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Penalty Status</div>
              <div className={`text-lg font-bold ${result.penalty_status === "PENALTY_RISK" ? "text-red-400" : "text-emerald-400"}`}>
                {result.penalty_status || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Est. Charge</div>
              <div className="text-lg font-bold text-white/80">
                {result.estimated_penalty_cost > 0 ? `₹${result.estimated_penalty_cost.toLocaleString()}` : "—"}
              </div>
            </div>
          </div>

          {/* Risk classification */}
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 mt-4">
            <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider mb-3">DSM Risk Classification</div>
            <div className="flex items-center gap-4 mb-4">
              <div className={`text-3xl font-bold ${
                result.risk_level === "CRITICAL" ? "text-red-400" :
                result.risk_level === "HIGH" ? "text-orange-400" :
                result.risk_level === "MODERATE" ? "text-yellow-400" : "text-emerald-400"
              }`}>
                {result.risk_level || "—"}
              </div>
              <div className="text-sm text-white/50">
                <div className="font-medium text-white/70">{result.risk_action || "—"}</div>
                {result.penalty_slab && (
                  <div className="mt-1">
                    Slab: <span className="text-amber-300 font-mono">{result.penalty_slab}</span>
                    {" · "}
                    Rate: <span className="text-amber-300 font-mono">₹{result.rate_inr_per_kwh}/kWh</span>
                  </div>
                )}
              </div>
            </div>

            {/* Slab breakdown table */}
            {result.slab_breakdown && result.slab_breakdown.length > 0 && (
              <table className="w-full text-xs mb-4">
                <thead>
                  <tr className="text-left text-white/40 border-b border-white/10">
                    <th className="py-2 pr-3">Slab</th>
                    <th className="py-2 pr-3">Rate (₹/kWh)</th>
                    <th className="py-2 pr-3">Energy (MWh)</th>
                    <th className="py-2 pr-3">Charge (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.slab_breakdown.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-1.5 pr-3 text-white/70 font-mono">{s.slab_percent}</td>
                      <td className="py-1.5 pr-3 text-amber-300 font-mono">₹{s.rate_inr_per_kwh}</td>
                      <td className="py-1.5 pr-3 text-white/60 font-mono">{s.energy_mwh}</td>
                      <td className="py-1.5 pr-3 text-white/80 font-mono">₹{s.charge_inr?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Dynamic risk score */}
            {dr && (
              <div className="border-t border-white/10 pt-3 mt-3">
                <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2">Dynamic Risk Score</div>
                <div className="flex items-center gap-4 mb-2">
                  <div className={`text-3xl font-bold ${
                    dr.dynamic_risk_score >= 72 ? "text-red-400" :
                    dr.dynamic_risk_score >= 41 ? "text-orange-400" :
                    dr.dynamic_risk_score >= 16 ? "text-yellow-400" : "text-emerald-400"
                  }`}>
                    {dr.dynamic_risk_score}
                  </div>
                  <div className="text-xs text-white/40">
                    <div>deviation_pct: <span className="text-white/70 font-mono">{dr.deviation_pct}</span></div>
                    <div>pv_risk_component: <span className="text-white/70 font-mono">{dr.pv_risk_component}</span></div>
                  </div>
                </div>
                <div className="text-xs text-white/40 font-mono mb-2">
                  score = 0.6 × {dr.deviation_pct} + 0.4 × {dr.pv_risk_component} = {dr.dynamic_risk_score}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${
                    dr.risk_level === "CRITICAL" ? "text-red-400" :
                    dr.risk_level === "HIGH" ? "text-orange-400" :
                    dr.risk_level === "MODERATE" ? "text-yellow-400" : "text-emerald-400"
                  }`}>{dr.risk_level}</span>
                  <span className="text-xs text-white/50">·</span>
                  <span className="text-xs text-white/60">{dr.action}</span>
                </div>
              </div>
            )}
          </div>

          {/* Static classification reference table */}
          <div className="mt-4">
            <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2">
              DSM Penalty & Risk Classification Table
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 pr-3">Deviation</th>
                  <th className="py-2 pr-3">Penalty Rate</th>
                  <th className="py-2 pr-3">Risk Level</th>
                  <th className="py-2 pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-white/70 font-mono">0–5%</td>
                  <td className="py-2 pr-3 text-emerald-300 font-mono">No penalty</td>
                  <td className="py-2 pr-3"><span className="text-emerald-300 font-bold">NORMAL</span></td>
                  <td className="py-2 pr-3 text-white/50">No action — within ±5% tolerance band</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-white/70 font-mono">5–10%</td>
                  <td className="py-2 pr-3 text-yellow-300 font-mono">₹2/kWh</td>
                  <td className="py-2 pr-3"><span className="text-yellow-300 font-bold">MODERATE</span></td>
                  <td className="py-2 pr-3 text-white/50">Monitor — deviation under 10%</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-white/70 font-mono">10–15%</td>
                  <td className="py-2 pr-3 text-orange-300 font-mono">₹4/kWh</td>
                  <td className="py-2 pr-3"><span className="text-orange-300 font-bold">HIGH</span></td>
                  <td className="py-2 pr-3 text-white/50">Investigate — deviation exceeds 10%</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-3 text-white/70 font-mono">{">15%"}</td>
                  <td className="py-2 pr-3 text-red-300 font-mono">₹6/kWh</td>
                  <td className="py-2 pr-3"><span className="text-red-300 font-bold">CRITICAL</span></td>
                  <td className="py-2 pr-3 text-white/50">Manual inspection needed — deviation exceeds 15%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {result.calculation_trace && result.calculation_trace.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2">Calculation Trace</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.calculation_trace.map((t: any, i: number) => (
                  <div key={i} className="text-xs text-white/50 font-mono">
                    {t.step}: <span className="text-white/70">{t.formula}</span>
                    {t.value != null && <span className="text-cyan-300"> = {typeof t.value === "number" ? t.value.toFixed(4) : t.value}</span>}
                    {t.classification && <span className="text-white/30 ml-2">[{t.classification}]</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result?.error && <div className="mt-4 text-red-300 text-sm">{result.error}</div>}
    </div>
  );
}
