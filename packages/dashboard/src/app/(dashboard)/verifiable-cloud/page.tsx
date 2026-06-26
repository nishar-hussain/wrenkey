"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { Card, CardContent } from "@/components/ui/card";
import { Cloud, Shield, CheckCircle, Cpu } from "lucide-react";

export default function VerifiableCloudPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  useEffect(() => { if (!isAuthenticated) router.push("/login"); }, [isAuthenticated, router]);
  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Verifiable Cloud</h1>
      <p className="text-sm text-slate-500">Trustless execution environment for secure compute</p>

      <Card className="border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Cloud className="w-12 h-12 text-slate-300 mb-4" />
          <h2 className="text-lg font-semibold text-slate-500 mb-2">Coming Later</h2>
          <p className="text-sm text-slate-400 max-w-md">Verifiable Cloud will provide a trustless execution environment powered by zero-knowledge proofs and secure enclaves, enabling fully auditable off-chain compute.</p>
          <div className="mt-6 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: Shield, label: "ZK Proofs", desc: "Zero-knowledge verification" },
              { icon: CheckCircle, label: "Auditable", desc: "Full execution trace" },
              { icon: Cpu, label: "Secure Enclave", desc: "TEE-based compute" },
            ].map(f => (
              <div key={f.label} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <f.icon className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{f.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
