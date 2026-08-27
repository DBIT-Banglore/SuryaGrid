"use client";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getEnergy } from "@/lib/api";
import { CONSUMPTION_PROFILES, LOCATIONS } from "@/lib/locations";
import MetricCard from "@/components/cards/MetricCard";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import type { EnergyBalance } from "@/lib/types";

export default function EnergyPage() {
  const [data, setData] = useState<EnergyBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState(0);
  const [profile, setProfile] = useState<string>("commercial");

  const load = async () => {
    setLoading(true);
    try {
      const l = LOCATIONS[loc];
      const eb = await getEnergy("primary-site", {
        latitude: l.latitude,
        longitude: l.longitude,
        capacity_mw: l.capacity_mw,
        tilt: l.tilt,
        consumption_profile: profile,
        consumption_base_kw: l.capacity_mw * 1000 * 0.35,
      });
      setData(eb);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const chartData =
    data?.breakdown.map((b) => ({
      hour: `${String(b.hour).padStart(2, "0")}:00`,
      Production: Math.round(b.production_kw),
      Consumption: Math.round(b.consumption_kw),
      Surplus: Math.round(b.surplus_kw),
    })) ?? [];

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Energy Balance</h1>
        <p className="text-white/40 mt-1">
          Real production vs consumption · surplus, deficit and self-consumption
        </p>
      </div>

      <HowItWorks
        title="How the energy balance is computed"
        subtitle="Hourly PV production vs a load profile, with self-consumption and grid flow"
        steps={[
          { step: "Fetch hourly irradiance from Open-Meteo", detail: "GHI, DNI, DHI, cloud cover, temperature for the site coordinates. Used to compute PV production each hour." },
          { step: "Compute PV production (pvlib physics)", detail: "Erbs decomposition → POA transposition → Faiman cell temp → PVWatts DC → inverter AC → hourly MW." },
          { step: "Generate consumption load profile", detail: "Three profiles: residential (evening peak), commercial (midday peak), industrial (flat). Base kW = capacity_mw × 1000 × 0.35 as the consumption baseline." },
          { step: "Compute per-hour surplus/deficit", detail: "surplus_kw = max(0, production_kw − consumption_kw); deficit_kw = max(0, consumption_kw − production_kw)." },
          { step: "Aggregate day totals", detail: "total_production_kwh, total_consumption_kwh, self_consumption_pct = self_consumed / production × 100, grid_export = surplus summed." },
        ]}
      />

      <SourceBadges sources={[
        { name: "Open-Meteo", label: "hourly irradiance" },
        { name: "pvlib", label: "PVWatts generation" },
        { name: "Load profiles", label: "residential / commercial / industrial" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="Hourly production (pvlib)"
          formula={"POA = get_total_irradiance(tilt, az, zenith, az_sun, dni, ghi, dhi)\nt_cell = faiman(poa, temp_air, wind)\nDC = pvwatts_dc(poa, t_cell, pdc0, γ)\nAC_kw = pvwatts_inverter(DC, pdc0, η=0.96)\nproduction_kw = min(AC_kw, capacity_mw × 1000)"}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="Hourly surplus / deficit"
          formula={"surplus_kw = max(0, production − consumption)\ndeficit_kw = max(0, consumption − production)\nself_consumed_kw = min(production, consumption)"}
          source="MODEL_LEARNED"
        />
        <FormulaCard
          label="Self-consumption ratio"
          formula={"self_consumption_pct = (Σ self_consumed_kwh\n               / Σ production_kwh) × 100"}
          source="DATASET_DERIVED"
        />
        <FormulaCard
          label="Grid export / import"
          formula={"grid_export_kwh = Σ surplus_kw × Δt\ngrid_import_kwh = Σ deficit_kw × Δt\n# Δt = 1 hour"}
          source="MODEL_LEARNED"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="REAL_COORDINATE_BASED"
        note="Production derived from live Open-Meteo weather at real site coordinates. Consumption profiles are synthetic baselines scaled to plant capacity."
      />

      <div className="flex flex-wrap items-end gap-3 mb-8">
        <div>
          <label className="eyebrow block mb-1">Site</label>
          <select className="input-field" value={loc} onChange={(e) => setLoc(Number(e.target.value))}>
            {LOCATIONS.map((l, i) => (
              <option key={i} value={i} className="bg-slate-800">{l.label} · {l.capacity_mw} MW</option>
            ))}
          </select>
        </div>
        <div>
          <label className="eyebrow block mb-1">Consumer Profile</label>
          <select className="input-field" value={profile} onChange={(e) => setProfile(e.target.value)}>
            {CONSUMPTION_PROFILES.map((p) => (
              <option key={p} value={p} className="bg-slate-800 capitalize">{p}</option>
            ))}
          </select>
        </div>
        <button onClick={load} disabled={loading} className="btn-primary">
          {loading ? "Computing…" : "Compute Balance"}
        </button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard title="Production" value={(data.total_production_kwh / 1000).toFixed(1)} unit="MWh" color="green" subtitle="Generated today" />
            <MetricCard title="Consumption" value={(data.total_consumption_kwh / 1000).toFixed(1)} unit="MWh" color="blue" subtitle={`${data.consumption_profile} load`} />
            <MetricCard title="Self-Consumption" value={data.self_consumption_percent.toFixed(1)} unit="%" color="purple" subtitle="On-site usage" />
            <MetricCard title="Grid Export" value={(data.total_grid_export_kwh / 1000).toFixed(1)} unit="MWh" color="orange" subtitle="Surplus to grid" />
          </div>

          <div className="glass-card p-5 mb-6">
            <div className="eyebrow mb-4">Production vs Consumption (kW)</div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="prod" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="hour" stroke="rgba(255,255,255,0.4)" fontSize={11} interval={2} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0f1530", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
                <Legend />
                <Area type="monotone" dataKey="Production" stroke="#10b981" fill="url(#prod)" strokeWidth={2} />
                <Area type="monotone" dataKey="Consumption" stroke="#3b82f6" fill="url(#cons)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard title="Grid Import" value={(data.total_grid_import_kwh / 1000).toFixed(1)} unit="MWh" color="red" subtitle="Deficit from grid" />
            <MetricCard title="Self Consumed" value={(data.total_self_consumed_kwh / 1000).toFixed(1)} unit="MWh" color="green" subtitle="Direct on-site" />
            <MetricCard title="Provider" value={data.provider ?? "—"} color="blue" subtitle="Live data source" />
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="glass-card text-center py-20">
          <svg className="w-16 h-16 mx-auto text-white/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-lg font-medium text-white/60">No balance computed</h3>
          <p className="text-white/30 mt-1 text-sm">Pick a site and consumer profile to compute the energy balance</p>
        </div>
      )}
    </div>
  );
}
