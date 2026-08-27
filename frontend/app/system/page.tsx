"use client";
import { useEffect, useState } from "react";
import { API_BASE, getSystemStatus, probeBackend } from "@/lib/api";
import OfflineBanner from "@/components/OfflineBanner";
import { HowItWorks, SourceBadges, ProvenanceNote } from "@/components/InfoSection";

const AGENTS = [
  "SourceRegistryAgent", "KaggleDataAgent", "LiveWeatherAgent", "LocationDataAgent",
  "FeatureEngineeringAgent", "ForecastAgent", "DSMEngineAgent", "FuzzyRiskAgent",
  "ExplanationAgent", "OrchestratorAgent", "APIManagementAgent", "PersistenceAgent",
];

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${
        ok ? "bg-emerald-400 shadow-emerald-400/50" : "bg-red-400 shadow-red-400/50"
      } shadow-lg`}
    />
  );
}

export default function SystemPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [s, setS] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const p = await probeBackend();
      setOnline(p.online);
      if (p.online) {
        try {
          setS(await getSystemStatus());
        } catch {
          setOnline(false);
        }
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto animate-fade-up">
      <h1 className="text-3xl font-bold text-white">System Status</h1>
      <p className="text-white/40 mt-1 mb-6">Backend, database, cache, providers, model, and agents.</p>

      <HowItWorks
        title="How the SuryaGrid AI platform is architected"
        subtitle="Deterministic multi-agent pipeline with pvlib physics, ML forecasting, and DSM risk"
        steps={[
          { step: "FastAPI backend (Python 3.12)", detail: "All numeric computation is deterministic Python — no LLM performs math. FastAPI exposes REST endpoints under /api/v1/ for orchestration, forecasting, DSM, energy, settlement, RL, and data sources." },
          { step: "Data layer", detail: "PostgreSQL for persistence (sites, substations, RL training runs, DSM profiles). Redis for caching and rate limiting. Parquet files for static ML datasets (Kaggle, OSM substations)." },
          { step: "Agent pipeline (12 deterministic agents)", detail: "SourceRegistry → KaggleData → LiveWeather → LocationData → FeatureEngineering → Forecast → DSMEngine → FuzzyRisk → Explanation → Orchestrator → APIManagement → Persistence." },
          { step: "Weather data (Open-Meteo + NLR NSRDB)", detail: "Live hourly weather from Open-Meteo (no API key). Historical archive from NLR NSRDB (developer.nlr.gov, free API key) — SUNY India 2000-2014, Himawari 2016-2020." },
          { step: "ML models (scikit-learn)", detail: "solar_forecast_model.pkl (HistGBT, GHI prediction), cloud_risk_classifier.pkl (HistGBT, P(cloud drop)), kaggle_pv_ac_model.pkl (HistGBT, PV AC output). All trained on real data, stored with model cards." },
          { step: "Frontend (Next.js 14)", detail: "App Router with server components. Every page shows formulas, provenance, and workflow steps. Dark glassmorphism UI. Deployed at suryagrid.mithungowda.in." },
        ]}
      />

      <SourceBadges sources={[
        { name: "FastAPI", label: "Python 3.12 backend" },
        { name: "PostgreSQL", label: "persistence" },
        { name: "Redis", label: "cache + rate limit" },
        { name: "Next.js 14", label: "frontend" },
        { name: "pvlib", label: "physics engine" },
      ]} />

      <ProvenanceNote
        label="DETERMINISTIC"
        note="All 12 agents are deterministic Python — no LLM in the numeric path. Provenance is tracked end-to-end: every output carries a source classification."
      />

      {online === false && <OfflineBanner base={API_BASE} />}
      {online === null && <div className="glass-card p-6 text-white/50">Checking backend…</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card p-5">
              <div className="eyebrow">Backend</div>
              <div className="flex items-center gap-2 mt-2">
                <Dot ok={!!s.healthy} />
                <span className="text-lg font-bold text-white">{s.healthy ? "Healthy" : "Degraded"}</span>
              </div>
              <div className="text-xs text-white/35 mt-1">v{s.app?.version} · {s.app?.environment}</div>
            </div>
            <div className="glass-card p-5">
              <div className="eyebrow">Database</div>
              <div className="flex items-center gap-2 mt-2">
                <Dot ok={s.database === "connected"} />
                <span className="text-lg font-bold text-white capitalize">{s.database}</span>
              </div>
              <div className="text-xs text-white/35 mt-1">{s.database_engine}</div>
            </div>
            <div className="glass-card p-5">
              <div className="eyebrow">Redis</div>
              <div className="flex items-center gap-2 mt-2">
                <Dot ok={s.redis === "connected"} />
                <span className="text-lg font-bold text-white capitalize">{s.redis}</span>
              </div>
              <div className="text-xs text-white/35 mt-1">cache · rate limit</div>
            </div>
            <div className="glass-card p-5">
              <div className="eyebrow">ML Model</div>
              <div className="flex items-center gap-2 mt-2">
                <Dot ok={!!s.model?.trained} />
                <span className="text-lg font-bold text-white">{s.model?.trained ? "Trained" : "Not trained"}</span>
              </div>
              <div className="text-xs text-white/35 mt-1">{s.model?.model_type || "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="glass-card p-5">
              <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">Weather Providers</div>
              <div className="space-y-2">
                {(s.weather_providers || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{p.name}</span>
                    <span className="flex items-center gap-2">
                      <Dot ok={!!p.available} />
                      <span className="text-white/40">{p.mode}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Kaggle dataset</span>
                  <span className="flex items-center gap-2"><Dot ok={!!s.kaggle?.loaded} /><span className="text-white/40">{s.kaggle?.loaded ? "loaded" : "not loaded"}</span></span>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">Record Counts</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(s.counts || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-white/5 py-1">
                    <span className="text-white/50 capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="text-white font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">Agents (deterministic Python)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {AGENTS.map((a) => (
                <div key={a} className="flex items-center gap-2 text-sm text-white/60">
                  <Dot ok={true} /> {a}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
