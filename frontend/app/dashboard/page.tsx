"use client";
import { useEffect, useState } from "react";
import SolarPanel3D from "@/components/svg/SolarPanel3D";
import RiskGauge3D from "@/components/svg/RiskGauge3D";
import MiniTimeline from "@/components/charts/MiniTimeline";
import MetricCard from "@/components/cards/MetricCard";
import OfflineBanner from "@/components/OfflineBanner";
import ModelProvenancePanel from "@/components/ModelProvenancePanel";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import { API_BASE, getTimeline, predictSite, probeBackend } from "@/lib/api";
import type { TimelineData, TimelineEntry } from "@/lib/types";

const LOCATIONS = [
  { label: "Pavagada, Karnataka", lat: 14.1, lon: 77.28, cap: 2050, regulator: "KERC/BESCOM" },
  { label: "Bhadla, Rajasthan", lat: 27.53, lon: 71.91, cap: 2245, regulator: "CERC" },
  { label: "Kurnool, Andhra Pradesh", lat: 15.68, lon: 78.28, cap: 1000, regulator: "CERC" },
  { label: "Bengaluru (Electronic City)", lat: 12.85, lon: 77.66, cap: 40, regulator: "KERC/BESCOM" },
];

export default function Dashboard() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [pred, setPred] = useState<any>(null);
  const [tl, setTl] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ latitude: 12.85, longitude: 77.66, capacity_mw: 40, scheduled_generation_mw: 30 });

  useEffect(() => {
    (async () => {
      const p = await probeBackend();
      setOnline(p.online);
      if (p.online) {
        try {
          setTl(await getTimeline("primary-site", {
            latitude: form.latitude,
            longitude: form.longitude,
            capacity_mw: form.capacity_mw,
            forecast_days: 1,
          }));
        } catch { /* offline */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await predictSite("primary-site", {
        capacity_mw: form.capacity_mw,
        latitude: form.latitude,
        longitude: form.longitude,
        ghi_w_m2: 800,
        dni_w_m2: 700,
        dhi_w_m2: 120,
        cloud_cover_percent: 10,
        temperature_c: 28,
        scheduled_generation_mw: form.scheduled_generation_mw,
      });
      setPred(r);
      const t = await getTimeline("primary-site", {
        latitude: form.latitude,
        longitude: form.longitude,
        capacity_mw: form.capacity_mw,
        forecast_days: 1,
      });
      setTl(t);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const timeline = (tl?.timeline || []).slice(0, 8);

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-white/40 mt-1">
          Real-time solar generation forecast for utility-scale PV plants in India ·
          pvlib physics + Open-Meteo live weather + trained ML model.
        </p>
      </div>

      <HowItWorks
        title="How the forecast pipeline works"
        subtitle="From weather data to predicted MW — the full agent chain"
        steps={[
          { step: "WeatherAgent fetches live irradiance from Open-Meteo", detail: "Hourly GHI, DNI, DHI, cloud cover, temperature, wind for the selected coordinates. Classified REAL_COORDINATE_BASED." },
          { step: "SolarIrradianceAgent resolves irradiance components", detail: "If the source provides GHI only, the Erbs decomposition splits it into DNI + DHI using the solar zenith angle θz." },
          { step: "CloudRiskAgent classifies cloud-drop probability", detail: "cloud_risk_classifier.pkl (HistGradientBoosting) scores P(cloud drop) per hour from cloud cover, humidity, and temperature." },
          { step: "GenerationTimelineAgent converts irradiance → MW", detail: "pvlib POA transposition → Faiman cell temp → PVWatts DC → inverter AC. Output: hourly predicted_generation_mw with a clear-sky schedule proxy." },
          { step: "DSMAgent evaluates deviation risk", detail: "Compares predicted vs scheduled MW, computes interval-normalized deviation %, and flags penalty-risk hours." },
          { step: "OrchestratorAgent assembles the result", detail: "Returns agent_trace (per-agent log) + calculation_trace (formula provenance for every number)." },
        ]}
      />

      <SourceBadges sources={[
        { name: "Open-Meteo", label: "live weather" },
        { name: "pvlib", label: "physics" },
        { name: "ML model", label: "solar_forecast_model.pkl" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="Irradiance closure"
          formula={"GHI = DNI · cos(θz) + DHI"}
          variables={[
            { name: "GHI", desc: "Global Horizontal Irradiance (W/m²)" },
            { name: "DNI", desc: "Direct Normal Irradiance (W/m²)" },
            { name: "θz", desc: "Solar zenith angle (sun-to-vertical)" },
            { name: "DHI", desc: "Diffuse Horizontal Irradiance (W/m²)" },
          ]}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="PV generation (PVWatts)"
          formula={"DC  = pvwatts_dc(poa, t_cell, pdc0, γ=-0.0035)\nAC  = pvwatts_inverter(DC, η=0.96)\nMW  = min(AC / 1e6, capacity_mw)"}
          variables={[
            { name: "poa", desc: "Plane-of-array irradiance (W/m²)" },
            { name: "t_cell", desc: "Cell temperature from Faiman model (°C)" },
            { name: "pdc0", desc: "Nameplate DC capacity (W)" },
            { name: "γ", desc: "Temperature coefficient (−0.0035 /°C, c-Si default)" },
          ]}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="DSM deviation (interval-normalized)"
          formula={"deviation_pct = (|actual − scheduled| / Δt_hours)\n               × block_hours / denominator × 100"}
          variables={[
            { name: "Δt_hours", desc: "Evaluation interval in hours" },
            { name: "block_hours", desc: "DSM time-block length (profile.time_block_minutes / 60)" },
            { name: "denominator", desc: "available_capacity (CERC) or scheduled (simple mode)" },
          ]}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Confidence score"
          formula={"confidence = clamp(1 − 0.35 · cloud_fraction, 0.4, 0.99)"}
          variables={[
            { name: "cloud_fraction", desc: "Cloud cover fraction (0–1) from weather data" },
          ]}
          source="FALLBACK_DEFAULT"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="REAL_BENGALURU + MODEL_LEARNED"
        note="Live weather from Open-Meteo at real coordinates; generation derived via pvlib physics and the trained ML irradiance model."
      />

      <div className="glass-card p-6 mb-6">
        <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">Forecast Parameters</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Latitude</label>
            <input type="number" step="any" className="input-field" value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Longitude</label>
            <input type="number" step="any" className="input-field" value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Capacity (MW)</label>
            <input type="number" step="any" className="input-field" value={form.capacity_mw}
              onChange={(e) => setForm({ ...form, capacity_mw: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Scheduled (MW)</label>
            <input type="number" step="any" className="input-field" value={form.scheduled_generation_mw}
              onChange={(e) => setForm({ ...form, scheduled_generation_mw: parseFloat(e.target.value) || 0 })} />
          </div>
          <button onClick={run} disabled={loading} className="btn-primary">
            {loading ? "Forecasting…" : "Run Forecast"}
          </button>
        </div>
        <div className="text-xs text-white/30 mt-3">
          Quick presets:{" "}
          {LOCATIONS.map((l, i) => (
            <button key={i} className="text-cyan-400 hover:text-cyan-300 underline ml-2 first:ml-0"
              onClick={() => setForm({ ...form, latitude: l.lat, longitude: l.lon, capacity_mw: l.cap, scheduled_generation_mw: Math.round(l.cap * 0.7) })}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {online === false && <OfflineBanner base={API_BASE} />}
      {err && <div className="text-red-300 text-sm mb-4">{err}</div>}

      {pred && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard title="Predicted" value={pred.predicted_generation_mw?.toFixed(2)} unit="MW" color="green" subtitle="pvlib + ML" />
            <MetricCard title="Scheduled" value={pred.scheduled_generation_mw?.toFixed(2)} unit="MW" color="blue" subtitle="Clear-sky proxy" />
            <MetricCard title="Deviation" value={`${pred.deviation_percent?.toFixed(1)}%`} color="orange" subtitle={pred.deviation_direction || "—"} />
            <MetricCard title="Risk Level" value={pred.risk_level} color="red" subtitle={`Conf ${(pred.confidence * 100).toFixed(0)}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="glass-card p-5 flex items-center justify-center">
              <SolarPanel3D generation={pred.predicted_generation_mw} className="w-48" />
            </div>
            <div className="glass-card p-5 flex items-center justify-center">
              <RiskGauge3D score={pred.risk_score ?? 0} level={pred.risk_level || "LOW"} className="w-48" />
            </div>
            <ModelProvenancePanel />
          </div>

          {pred.sources && pred.sources.length > 0 && (
            <div className="glass-card p-5 mb-6">
              <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-2">Data Sources</div>
              <div className="flex flex-wrap gap-2">
                {(pred.sources || []).map((s: any) => (
                  <a key={s.id} href={s.reference} target="_blank" rel="noreferrer"
                    className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 text-white/50 hover:text-cyan-300 hover:border-cyan-500/30">
                    {s.name} ({s.classification})
                  </a>
                ))}
              </div>
            </div>
          )}

          {timeline.length > 0 && <MiniTimeline data={timeline} maxMW={form.capacity_mw} />}
        </>
      )}

      {online && !pred && !loading && (
        <div className="glass-card text-center py-16">
          <SolarPanel3D generation={0} className="w-40 mx-auto mb-6 opacity-50" />
          <h3 className="text-lg font-medium text-white/60">Ready to Forecast</h3>
          <p className="text-white/30 mt-1 text-sm">Pick a site and run a full real-data prediction.</p>
        </div>
      )}
    </div>
  );
}
