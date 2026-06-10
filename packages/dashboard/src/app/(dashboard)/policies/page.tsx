"use client";

import { useEffect, useState } from "react";
import { useWranKey } from "@wrankey/sdk/react";

export default function PoliciesPage() {
  const { client } = useWranKey();
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [policyName, setPolicyName] = useState("");
  const [policyEffect, setPolicyEffect] = useState<"EFFECT_ALLOW" | "EFFECT_DENY">("EFFECT_ALLOW");
  const [policyField, setPolicyField] = useState("params.value");
  const [policyOp, setPolicyOp] = useState("<=");
  const [policyValue, setPolicyValue] = useState("100000");
  const [error, setError] = useState("");

  const loadPolicies = async () => {
    try { const data = await client.getPolicies(); setPolicies(data.policies); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { loadPolicies(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await client.createPolicy({
        name: policyName, effect: policyEffect,
        conditions: [{ type: policyOp.includes("<=") ? "LESS_THAN" : "GREATER_THAN", field: policyField, value: policyValue }],
      });
      setPolicyName(""); setShowCreate(false); loadPolicies();
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Policies</h2>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          + Create Policy
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleCreate}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
                <input type="text" value={policyName} onChange={(e) => setPolicyName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="Spending Limit" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effect</label>
                <select value={policyEffect} onChange={(e) => setPolicyEffect(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="EFFECT_ALLOW">ALLOW</option>
                  <option value="EFFECT_DENY">DENY</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field</label>
                <input type="text" value={policyField} onChange={(e) => setPolicyField(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                <select value={policyOp} onChange={(e) => setPolicyOp(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="<=">Less than or equal</option>
                  <option value=">">Greater than</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <input type="text" value={policyValue} onChange={(e) => setPolicyValue(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      )}

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Name</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Effect</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Consensus</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Active</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {policies.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{p.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${p.effect === "EFFECT_ALLOW" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{p.effect}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">{p.consensus}</td>
                  <td className="px-6 py-4"><span className={`w-2 h-2 rounded-full inline-block ${p.active ? "bg-green-500" : "bg-gray-300"}`} /></td>
                  <td className="px-6 py-4">
                    <button onClick={async () => { await client.deletePolicy(p.id); loadPolicies(); }} className="text-red-600 text-sm hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No policies</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
