"use client";
import { useEffect, useState } from "react";
import {
  API_BASE,
  buildAugmented,
  getModelStatus,
  ingestKaggle,
  probeBackend,
  trainModel,
} from "@/lib/api";
import OfflineBanner from "@/components/OfflineBanner";
import MetricCard from "@/components/cards/MetricCard";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";

export default function MLPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [source, setSource] = useState("synthetic");

  const refresh = async () => {
    try {
      setStatus(await getModelStatus());
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    (async () => {
      const p = await probeBackend();
      setOnline(p.online);
      if (p.online) await refresh();
    })();
  }, []);

  const act = async (name: string, fn: () => Promise<any>) => {
    setBusy(name);
    setMsg("");
    try {
      const r = await fn();
      setMsg(r?.detail || r?.metadata ? `Model: ${r.metadata?.model_type} (R²=${r.metadata?.metrics?.r2})` : "Done.");
      if (r?.built) setMsg(`Augmented dataset built from ${r.source}: ${r.rows} rows.`);
      if (r?.trained === false) setMsg(r.detail || "Could not train.");
      await refresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy("");
  };

  const model = status?.model;
  const metrics = model?.metrics || {};

  return (
    <div className="max-w-6xl mx-auto animate-fade-up">
      <h1 className="text-3xl font-bold text-white">ML Forecasting</h1>
      <p className="text-white/40 mt-1 mb-6">
        Kaggle ingestion → augmented dataset → scikit-learn training → formula/ml/hybrid forecasting.
      </p>

      <HowItWorks
        title="How the ML pipeline works"
        subtitle="From raw Kaggle data to a trained irradiance model"
        steps={[
          { step: "Kaggle ingestion", detail: "Raw solar power generation data is downloaded from Kaggle (anikannal/solar-power-generation-plant) and cached locally. Includes Plant 1 & 2 generation logs and weather sensor data." },
          { step: "Feature engineering", detail: "The raw CSVs are parsed, unit-converted (°F→°C, inHg→hPa, mph→m/s), and joined on timestamp. Features include GHI, ambient temp, module temp, irradiance, wind speed, humidity." },
          { step: "Augmented dataset build", detail: "The build_kaggle_ml_datasets pipeline merges the cleaned Kaggle data with pvlib-derived features (solar position, POA) to create the ML training table." },
          { step: "Model training", detail: "scikit-learn HistGradientBoostingRegressor trained on the augmented table. Target = irradiance (GHI). The model predicts GHI, then pvlib physics converts GHI → MW generation." },
          { step: "Forecast mode selection", detail: "auto mode: use ML prediction if a valid model exists, else fall back to pvlib formula. hybrid mode: blend ML + formula with confidence weighting. formula mode: pure pvlib physics." },
          { step: "Model evaluation", detail: "Standard regression metrics (MAE, RMSE, MAPE, R²) on a held-out test split. Model card is stored in backend/models/metadata/ with training data, metrics, and production-ready flag." },
        ]}
      />

      <SourceBadges sources={[
        { name: "Kaggle", label: "solar-power-generation-plant" },
        { name: "scikit-learn", label: "HistGradientBoostingRegressor" },
        { name: "pvlib", label: "GHI→MW physics conversion" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="ML target: irradiance prediction"
          formula={"model.predict(features) → GHI_pred\n# HistGradientBoostingRegressor\n# Features: temp, module_temp, irradiance,\n#            wind_speed, humidity, hour, month"}
          source="MODEL_LEARNED"
        />
        <FormulaCard
          label="Irradiance → generation (pvlib)"
          formula={"Erbs(ghi, zenith) → DNI, DHI\nPOA = get_total_irradiance(...)\nt_cell = faiman(poa, temp, wind)\nDC = pvwatts_dc(poa, t_cell, pdc0, γ)\nAC = pvwatts_inverter(DC, η=0.96)\nMW = min(AC / 1e6, capacity)"}
          source="OFFICIAL_SOURCE · pvlib"
        />
        <FormulaCard
          label="MAE (Mean Absolute Error)"
          formula={"MAE = (1/n) Σ |y_true − y_pred|"}
          source="OFFICIAL_SOURCE · sklearn"
        />
        <FormulaCard
          label="R² (Coefficient of determination)"
          formula={"R² = 1 − SS_res / SS_tot\nSS_res = Σ (y_true − y_pred)²\nSS_tot = Σ (y_true − mean)²"}
          source="OFFICIAL_SOURCE · sklearn"
        />
        <FormulaCard
          label="RMSE (Root Mean Square Error)"
          formula={"RMSE = √( (1/n) Σ (y_true − y_pred)² )"}
          source="OFFICIAL_SOURCE · sklearn"
        />
        <FormulaCard
          label="MAPE (Mean Abs % Error)"
          formula={"MAPE = (100/n) Σ |y_true − y_pred| / |y_true|"}
          source="OFFICIAL_SOURCE · sklearn"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="MODEL_LEARNED + OFFICIAL_SOURCE"
        note="The ML model is trained on real Kaggle solar plant data; generation is derived via pvlib physics, not learned directly. Model card stored in models/metadata/."
      />

      {online === false && <OfflineBanner base={API_BASE} />}
      {online === null && <div className="glass-card p-6 text-white/50">Checking backend…</div>}

      {status && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard title="Model" value={model?.trained ? "Trained" : "None"} color={model?.trained ? "green" : "orange"} subtitle={model?.model_type || "not trained"} />
            <MetricCard title="Kaggle Dataset" value={status.kaggle?.loaded ? "Loaded" : "Not loaded"} color={status.kaggle?.loaded ? "green" : "orange"} subtitle={status.kaggle?.dataset_slug || ""} />
            <MetricCard title="Augmented Data" value={status.augmented_dataset_present ? "Present" : "Absent"} color={status.augmented_dataset_present ? "blue" : "orange"} />
            <MetricCard title="Model R²" value={metrics.r2 != null ? metrics.r2 : "—"} color="purple" subtitle={model?.target_type || ""} />
          </div>

          {model?.trained && (
            <div className="glass-card p-5 mb-6">
              <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">Model Metadata</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><div className="text-white/40 text-xs">Type</div><div className="text-white">{model.model_type}</div></div>
                <div><div className="text-white/40 text-xs">Target</div><div className="text-white">{model.target}</div></div>
                <div><div className="text-white/40 text-xs">Version</div><div className="text-white font-mono text-xs">{model.model_version}</div></div>
                <div><div className="text-white/40 text-xs">Trained</div><div className="text-white text-xs">{model.training_date?.slice(0, 16)}</div></div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm mt-4">
                <div><div className="text-white/40 text-xs">MAE</div><div className="text-cyan-300">{metrics.mae}</div></div>
                <div><div className="text-white/40 text-xs">RMSE</div><div className="text-cyan-300">{metrics.rmse}</div></div>
                <div><div className="text-white/40 text-xs">MAPE</div><div className="text-cyan-300">{metrics.mape ?? "—"}</div></div>
                <div><div className="text-white/40 text-xs">R²</div><div className="text-cyan-300">{metrics.r2}</div></div>
              </div>
              <div className="text-xs text-white/30 mt-3">Columns: {(model.columns_used || []).join(", ")}</div>
            </div>
          )}

          <div className="glass-card p-5">
            <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">Pipeline Actions</div>
            <div className="flex flex-wrap gap-3 items-center">
              <button className="btn-primary" disabled={!!busy} onClick={() => act("ingest", ingestKaggle)}>
                {busy === "ingest" ? "Ingesting…" : "Ingest Kaggle"}
              </button>
              <div className="flex items-center gap-2">
                <select className="input-field w-40" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="kaggle" className="bg-slate-800">kaggle</option>
                  <option value="weather" className="bg-slate-800">weather</option>
                  <option value="synthetic" className="bg-slate-800">synthetic</option>
                </select>
                <button className="btn-primary" disabled={!!busy} onClick={() => act("build", () => buildAugmented({ source }))}>
                  {busy === "build" ? "Building…" : "Build Augmented"}
                </button>
              </div>
              <button className="btn-primary" disabled={!!busy} onClick={() => act("train", () => trainModel({ model_name: "auto" }))}>
                {busy === "train" ? "Training…" : "Train Model (auto)"}
              </button>
            </div>
            {msg && <div className="mt-4 text-sm text-white/60 bg-white/5 rounded-lg p-3">{msg}</div>}
            <div className="text-xs text-white/30 mt-3">
              Forecast mode selection: <span className="text-white/60">auto</span> uses hybrid when a
              valid model exists, else formula (pvlib) fallback. The Kaggle target is irradiance;
              generation is derived via pvlib.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
