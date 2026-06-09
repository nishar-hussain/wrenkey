import { useEffect, useState } from "react";
import { useArKey } from "@arkey/sdk/react";

export default function UsersPage() {
  const { client } = useArKey();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await client.getUsers();
        setUsers(data.users || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Users</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Name</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Email</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Role</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">{u.name || "-"}</td>
                <td className="px-6 py-4 text-sm">{u.email}</td>
                <td className="px-6 py-4">
                  <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-100">{u.role}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{(u.tags || []).join(", ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
