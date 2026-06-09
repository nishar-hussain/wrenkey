import { useEffect, useState } from "react";
import { useArKey } from "@arkey/sdk/react";

export default function UsersPage() {
  const { client } = useArKey();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("DEVELOPER");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      const data = await client.getUsers();
      setUsers(data.users || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await client.createUser({ name, email, role });
      setName("");
      setEmail("");
      setRole("DEVELOPER");
      setShowCreate(false);
      loadUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Users</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          + Add User
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Add User</h3>
          <form onSubmit={handleCreate}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="john@example.com" required />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option value="DEVELOPER">Developer</option>
                <option value="ORG_ADMIN">Org Admin</option>
                <option value="AGENT">Agent</option>
                <option value="FINANCE">Finance</option>
                <option value="AUDITOR">Auditor</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Create</button>
              <button type="button" onClick={() => { setShowCreate(false); setError(""); }} className="px-4 py-2 text-gray-500">Cancel</button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
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
      )}
    </div>
  );
}
