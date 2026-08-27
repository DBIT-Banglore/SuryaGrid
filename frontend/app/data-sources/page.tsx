"use client";
import { useEffect, useState } from "react";
import { API_BASE, getDataSourcesStatus, getSources, probeBackend } from "@/lib/api";
import OfflineBanner from "@/components/OfflineBanner";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border ${
        ok
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
          : "bg-amber-500/10 text-amber-300 border-amber-500/30"
      }`}
    >
      {label}
    </span>
  );
}

const CLASS_COLORS: Record<string, string> = {
  OFFICIAL_SOURCE: "text-emerald-300",
  DATASET_DERIVED: "text-cyan-300",
  MODEL_LEARNED: "text-purple-300",
  USER_CONFIGURABLE: "text-amber-300",
  FALLBACK_DEFAULT: "text-white/50",
  USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE: "text-orange-300",
};

export default function DataSourcesPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const p = await probeBackend();
      setOnline(p.online);
      if (p.online) {
        try {
          const [st, sr] = await Promise.all([getDataSourcesStatus(), getSources()]);
          setStatus(st);
          setSources(sr.sources || []);
        } catch {
          setOnline(false);
        }
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto animate-fade-up">
      <h1 className="text-3xl font-bold text-white">Data Sources</h1>
      <p className="text-white/40 mt-1 mb-6">
        Every dataset, API and formula the platform relies on — with live status and
        source classification. No source is silently substituted.
      </p>

      <HowItWorks
        title="How data provenance works"
        subtitle="Every number in the platform carries a classification label"
        steps={[
          { step: "Source registry (machine-readable)", detail: "backend/app/data_sources/source_registry.py registers every data source with an ID, name, URL, license, and classification. The /api/v1/sources endpoint exposes this." },
          { step: "Provenance labels on every output", detail: "Each forecast, DSM result, and substation context includes a source_label (REAL_BENGALURU, REAL_INDIA, ESTIMATED_FROM_REAL, NOT_AVAILABLE, etc.) so downstream consumers know exactly where data came from." },
          { step: "Classification hierarchy", detail: "OFFICIAL_SOURCE (pvlib, CERC regulations, KERC) > DATASET_DERIVED (Kaggle, OSM) > MODEL_LEARNED (ML predictions) > FALLBACK_DEFAULT (heuristics, default constants)." },
          { step: "No-fabrication principle", detail: "If a real input is unavailable (e.g. capacity_mva not in OSM), the field stays null and the calculation is blocked — never silently substituted with a fake value." },
          { step: "Live provider status", detail: "The /api/v1/data-sources/status endpoint probes each provider (Open-Meteo, NLR NSRDB, Kaggle) and reports available/unavailable + mode (real/demo) in real time." },
        ]}
      />

      <FormulaGrid title="Data source classifications">
        <FormulaCard
          label="OFFICIAL_SOURCE"
          formula={"Physical models and regulatory\nformulas with published references.\n→ pvlib (GHI closure, POA, PVWatts)\n→ CERC/KERC tariff rules"}
          source="Highest authority"
        />
        <FormulaCard
          label="DATASET_DERIVED"
          formula={"Real datasets downloaded from\nKaggle, OpenStreetMap, NLR NSRDB.\n→ Anikannal solar plant data\n→ OSM substations (344 in Bengaluru)\n→ NSRDB Himawari/SUNY India"}
          source="Real-world data"
        />
        <FormulaCard
          label="MODEL_LEARNED"
          formula={"ML model predictions trained on\nreal data.\n→ solar_forecast_model.pkl (GHI)\n→ cloud_risk_classifier.pkl (P(cloud))\n→ Kaggle PV model (HistGBT)"}
          source="Trained on real data"
        />
        <FormulaCard
          label="FALLBACK_DEFAULT"
          formula={"Transparent heuristics used when\nno model or data is available.\n→ confidence = 1 − 0.35·cloud\n→ γ = −0.0035/°C (c-Si default)\n→ Dynamic risk weights (0.6/0.4)"}
          source="Documented, overridable"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="REAL_BENGALURU + REAL_INDIA + REAL_COORDINATE_BASED"
        note="The platform distinguishes data sourced from real Bengaluru coordinates (weather, substations) from India-wide datasets (Kaggle PV) and coordinate-based lookups (Open-Meteo at any lat/lon)."
      />

      {online === false && <OfflineBanner base={API_BASE} />}
      {online === null && <div className="glass-card p-6 text-white/50">Checking backend…</div>}

      {status && (
        <div className="glass-card p-5 mb-6">
          <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">Live Provider Status</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(status.providers || []).map((p: any, i: number) => (
              <div key={i} className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-white text-sm">{p.name}</div>
                  <StatusChip ok={p.available} label={p.available ? "available" : "unavailable"} />
                </div>
                <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">{p.provider_type} · {p.mode}</div>
                <div className="text-sm text-white/55 mt-1">{p.detail}</div>
                {p.record_count != null && (
                  <div className="text-xs text-white/35 mt-1">~{p.record_count} records</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="glass-card p-5">
          <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">
            Source Registry ({sources.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2 pr-3">Verified</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s: any) => (
                  <tr key={s.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-white/70 font-mono text-xs">{s.id}</td>
                    <td className="py-2 pr-3 text-white/80">
                      <a href={s.reference} target="_blank" rel="noreferrer" className="hover:text-cyan-300">
                        {s.name}
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-white/50">{s.type}</td>
                    <td className={`py-2 pr-3 ${CLASS_COLORS[s.classification] || "text-white/60"}`}>
                      {s.classification}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusChip ok={s.verified === "verified"} label={s.verified} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-white/30 mt-3">
            Full registry: docs/SOURCE_REGISTRY.md · classifications per the source-first rule.
          </div>
        </div>
      )}
    </div>
  );
}
