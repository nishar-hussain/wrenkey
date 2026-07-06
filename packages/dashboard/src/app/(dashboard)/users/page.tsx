"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

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
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "DEVELOPER" });
  const [createLoading, setCreateLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "DEVELOPER", tags: "" });
  const [editLoading, setEditLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/users?limit=${limit}&offset=${offset}`, { token });
      setUsers(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load users", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createUser = async () => {
    if (!form.email) {
      addToast("Email is required", "error");
      return;
    }
    setCreateLoading(true);
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify(form), token: token! });
      setShowCreate(false);
      setForm({ name: "", email: "", role: "DEVELOPER" });
      addToast("User added", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to add user", "error");
    } finally { setCreateLoading(false); }
  };

  const deleteUser = async (id: string) => {
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE", token: token! });
      addToast("User deleted", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete user", "error");
    }
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditForm({ name: u.name || "", role: u.role, tags: u.tags.join(", ") });
    setShowEdit(true);
  };

  const updateUser = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      await apiFetch(`/users/${editUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          role: editForm.role,
          tags: editForm.tags ? editForm.tags.split(",").map((s) => s.trim()) : [],
        }),
        token: token!,
      });
      addToast("User updated", "success");
      setShowEdit(false);
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to update user", "error");
    } finally { setEditLoading(false); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name", render: (u: User) => u.name || "-" },
    { key: "email", header: "Email", render: (u: User) => u.email || u.phone || "-" },
    { key: "role", header: "Role" },
    { key: "tags", header: "Tags", render: (u: User) => u.tags.length > 0 ? u.tags.join(", ") : "-" },
    { key: "createdAt", header: "Created", render: (u: User) => new Date(u.createdAt).toLocaleDateString() },
    {
      key: "actions", header: "",
      render: (u: User) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => deleteUser(u.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={() => setShowCreate(true)}>Add User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={users} loading={false} emptyMessage="No users found." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add User">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="DEVELOPER">Developer</option>
              <option value="ORG_ADMIN">Org Admin</option>
              <option value="AGENT">Agent</option>
              <option value="AUDITOR">Auditor</option>
            </select>
          </div>
          <Button onClick={createUser} disabled={createLoading} className="w-full">Add User</Button>
        </div>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit User">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="DEVELOPER">Developer</option>
              <option value="ORG_ADMIN">Org Admin</option>
              <option value="AUDITOR">Auditor</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
          </div>
          <Button onClick={updateUser} disabled={editLoading} className="w-full">{editLoading ? "Saving..." : "Save Changes"}</Button>
        </div>
      </Modal>
    </div>
  );
}