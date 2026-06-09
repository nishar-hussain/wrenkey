import { useEffect, useState } from "react";
import { useArKey } from "@arkey/sdk/react";

export default function AgentsPage() {
  const { client } = useArKey();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [createdAgent, setCreatedAgent] = useState<any>(null);
  const [error, setError] = useState("");

  const loadAgents = async () => {
    try {
      const data = await client.getAgents();
      setAgents(data.agents || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAgents(); }, []);

  const handleCreate = async () => {
    setError("");
    try {
      const result = await client.createAgent({ name: agentName });
      setCreatedAgent(result.credentials);
      setAgentName("");
      loadAgents();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">AI Agents</h2>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          + Deploy Agent
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Agent Name</label>
          <div className="flex gap-3">
            <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" placeholder="Trading Bot" />
            <button onClick={handleCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Deploy</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {createdAgent && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-700">Agent created! Save the API key securely:</p>
              <code className="block mt-2 p-2 bg-white rounded border text-xs font-mono break-all">{createdAgent.apiKey}</code>
            </div>
          )}
        </div>
      )}

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Name</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Created</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {agents.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{a.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      a.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <button onClick={async () => { await client.deleteAgent(a.id); loadAgents(); }}
                      className="text-red-600 text-sm hover:underline">Revoke</button>
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No agents</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
