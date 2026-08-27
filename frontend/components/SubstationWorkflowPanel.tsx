"use client";
// SubstationWorkflowPanel
//
// Pick a substation from the dropdown -> the whole agent workflow runs on the backend
// (weather -> solar -> cloud -> generation timeline -> DSM) and the result is shown
// verbatim: the substation context, the agent trace, the generation timeline, and an
// honest DSM forecast. Nothing is fabricated here - missing real fields (capacity_mva,
// voltage) are shown as "not available" and their DSM calculations are listed as blocked.

import { useEffect, useState } from "react";
import { getSubstationCatalog, orchestrateSubstation } from "@/lib/api";
import { HowItWorks, FormulaCard, FormulaGrid, ProvenanceNote } from "./InfoSection";

type CatalogRow = {
  substation_id: string;
  display_label: string;
  voltage_kv: number | null;
  latitude: number | null;
  longitude: number | null;
  reliability_score: number | null;
};

function Chip({ label }: { label: string }) {
  const bad = label === "NOT_AVAILABLE" || label === "NEEDS_OFFICIAL_SOURCE";
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border ${
        bad
          ? "bg-orange-500/10 text-orange-300 border-orange-500/30"
          : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      }`}
    >
      {label}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold ${accent || "text-white"}`}>
        {value === null || value === undefined ? "—" : String(value)}
      </div>
    </div>
  );
}

