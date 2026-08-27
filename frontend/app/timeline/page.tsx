"use client";
import { useState } from "react";
import { getTimeline } from "@/lib/api";
import MiniTimeline from "@/components/charts/MiniTimeline";
import MetricCard from "@/components/cards/MetricCard";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import type { TimelineData, TimelineEntry } from "@/lib/types";

const LOCATIONS = [
  { label: "Bhadla, Rajasthan", lat: 27.53, lon: 71.91, cap: 100 },
  { label: "Pavagada, Karnataka", lat: 14.1, lon: 77.28, cap: 100 },
  { label: "Kurnool, Andhra Pradesh", lat: 15.68, lon: 78.28, cap: 50 },
  { label: "New Delhi", lat: 28.61, lon: 77.21, cap: 50 },
];

export default function TimelinePage() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const l = LOCATIONS[loc];
      const tl = await getTimeline("primary-site", {
        latitude: l.lat,
        longitude: l.lon,
        capacity_mw: l.cap,
        forecast_days: 1,
      });
      setData(tl);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const riskBadge = (level: string) => {
    const cls: Record<string, string> = { LOW: "badge-green", MEDIUM: "badge-yellow", HIGH: "badge-orange", CRITICAL: "badge-red" };
    return <span className={`badge ${cls[level] || "badge-green"}`}>{level}</span>;
  };

  const summary = data?.summary;
  const capacity = data?.capacity_mw ?? 50;

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Generation Timeline</h1>
        <p className="text-white/40 mt-1">Hourly solar nowcast with DSM deviation tracking · live Open-Meteo data</p>
      </div>

      <HowItWorks
        title="How the generation timeline is built"
        subtitle="Hourly forecast from live weather → pvlib physics → DSM deviation"
        steps={[
          { step: "Fetch hourly weather from Open-Meteo", detail: "GHI, DNI, DHI, cloud cover, temperature, wind speed at the site coordinates for 1–7 forecast days." },
          { step: "Compute solar position for each hour", detail: "Solar zenith (θz) and azimuth angles via pvlib.solarposition.get_solarposition for the site's lat/lon and timezone." },
          { step: "Decompose irradiance (if needed)", detail: "If GHI is the only component available, Erbs decomposition splits it into DNI and DHI using the zenith angle." },
          { step: "Transpose to plane-of-array (POA)", detail: "pvlib.get_total_irradiance(tilt, azimuth, zenith, azimuth_sun, dni, ghi, dhi) — isotropic sky diffuse model." },
          { step: "Compute cell temperature", detail: "pvlib.temperature.faiman(poa, temp_air, wind_speed) — Faiman 2008 model." },
          { step: "Calculate DC and AC power", detail: "PVWatts DC: pvwatts_dc(poa, t_cell, pdc0, γ=-0.0035). Inverter AC: pvwatts_inverter(dc, η=0.96), clipped to capacity." },
          { step: "Compute DSM deviation per hour", detail: "Interval-normalized deviation: (|predicted − scheduled| / Δt) × block_hours / denominator × 100. Flag PENALTY_RISK when beyond band." },
          { step: "Aggregate day summary", detail: "Sum predicted_energy_mwh, scheduled_energy_mwh, count penalty intervals, and total DSM charge." },
        ]}
      />

      <SourceBadges sources={[
        { name: "Open-Meteo", label: "live hourly weather" },
        { name: "pvlib", label: "GHI→DNI/DHI + POA + PVWatts" },
        { name: "DSM Engine", label: "interval-normalized deviation" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="POA irradiance (transposition)"
          formula={"POA = get_total_irradiance(\n         tilt, surface_azimuth,\n         zenith, azimuth_sun,\n         dni, ghi, dhi)\n# isotropic sky diffuse model"}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="Cell temperature (Faiman)"
          formula={"t_cell = poa * f1 + temp_air\nf1 = 9.5 / (5.7 + 3.8 * wind_speed)\n# Faiman 2008"}
          variables={[
            { name: "poa", desc: "Plane-of-array irradiance (W/m²)" },
            { name: "wind_speed", desc: "Wind speed (m/s)" },
          ]}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="DC & AC power (PVWatts)"
          formula={"DC = pvwatts_dc(poa, t_cell, pdc0, γ)\n     pdc0 = capacity_mw × 1e6\n     γ = −0.0035 /°C (c-Si)\nAC = pvwatts_inverter(DC, pdc0, η=0.96)\nMW = min(AC / 1e6, capacity_mw)"}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="DSM deviation (per interval)"
          formula={"dev_pct = (|pred − sched| / Δt_h)\n         × block_h / denom × 100\nenergy_mwh = MW × Δt_h\nstatus = dev_pct > band ? PENALTY_RISK : OK"}
          variables={[
            { name: "Δt_h", desc: "Interval hours (1 for hourly, 0.25 for 15-min)" },
            { name: "block_h", desc: "DSM time block (time_block_minutes / 60)" },
            { name: "denom", desc: "available_capacity or scheduled (MW)" },
          ]}
          source="USER_CONFIGURABLE"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="REAL_COORDINATE_BASED"
        note="Hourly irradiance from Open-Meteo at real coordinates; generation derived via pvlib physics with a clear-sky schedule proxy."
      />

      <div className="flex flex-wrap items-end gap-3 mb-8">
        <div>
          <label className="text-[10px] text-white/40 block mb-1 uppercase tracking-wider">Site</label>
          <select className="input-field" value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
            {LOCATIONS.map((l, i) => (
              <option key={i} value={i} className="bg-slate-800">{l.label} · {l.cap} MW</option>
            ))}
          </select>
        </div>
        <button onClick={load} disabled={loading} className="btn-primary">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Fetching…
            </span>
          ) : "Generate Forecast"}
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard title="Predicted Energy" value={summary.predicted_energy_mwh.toFixed(1)} unit="MWh" color="blue" subtitle="Cloud-adjusted day output" />
          <MetricCard title="Scheduled Energy" value={summary.scheduled_energy_mwh.toFixed(1)} unit="MWh" color="purple" subtitle="Clear-sky commitment" />
          <MetricCard title="Penalty Intervals" value={`${summary.penalty_intervals}/${summary.daylight_intervals}`} color="orange" subtitle="Daylight hours over band" />
          <MetricCard title="Est. DSM Charge" value={`₹${summary.total_penalty_cost.toLocaleString()}`} color="red" subtitle="Cumulative day" />
        </div>
      )}

      {data && (
        <>
          <div className="mb-6">
            <MiniTimeline data={data.timeline} maxMW={capacity} />
          </div>

          <div className="glass-card overflow-hidden p-0">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="table-head sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Time</th>
                    <th className="px-3 py-2.5 text-right font-medium">GHI</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cloud</th>
                    <th className="px-3 py-2.5 text-right font-medium">Predicted</th>
                    <th className="px-3 py-2.5 text-right font-medium">Scheduled</th>
                    <th className="px-3 py-2.5 text-right font-medium">Energy</th>
                    <th className="px-3 py-2.5 text-right font-medium">Deviation</th>
                    <th className="px-3 py-2.5 text-center font-medium">Status</th>
                    <th className="px-3 py-2.5 text-center font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.timeline.map((e: TimelineEntry, i: number) => (
                    <tr key={i} className="table-row">
                      <td className="px-3 py-2 font-mono text-white/70">{e.timestamp.slice(11, 16)}</td>
                      <td className="px-3 py-2 text-right text-white/80">{e.ghi_w_m2.toFixed(0)} <span className="text-white/30">W/m²</span></td>
                      <td className="px-3 py-2 text-right text-white/80">{e.cloud_cover_percent.toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right font-medium text-white">{e.predicted_generation_mw.toFixed(2)} MW</td>
                      <td className="px-3 py-2 text-right text-white/50">{e.scheduled_generation_mw.toFixed(2)} MW</td>
                      <td className="px-3 py-2 text-right text-white/70">{e.energy_mwh.toFixed(2)} MWh</td>
                      <td className="px-3 py-2 text-right font-mono text-white/70">{e.deviation_percent.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`badge ${e.penalty_status === "PENALTY_RISK" ? "badge-red" : e.penalty_status === "INVALID_SCHEDULE" ? "badge-yellow" : "badge-green"}`}>
                          {e.penalty_status === "PENALTY_RISK" ? "PENALTY" : e.penalty_status === "INVALID_SCHEDULE" ? "N/A" : "OK"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">{riskBadge(e.risk_level)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="glass-card text-center py-16">
          <svg className="w-16 h-16 mx-auto text-white/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <h3 className="text-lg font-medium text-white/60">No Timeline Data</h3>
          <p className="text-white/30 mt-1 text-sm">Select a site and generate a live forecast</p>
        </div>
      )}
    </div>
  );
}
