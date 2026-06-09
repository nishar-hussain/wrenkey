import { useEffect, useState } from "react";
import { useArKey } from "@arkey/sdk/react";

export default function AuditLogsPage() {
  const { client } = useArKey();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await client.getAuditLogs(200);
        setLogs(data.logs || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Audit Logs</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Action</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Details</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">IP</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-100">{log.action}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details).slice(0, 80) : "-"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{log.ip || "-"}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No audit logs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
