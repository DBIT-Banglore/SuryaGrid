"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getRLRates, settleDay } from "@/lib/api";
import { CONSUMPTION_PROFILES, LOCATIONS } from "@/lib/locations";
import MetricCard from "@/components/cards/MetricCard";
import { HowItWorks, FormulaCard, FormulaGrid, SourceBadges, ProvenanceNote } from "@/components/InfoSection";
import type { RLRates, SettlementDay } from "@/lib/types";

export default function SettlementPage() {
  const [data, setData] = useState<SettlementDay | null>(null);
  const [rates, setRates] = useState<RLRates | null>(null);
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState(0);
  const [profile, setProfile] = useState("commercial");
  const [useRl, setUseRl] = useState(true);

  useEffect(() => {
    getRLRates().then(setRates).catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const l = LOCATIONS[loc];
      const sd = await settleDay("primary-site", {
        latitude: l.latitude,
        longitude: l.longitude,
        capacity_mw: l.capacity_mw,
        tilt: l.tilt,
        consumption_profile: profile,
        consumption_base_kw: l.capacity_mw * 1000 * 0.35,
        use_rl_rates: useRl,
      });
      setData(sd);
      if (sd.rl_rates) setRates(sd.rl_rates);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const chartData =
    data?.settlements.map((s, i) => ({
      hour: `${String(i).padStart(2, "0")}h`,
      net: Math.round(s.net_owner),
    })) ?? [];

  return (
    <div className="max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settlement Engine</h1>
        <p className="text-white/40 mt-1">
          Reward, penalty and discount settlement · rates set by the RL policy
        </p>
      </div>

      <HowItWorks
        title="How the settlement engine works"
        subtitle="Hourly energy balance converted to rupee charges and rewards"
        steps={[
          { step: "Compute hourly energy balance", detail: "For each hour: production_kw (from pvlib) vs consumption_kw (from the load profile). surplus = max(0, prod − cons); deficit = max(0, cons − prod)." },
          { step: "Apply penalty / bonus rates", detail: "If the owner under-produces (deficit), they pay penalty_rate ₹/kWh. If they over-produce (surplus), they earn bonus_rate ₹/kWh. The discount_rate gives consumers a credit for surplus absorbed locally." },
          { step: "Rate source: RL policy or defaults", detail: "When use_rl_rates is true, the REINFORCE-trained policy provides the rates. Otherwise, default rates are used (penalty ₹4, bonus ₹2, discount ₹1)." },
          { step: "Aggregate day totals", detail: "total_penalty = Σ deficit_kWh × penalty_rate; total_bonus = Σ surplus_kWh × bonus_rate; total_discount = Σ self_consumed_kWh × discount_rate." },
          { step: "Net owner settlement", detail: "net_owner = total_bonus − total_penalty. Positive = the owner earns; negative = the owner owes. The RL agent optimizes these rates to minimize penalty while maintaining surplus." },
        ]}
      />

      <SourceBadges sources={[
        { name: "RL Policy", label: "REINFORCE-trained rates" },
        { name: "pvlib", label: "hourly production" },
        { name: "Load profiles", label: "residential / commercial / industrial" },
      ]} />

      <FormulaGrid title="Formulas used">
        <FormulaCard
          label="Hourly penalty (under-production)"
          formula={"penalty_hour = deficit_kWh × penalty_rate\ndeficit_kWh = max(0, cons_kWh − prod_kWh)"}
          variables={[
            { name: "penalty_rate", desc: "₹/kWh — from RL policy or default (₹4)" },
          ]}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Hourly bonus (over-production)"
          formula={"bonus_hour = surplus_kWh × bonus_rate\nsurplus_kWh = max(0, prod_kWh − cons_kWh)"}
          variables={[
            { name: "bonus_rate", desc: "₹/kWh — from RL policy or default (₹2)" },
          ]}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Consumer discount (self-consumption)"
          formula={"discount_hour = self_consumed_kWh × discount_rate\nself_consumed = min(prod, cons)"}
          variables={[
            { name: "discount_rate", desc: "₹/kWh — from RL policy or default (₹1)" },
          ]}
          source="USER_CONFIGURABLE"
        />
        <FormulaCard
          label="Net owner settlement"
          formula={"net_owner = total_bonus − total_penalty\ntotal_penalty = Σ deficit_kWh × penalty_rate\ntotal_bonus = Σ surplus_kWh × bonus_rate\ntotal_discount = Σ self_consumed × discount_rate"}
          source="MODEL_LEARNED · RL"
        />
        <FormulaCard
          label="RL reward function (REINFORCE)"
          formula={"reward = Σ (bonus − penalty) − α × variance(deviation)\npolicy π(a|s) updates via policy gradient:\n∇θ J = E[∇θ log π(a|s) × G_t]"}
          variables={[
            { name: "α", desc: "Risk-aversion penalty weight on deviation variance" },
            { name: "G_t", desc: "Discounted return from time t" },
          ]}
          source="MODEL_LEARNED"
        />
      </FormulaGrid>

      <ProvenanceNote
        label="MODEL_LEARNED + USER_CONFIGURABLE"
        note="Rates may come from the RL policy (REINFORCE on real irradiance data) or from configurable defaults. The settlement is a decision-support tool, not a regulatory settlement."
      />

      {/* RL rate cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Penalty Rate" value={rates ? `₹${rates.penalty_rate}` : "—"} unit="/kWh" color="red" subtitle="Shortfall charge" />
        <MetricCard title="Bonus Rate" value={rates ? `₹${rates.bonus_rate}` : "—"} unit="/kWh" color="green" subtitle="Surplus reward" />
        <MetricCard title="Discount Rate" value={rates ? `₹${rates.discount_rate}` : "—"} unit="/kWh" color="blue" subtitle="Consumer incentive" />
        <MetricCard title="Policy" value={rates?.policy_trained ? "Trained" : "Default"} color="purple" subtitle="RL rate source" />
      </div>

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
        <label className="flex items-center gap-2 text-sm text-white/60 pb-2">
          <input type="checkbox" checked={useRl} onChange={(e) => setUseRl(e.target.checked)} className="accent-blue-500" />
          Use RL rates
        </label>
        <button onClick={run} disabled={loading} className="btn-primary">
          {loading ? "Settling…" : "Run Day Settlement"}
        </button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard title="Total Penalty" value={`₹${data.total_penalty.toLocaleString()}`} color="red" subtitle="Owner shortfall cost" />
            <MetricCard title="Total Bonus" value={`₹${data.total_bonus.toLocaleString()}`} color="green" subtitle="Owner surplus reward" />
            <MetricCard title="Consumer Discount" value={`₹${data.total_discount.toLocaleString()}`} color="blue" subtitle="Surplus absorbed" />
            <MetricCard
              title="Net Owner"
              value={`₹${data.net_owner.toLocaleString()}`}
              color={data.net_owner >= 0 ? "green" : "red"}
              subtitle={data.net_owner >= 0 ? "Net credit" : "Net charge"}
            />
          </div>

          <div className="glass-card p-5">
            <div className="eyebrow mb-4">Hourly Net Owner Settlement (₹)</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="hour" stroke="rgba(255,255,255,0.4)" fontSize={11} interval={1} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0f1530", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} />
                <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.net >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="glass-card text-center py-16">
          <h3 className="text-lg font-medium text-white/60">No settlement run yet</h3>
          <p className="text-white/30 mt-1 text-sm">Run a day settlement to see penalty, bonus and discount outcomes</p>
        </div>
      )}
    </div>
  );
}
