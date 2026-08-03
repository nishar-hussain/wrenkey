"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { ChevronRight, Activity, CheckCircle2, Download, Search, ChevronDown } from "lucide-react";

interface ActivityDetail {
  id: string;
  action: string;
  resource: string | null;
  details: any;
  userId: string | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string } | null;
}

function formatActionLabel(action: string) {
  // e.g. WALLET_SIGN_MESSAGE -> Sign raw payload, SUBORG_CREATE -> Create sub org
  const map: Record<string, string> = {
    WALLET_SIGN_MESSAGE: "Sign raw payload",
    SUBORG_CREATE: "Create sub org",
    SUBORG_DELETE: "Delete sub org",
    SUBORG_UPDATE: "Update sub org",
    SUBORG_IMPERSONATE: "Impersonate sub org",
    PRIVATE_KEY_CREATE: "Create private keys",
    WALLET_CREATE: "Create wallet",
    USER_CREATE: "Create user",
    USER_UPDATE: "Update user",
    USER_DELETE: "Delete user",
    POLICY_CREATE: "Create policy",
    POLICY_DELETE: "Delete policy",
    WALLET_EXPORT: "Export wallet",
    WALLET_FREEZE: "Freeze wallet",
    WALLET_UNFREEZE: "Unfreeze wallet",
    WALLET_ROTATE: "Rotate wallet",
    TX_SIGN: "Sign transaction",
    TX_BROADCAST: "Broadcast transaction",
    WVC_APP_CREATE: "Create WVC app",
    WVC_DEPLOYMENT_CREATE: "Create WVC deployment",
  };
  return map[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildFailure(): any {
  return {
    code: 0,
    message: "",
    details: null,
  };
}

function buildPermission(): any {
  return {
    canApprove: true,
    canReject: true,
  };
}

function buildVoteList(activity: any): any[] {
  const user = activity?.user;
  const details = activity?.details || {};
  return [
    {
      id: details.approvalId || `${activity?.id?.slice(0, 8)}-${activity?.id?.slice(9, 13)}-${activity?.id?.slice(14, 18)}-${activity?.id?.slice(19, 23)}-${activity?.id?.slice(24, 36)}`,
      userId: user?.id || "",
      user: {
        userId: user?.id || "",
        userName: user?.name || user?.email?.split("@")[0] || "",
        userEmail: user?.email || "",
        authenticators: null,
        apiKeys: [
          {
            credential: {
              publicKey: details.publicKey || "0294727d8f6dc9495a2bb2c03ec063ae40b2154453639af53d8977b876f646bd54",
            },
            type: "CREDENTIAL_TYPE_API_KEY_P256",
            apiKeyId: details.apiKeyId || "3f877ab1-fe12-4fa0-94f7-5c233331cbf4",
            apiKeyName: details.apiKeyName || "parent-key",
            createdAt: activity?.createdAt || "",
            updatedAt: activity?.createdAt || "",
          },
        ],
        userTags: null,
        oauthProviders: null,
        createdAt: activity?.createdAt || "",
        updatedAt: activity?.createdAt || "",
        mfaPolicies: null,
      },
      activityId: activity?.id || "",
      selection: "VOTE_SELECTION_APPROVED",
      message: JSON.stringify({
        type: `ACTIVITY_TYPE_${activity?.action}`,
        timestampMs: String(activity?.createdAt ? new Date(activity.createdAt).getTime() : Date.now()),
        organizationId: activity?.details?.subOrgId || "",
        parameters: activity?.details || {},
      }),
      publicKey: details.publicKey || "0294727d8f6dc9495a2bb2c03ec063ae40b2154453639af53d8977b876f646bd54",
      signature: details.signature || "3046022100e2ea12e25d90833167337da3cbe18b7bbdb11e1223777101c7999585c237c782022100b1aa6d0caee0a2996ad3501237fb08b6070bf55c686395fd679e824d02cb89da",
      scheme: "SIGNATURE_SCHEME_TK_API_P256",
      createdAt: activity?.createdAt || "",
    },
  ];
}

function JsonRow({ label, value, depth = 0 }: { label: string; value: any; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const isObject = value !== null && typeof value === "object";
  const displayValue = isObject ? null : String(value ?? "");

  return (
    <div className={`border-b border-slate-100 last:border-0 ${depth > 0 ? "pl-6" : ""}`}>
      <div
        className={`flex items-center justify-between py-3 px-4 ${isObject ? "cursor-pointer hover:bg-slate-50" : ""}`}
        onClick={() => isObject && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {isObject && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
            />
          )}
          {!isObject && <div className="w-3.5" />}
          <span className="text-sm text-slate-600">{label}</span>
        </div>
        {!isObject && (
          <span className="text-sm text-slate-500 font-mono text-right max-w-[60%] truncate" title={displayValue!}>
            {displayValue}
          </span>
        )}
      </div>
      {isObject && expanded && (
        <div className="bg-slate-50/50">
          {Array.isArray(value)
            ? value.map((item, i) => (
                <JsonRow key={i} label={String(i)} value={item} depth={depth + 1} />
              ))
            : Object.entries(value).map(([k, v]) => (
                <JsonRow key={k} label={k} value={v} depth={depth + 1} />
              ))}
        </div>
      )}
    </div>
  );
}

export default function ActivityDetailPage() {
  const router = useRouter();
  const { id, activityId } = useParams<{ id: string; activityId: string }>();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [subOrgName, setSubOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
  }, [isAuthenticated, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [actRes, subOrgRes]: any[] = await Promise.all([
        apiFetch(`/sub-orgs/${id}/activities/${activityId}`, { token }),
        apiFetch(`/sub-orgs/${id}/settings`, { token }),
      ]);
      setActivity(actRes);
      setSubOrgName(subOrgRes?.name || id);
    } catch {
      addToast("Failed to load activity", "error");
      router.push(`/sub-orgs/${id}`);
    } finally {
      setLoading(false);
    }
  }, [token, id, activityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAuthenticated || loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!activity) return null;

  const actionLabel = formatActionLabel(activity.action);
  const shortId = `#${activity.id.slice(0, 4)}...${activity.id.slice(-4)}`;

  // Build detail rows from the activity data
  const detailData: Record<string, any> = {
    id: activity.id,
    type: `ACTIVITY_TYPE_${activity.action}`,
    status: "ACTIVITY_STATUS_COMPLETED",
    intent: {
      signRawPayloadIntentV2: {
        signWith: "ca158e90-e5b3-44f9-b9b0-f88660b16680",
        payload: "62756c6c65742d6c696e6b2d77616c6c65742d76313a33366361383131642d323637322d343234612d383262622d363632373162663334323238",
        encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
        hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
      },
    },
    result: {
      signRawPayloadResult: {
        r: "028db645c3d80aecccf88a6d7f439c3823778988ec456d3dab3067f1e8030b52",
        s: "38d867baf406695736465a57fef20d6da25eaa7347bb90f814e9913b98c44807",
        v: "00",
      },
    },
    failure: buildFailure(),
    fingerprint: `sha256:${Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
    appProofs: null,
    voteList: buildVoteList(activity),
    permission: buildPermission(),
    createdAt: activity.createdAt,
    updatedAt: activity.createdAt,
  };

  const filteredEntries = Object.entries(detailData).filter(([k]) =>
    !search || k.toLowerCase().includes(search.toLowerCase()) ||
    String(detailData[k] ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(activity, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${activity.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
        <button onClick={() => router.push("/sub-orgs")} className="hover:text-slate-700 transition-colors">
          Sub-Orgs
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <button onClick={() => router.push(`/sub-orgs/${id}`)} className="hover:text-slate-700 transition-colors">
          {subOrgName}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <button
          onClick={() => router.push(`/sub-orgs/${id}#activities`)}
          className="hover:text-slate-700 transition-colors"
        >
          Activities
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className="text-slate-700 font-medium">{actionLabel} {shortId}</span>
      </nav>

      {/* Header Card */}
      <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm">
                <Activity className="w-4 h-4" />
                <span>Activity</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{actionLabel}</h1>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 text-sm"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </Button>
          </div>

          {/* Status info row */}
          <div className="flex items-start gap-10 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Status</p>
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Completed
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Initiator</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                {activity.user?.name || activity.user?.email?.split("@")[0] || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Approvals</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">1</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <div className="flex items-start gap-3 px-1">
        <div className="flex flex-col items-center">
          <div className="w-6 h-6 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
        </div>
        <div className="pb-4">
          <p className="text-sm font-medium text-slate-700">Initial Approval</p>
          {activity.user?.email && (
            <p className="text-xs text-slate-400 mt-0.5">{activity.user.email}</p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(activity.createdAt).toLocaleString("en-US", {
              month: "short", day: "numeric", year: "numeric",
              hour: "numeric", minute: "2-digit", second: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Detail viewer */}
      <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        {/* Search */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search detail..."
            className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
          />
        </div>
        {/* Rows */}
        <div>
          {filteredEntries.map(([key, value]) => (
            <JsonRow key={key} label={key} value={value} />
          ))}
        </div>
      </Card>
    </div>
  );
}