export default function SubstationWorkflowPanel() {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [form, setForm] = useState({
    site_capacity_mw: 50,
    scheduled_generation_mw: 20,
    forecast_horizon_hours: 12,
    use_live_weather: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await getSubstationCatalog(1000);
        const rows: CatalogRow[] = c.substations || [];
        setCatalog(rows);
        if (rows.length) setSelected(rows[0].substation_id);
      } catch (e: any) {
        setError(e?.message || "Failed to load substation catalog");
      }
    })();
  }, []);

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const r = await orchestrateSubstation({
        substation_id: selected,
        site_capacity_mw: form.site_capacity_mw || null,
        scheduled_generation_mw: form.scheduled_generation_mw || null,
        forecast_horizon_hours: form.forecast_horizon_hours,
        use_live_weather: form.use_live_weather,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || "Workflow failed");
      setResult(null);
    }
    setBusy(false);
  };

  const sub = result?.substation;
  const dsm = result?.dsm_forecast;
  const summary = result?.generation_summary;
  const trace: any[] = result?.workflow?.agent_trace || [];
  const timeline: any[] = result?.generation_timeline || [];

  return (
    <div className="glass-card p-5 mb-6">
      <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-1">
        Substation-Driven Agent Workflow
      </div>
      <p className="text-white/40 text-xs mb-4">
        Select a substation — its real OpenStreetMap context flows through weather → solar →
        cloud → generation → DSM. Generation is ESTIMATED from irradiance; missing fields are
        never fabricated.
      </p>

      <HowItWorks
        title="How the substation-driven workflow works"
        subtitle="Each substation's real OSM context flows through 6 deterministic agents"
        steps={[
          { step: "SubstationContext", detail: "Loads real OpenStreetMap data (lat, lon, voltage) from the 344-substation parquet catalog. Missing fields (capacity_mva is 100% null in OSM) are marked NOT_AVAILABLE — never fabricated." },
          { step: "WeatherAgent", detail: "Fetches live GHI/DNI/DHI, temperature, and cloud cover from Open-Meteo for the substation's coordinates." },
          { step: "SolarIrradianceAgent", detail: "Erbs decomposition (GHI → DNI/DHI), solar position via NREL SPA, POA transposition to the panel tilt/azimuth." },
          { step: "CloudRiskAgent", detail: "Computes per-hour probability of cloud-induced generation drop from cloud cover and clear-sky ratio." },
          { step: "GenerationTimelineAgent", detail: "pvlib physics: Faiman cell temp → PVWatts DC → inverter AC. Output is per-hour estimated MW, labelled ESTIMATED_FROM_REAL." },
          { step: "DSMAgent", detail: "Compares estimated generation against scheduled MW using the interval-normalized deviation formula, classifies the band, and computes the dynamic risk score." },
        ]}
      />

      <FormulaGrid title="Formulas used in this workflow">
        <FormulaCard
          label="Substation reliability score"
          formula="reliability = 0.6 − 0.1 × (missing field count)"
          variables={[
            { name: "missing field count", desc: "lat, lon, voltage_kv, capacity_mva — count of null fields in the OSM record" },
          ]}
          source="MODEL_LEARNED"
          sourceUrl="/locations"
        />
        <FormulaCard
          label="Irradiance closure (verified)"
          formula="GHI = DNI · cos(θz) + DHI"
          variables={[
            { name: "θz", desc: "Solar zenith angle from NREL SPA" },
            { name: "DNI, DHI", desc: "Direct and diffuse irradiance (Erbs decomposition if only GHI available)" },
          ]}
          source="OFFICIAL_SOURCE · pvlib"
          sourceUrl="https://pvlib-python.readthedocs.io/"
        />
        <FormulaCard
          label="PVWatts DC power"
          formula="P_dc = pvwatts_dc(poa, T_cell, P_dc0, γ_pdc)"
          variables={[
            { name: "poa", desc: "Plane-of-array irradiance (W/m²)" },
            { name: "T_cell", desc: "Cell temperature from Faiman model (°C)" },
            { name: "P_dc0", desc: "Nameplate capacity = capacity_mw × 10⁶ (W)" },
            { name: "γ_pdc", desc: "Temperature coefficient = −0.0035 /°C (crystalline Si default)" },
          ]}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="DSM deviation (interval-normalized)"
          formula="dev_pct = (|actual − scheduled| / Δt_hours) × block_hours / denominator × 100"
          variables={[
            { name: "Δt_hours", desc: "Evaluation interval in hours" },
            { name: "block_hours", desc: "Time block duration for the DSM profile" },
            { name: "denominator", desc: "available_capacity (CERC 6(2)(a)) or scheduled (simple mode)" },
          ]}
          source="USER_CONFIGURABLE · KERC framework"
        />
        <FormulaCard
          label="Dynamic risk score"
          formula="score = 0.6 × dev_pct + 0.4 × (1 − pv_score) × 100,  clamped [0, 100]"
          variables={[
            { name: "dev_pct", desc: "DSM deviation percentage (above)" },
            { name: "pv_score", desc: "PV health/confidence score [0, 1]" },
            { name: "0.6 / 0.4", desc: "Deviation weight / PV-health weight (fixed project constants)" },
          ]}
          source="FALLBACK_DEFAULT"
        />
        <FormulaCard
          label="Haversine distance (substation matching)"
          formula="d = 2·R·arcsin(√(sin²(Δφ/2) + cos(φ₁)·cos(φ₂)·sin²(Δλ/2)))"
          variables={[
            { name: "φ₁, φ₂", desc: "Latitudes of the two points (radians)" },
            { name: "Δλ, Δφ", desc: "Longitude / latitude differences" },
            { name: "R", desc: "Earth radius = 6,371 km" },
          ]}
          source="OFFICIAL_SOURCE"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="ESTIMATED_FROM_REAL"
        note="Substation coordinates and voltage are REAL_BENGALURU from OpenStreetMap. Generation is estimated from real irradiance via pvlib physics. Capacity is NOT_AVAILABLE in OSM and must be user-supplied."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="md:col-span-2">
          <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">
            Substation ({catalog.length} available)
          </label>
          <select
            className="input-field"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {catalog.map((s) => (
              <option key={s.substation_id} value={s.substation_id} className="bg-slate-800">
                {s.display_label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">
            Plant capacity (MW)
          </label>
          <input
            type="number"
            step="any"
            className="input-field"
            value={form.site_capacity_mw}
            onChange={(e) => setForm({ ...form, site_capacity_mw: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">
            Scheduled gen (MW)
          </label>
          <input
            type="number"
            step="any"
            className="input-field"
            value={form.scheduled_generation_mw}
            onChange={(e) =>
              setForm({ ...form, scheduled_generation_mw: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">
            Horizon (hours)
          </label>
          <input
            type="number"
            className="input-field"
            value={form.forecast_horizon_hours}
            onChange={(e) =>
              setForm({ ...form, forecast_horizon_hours: parseInt(e.target.value) || 12 })
            }
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60 mt-5">
          <input
            type="checkbox"
            checked={form.use_live_weather}
            onChange={(e) => setForm({ ...form, use_live_weather: e.target.checked })}
          />
          Live weather (Open-Meteo)
        </label>
      </div>

      <button className="btn-primary" disabled={busy || !selected} onClick={run}>
        {busy ? "Running workflow…" : "Run Agent Workflow"}
      </button>
      {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

      {result && sub && (
        <div className="mt-5 space-y-5">
          {/* Substation context */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-semibold text-white">{sub.display_label}</div>
              <div className="flex gap-2 flex-wrap">
                <Chip label={sub.source_status} />
                <Chip label={`capacity: ${sub.capacity_status}`} />
                <Chip label={`voltage: ${sub.voltage_status}`} />
              </div>
            </div>
            <div className="text-xs text-white/40 mt-2 font-mono">
              {sub.latitude?.toFixed?.(4)}, {sub.longitude?.toFixed?.(4)} · voltage:{" "}
              {sub.voltage_kv ?? "unknown"} kV · capacity_mva: {sub.capacity_mva ?? "unavailable"}
            </div>
            {sub.missing_fields?.length > 0 && (
              <div className="text-xs text-orange-300/80 mt-1">
                missing (not fabricated): {sub.missing_fields.join(", ")}
              </div>
            )}
          </div>

          {/* Agent trace */}
          <div>
            <div className="eyebrow mb-2">Agent workflow trace</div>
            <div className="space-y-1">
              {trace.map((t) => (
                <div key={t.step} className="flex items-start gap-3 text-sm">
                  <span className="text-white/30 font-mono text-xs mt-0.5">#{t.step}</span>
                  <span className="text-white/80 font-medium min-w-[180px]">{t.agent}</span>
                  <span className="text-white/40 flex-1">{t.action}</span>
                  <Chip label={t.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Generation summary */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Peak est. gen (MW)" value={summary.peak_estimated_generation_mw} />
              <Stat label="Total est. energy (MWh)" value={summary.total_estimated_energy_mwh} />
              <Stat label="Daylight intervals" value={summary.daylight_intervals} />
              <Stat label="Generation type" value="ESTIMATED" accent="text-orange-300" />
            </div>
          )}

          {/* DSM forecast */}
          {dsm && (
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-white/70 uppercase tracking-wider">
                  DSM forecast (framework-only)
                </div>
                <Chip label={dsm.emits_rupee_values ? "RUPEES" : "NO RUPEE CHARGE"} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <Stat label="Deviation %" value={dsm.deviation_percent} />
                <Stat label="Band" value={dsm.deviation_band} />
                <Stat
                  label="Breach risk"
                  value={
                    dsm.breach_risk?.prediction_value?.breach_risk ??
                    dsm.breach_risk?.status ??
                    "—"
                  }
                />
                <Stat label="Capacity status" value={dsm.capacity_status} accent="text-orange-300" />
              </div>

              {/* Risk level + action */}
              {dsm.risk_level && (
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                    dsm.risk_level === "CRITICAL" ? "bg-red-500/10 text-red-300 border-red-500/30" :
                    dsm.risk_level === "HIGH" ? "bg-orange-500/10 text-orange-300 border-orange-500/30" :
                    dsm.risk_level === "MODERATE" ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/30" :
                    "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  }`}>
                    {dsm.risk_level}
                  </span>
                  <span className="text-xs text-white/50">{dsm.risk_action || dsm.action || "—"}</span>
                  {dsm.penalty_slab && (
                    <span className="text-xs text-amber-300/80 font-mono">
                      Slab: {dsm.penalty_slab} · ₹{dsm.rate_inr_per_kwh}/kWh
                    </span>
                  )}
                </div>
              )}
              {dsm.blocked_calculations?.length > 0 && (
                <div className="text-xs text-white/50">
                  <span className="text-white/40 uppercase tracking-wider">Blocked calculations: </span>
                  {dsm.blocked_calculations.map((b: any) => b.calculation).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Timeline (compact) */}
          {timeline.length > 0 && (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/80">
                  <tr className="text-left text-white/40 border-b border-white/10">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">GHI (W/m²)</th>
                    <th className="py-2 pr-3">Est. gen (MW)</th>
                    <th className="py-2 pr-3">Cloud-drop risk</th>
                    <th className="py-2 pr-3">Substation</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((r, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-1.5 pr-3 text-white/60 font-mono text-xs">
                        {String(r.timestamp).replace("T", " ").slice(5, 16)}
                      </td>
                      <td className="py-1.5 pr-3 text-white/70">{r.forecast_ghi_wm2 ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-white/70">{r.estimated_generation_mw ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-white/50">
                        {r.cloud_drop_risk ? `${(r.cloud_drop_risk.probability * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-white/30 font-mono text-xs">{r.substation_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Limitations */}
          {result.limitations?.length > 0 && (
            <div className="text-xs text-white/50 bg-white/5 rounded-lg p-3">
              <div className="text-white/40 uppercase tracking-wider mb-1">Honest limitations</div>
              <ul className="list-disc list-inside space-y-0.5">
                {result.limitations.map((l: string, i: number) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
