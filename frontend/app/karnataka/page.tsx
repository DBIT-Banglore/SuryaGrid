"use client";
import { useEffect, useState } from "react";
import { getBescomStatus, getKarnatakaRegions, seedKarnataka } from "@/lib/api";
import MetricCard from "@/components/cards/MetricCard";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import type { BescomStatus, KarnatakaRegions } from "@/lib/types";

export default function KarnatakaPage() {
  const [regions, setRegions] = useState<KarnatakaRegions | null>(null);
  const [bescom, setBescom] = useState<BescomStatus | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    getKarnatakaRegions().then(setRegions).catch(() => {});
    getBescomStatus().then(setBescom).catch(() => {});
  };
  useEffect(load, []);

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await seedKarnataka();
      setMsg(`Registered ${r.created.length} site(s) of ${r.total_registry}.`);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
    setSeeding(false);
  };

  const totalGw = regions ? (regions.total_capacity_mw / 1000).toFixed(2) : "—";

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Karnataka Grid · BESCOM</h1>
          <p className="text-white/40 mt-1">
            State-wide solar fleet under the KERC / Karnataka SLDC deviation settlement framework
          </p>
        </div>
        <button onClick={seed} disabled={seeding} className="btn-primary">
          {seeding ? "Seeding…" : "Seed Karnataka Sites"}
        </button>
      </div>
      {msg && <div className="glass-card p-3 mb-6 text-sm text-cyan-300">{msg}</div>}

      <HowItWorks
        title="How the Karnataka / BESCOM framework works"
        subtitle="KERC deviation settlement for solar generators in Karnataka"
        steps={[
          { step: "KERC DSM framework", detail: "The Karnataka Electricity Regulatory Commission (KERC) defines a deviation settlement mechanism for solar generators with a ±5% tolerance band of available capacity." },
          { step: "BESCOM as the distribution licensee", detail: "Bangalore Electricity Supply Company (BESCOM) is the distribution licensee for the Bengaluru region. The SLDC (State Load Dispatch Centre) monitors real-time generation against declared schedules." },
          { step: "Deviation calculation", detail: "deviation_pct = (|actual − scheduled| / Δt_h) × block_h / available_capacity × 100. Within ±5% → no charge. Beyond 5% → escalating slab charges." },
          { step: "Slab rates (representative)", detail: "0–15% beyond band: ₹2/kWh. 15–25%: ₹4/kWh. >25%: ₹6/kWh. Rates are USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE — the platform does not compute rupee charges without a verified official tariff." },
          { step: "Regional site registry", detail: "Karnataka solar sites are seeded from the site registry (Pavagada, Bengaluru, etc.) with their DISCOM assignments and capacities. The total fleet capacity drives state-wide DSM exposure analysis." },
        ]}
      />

      <SourceBadges sources={[
        { name: "KERC", label: "solar DSM band ±5%" },
        { name: "BESCOM", label: "Bangalore distribution" },
        { name: "Karnataka SLDC", label: "schedule monitoring" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="KERC solar DSM band"
          formula={"tolerance = ±5% of available_capacity\ndeviation_pct = (|actual − scheduled| / Δt_h)\n             × block_h / available_capacity × 100"}
          variables={[
            { name: "available_capacity", desc: "Installed capacity in MW (CERC 6(2)(a))" },
            { name: "Δt_h", desc: "Evaluation interval in hours" },
            { name: "block_h", desc: "DSM time-block (time_block_minutes / 60)" },
          ]}
          source="USER_CONFIGURABLE · KERC"
        />
        <FormulaCard
          label="KERC slab charges (representative)"
          formula={"if |dev_pct| ≤ 5%:   NO_CHARGE\nif 5% < |dev_pct| ≤ 15%:  ₹2/kWh\nif 15% < |dev_pct| ≤ 25%: ₹4/kWh\nif |dev_pct| > 25%:       ₹6/kWh\ncharge = Σ slab_kWh × slab_rate"}
          source="USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE"
        />
        <FormulaCard
          label="Chargeable energy per slab"
          formula={"slab_kWh = (pct_in_slab / 100)\n  × capacity_mw × 1000 × interval_hours"}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Dynamic risk score (composite)"
          formula={"dev_pct = |actual − scheduled| / scheduled × 100\npv_risk = (1 − pv_score) × 100\nscore = clamp(0.6 × dev_pct + 0.4 × pv_risk, 0, 100)\n→ NORMAL (≤15), MODERATE (16-40), HIGH (41-71), CRITICAL (>71)"}
          source="FALLBACK_DEFAULT"
        />
        <FormulaCard
          label="DSM risk classification"
          formula={"dev ≤ 5%:  NORMAL     · no penalty · no action\n5–10%:  MODERATE  · ₹2/kWh  · monitor\n10–15%: HIGH       · ₹4/kWh  · investigate\n>15%:   CRITICAL   · ₹6/kWh  · manual inspection"}
          source="USER_CONFIGURABLE · KERC"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="USER_CONFIGURABLE_PENDING_OFFICIAL_SOURCE"
        note="KERC slab rates are representative values pending official tariff confirmation. The platform computes deviation % and risk scores but labels rupee charges as framework-only."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Fleet Capacity" value={totalGw} unit="GW" color="green" subtitle="Across Karnataka" />
        <MetricCard title="KERC DSM Band" value={regions ? `±${regions.dsm_band_percent}` : "—"} unit="%" color="orange" subtitle="Solar tolerance" />
        <MetricCard title="Regions" value={regions ? Object.keys(regions.regions).length : "—"} color="blue" subtitle="Solar zones" />
        <MetricCard title="BESCOM Feed" value={bescom ? bescom.connector.mode : "—"} color="purple" subtitle={bescom?.connector.is_live ? "Live" : "Simulated"} />
      </div>

      {/* Regions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {regions &&
          Object.entries(regions.regions).map(([region, sites]) => (
            <div key={region} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-white">{region}</div>
                <span className="badge badge-blue">{sites.length} site{sites.length > 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {sites.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{s.name}</span>
                    <span className="text-white/50 font-mono">{s.capacity_mw} MW · {s.discom}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* BESCOM / KERC framework */}
      {bescom && (
        <div className="glass-card p-5">
          <div className="eyebrow mb-3">KERC / BESCOM DSM Framework</div>
          <p className="text-sm text-white/60 mb-4">{bescom.connector.note}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Operator</div>
              <div className="text-white/80">{bescom.connector.operator}</div>
              <div className="mt-3 text-[11px] text-white/40 uppercase tracking-wider mb-1">Solar band</div>
              <div className="text-white/80">±{bescom.kerc_solar_band_percent}% of available capacity</div>
            </div>
            <div>
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Deviation charge slabs</div>
              <table className="w-full text-sm">
                <tbody>
                  {bescom.slabs.map((s, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-1.5 text-white/60">{s.range_percent}% beyond band</td>
                      <td className="py-1.5 text-right font-mono text-amber-300">₹{s.rate_inr_per_kwh}/kWh</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
