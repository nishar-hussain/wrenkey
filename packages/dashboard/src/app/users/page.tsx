"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";

interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
  tags: string[];
  createdAt: string;
}

export default function UsersPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "DEVELOPER" });
  const [createLoading, setCreateLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/users?limit=${limit}&offset=${offset}`, { token });
      setUsers(res.data);
      setTotal(res.total);
    } catch {} finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createUser = async () => {
    if (!form.email) return;
    setCreateLoading(true);
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify(form), token: token! });
      setShowCreate(false);
      setForm({ name: "", email: "", role: "DEVELOPER" });
      fetchData();
    } catch {} finally { setCreateLoading(false); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name", render: (u: User) => u.name || "-" },
    { key: "email", header: "Email", render: (u: User) => u.email || u.phone || "-" },
    { key: "role", header: "Role" },
    { key: "tags", header: "Tags", render: (u: User) => u.tags.length > 0 ? u.tags.join(", ") : "-" },
    { key: "createdAt", header: "Created", render: (u: User) => new Date(u.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={() => setShowCreate(true)}>Add User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table columns={columns} data={users} loading={loading} emptyMessage="No users found." />
          <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add User">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="DEVELOPER">Developer</option>
              <option value="ORG_ADMIN">Org Admin</option>
              <option value="AGENT">Agent</option>
              <option value="AUDITOR">Auditor</option>
            </select>
          </div>
          <Button onClick={createUser} loading={createLoading} className="w-full">Add User</Button>
        </div>
      </Modal>
    </div>
  );
}
