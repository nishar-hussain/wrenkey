"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Monitor, Smartphone, Tablet, Trash2, Shield } from "lucide-react";

interface Session {
  id: string;
  type: string;
  createdAt: string;
  expiresAt: string;
}

function getDeviceIcon(type: string) {
  if (type === "READ_WRITE") return <Monitor className="w-4 h-4" />;
  if (type === "READ_ONLY") return <Tablet className="w-4 h-4" />;
  return <Smartphone className="w-4 h-4" />;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SessionsPage() {
  const router = useRouter();
  const { isAuthenticated, token, user } = useAuth();
  const { addToast } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch("/sessions?limit=50", { token });
      setSessions(res.data || []);
    } catch { addToast("Failed to load sessions", "error"); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchSessions();
  }, [isAuthenticated, fetchSessions, router]);

  const revokeSession = async (id: string) => {
    if (revoking) return;
    setRevoking(id);
    try {
      await apiFetch(`/sessions/${id}`, { method: "DELETE", token: token! });
      addToast("Session revoked", "success");
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err: any) { addToast(err.message || "Failed to revoke", "error"); } finally { setRevoking(null); }
  };

  if (!isAuthenticated) return null;

  const currentSessionId = sessions.length > 0 ? sessions[0].id : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your active login sessions. Revoke any session you don&apos;t recognize.</p>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : sessions.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No active sessions</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${session.id === currentSessionId ? "bg-emerald-50 border border-emerald-200 text-emerald-600" : "bg-slate-50 border border-slate-200 text-slate-500"}`}>
                      {getDeviceIcon(session.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{session.type.replace("_", " ")} Session</p>
                        {session.id === currentSessionId && (
                          <span className="inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">Current</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created {timeAgo(session.createdAt)} · Expires {new Date(session.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  {session.id !== currentSessionId && (
                    <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => revokeSession(session.id)} disabled={revoking === session.id}>
                      {revoking === session.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">About Sessions</h3>
          <ul className="space-y-1.5 text-xs text-slate-500">
            <li>· Sessions allow you to stay signed in across multiple devices.</li>
            <li>· Revoke any session you don&apos;t recognize immediately.</li>
            <li>· Your current session is highlighted in green and cannot be revoked from here.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
