"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { verifyLocalAppProofBrowser } from "@wrankey/wvc-verify/browser";

const EXPECTED_PCRS = {
  pcr0: "0000000000000000000000000000000000000000000000000000000000000000",
  pcr1: "0000000000000000000000000000000000000000000000000000000000000001",
  pcr2: "0000000000000000000000000000000000000000000000000000000000000002",
};

interface ProofData {
  id: string;
  ephemeralPubkey: string;
  payloadHash: string;
  payloadType: string;
  signature: string;
  attestationDoc: string;
  proofFormatVersion?: string;
  issuedAt: string;
}

export function ProofVerifyButton({ proof }: { proof: ProofData }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleVerify = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const bundle = {
        proofFormatVersion: proof.proofFormatVersion || "local-dev-v1",
        deploymentId: "",
        ephemeralPubkey: proof.ephemeralPubkey,
        payloadHash: proof.payloadHash,
        payloadType: proof.payloadType as any,
        signature: proof.signature,
        attestationDoc: proof.attestationDoc,
        issuedAt: proof.issuedAt,
      };
      const res = await verifyLocalAppProofBrowser(bundle, EXPECTED_PCRS, {
        maxAgeMs: 60 * 60 * 1000,
      });
      setResult(res);
    } catch (err: any) {
      setResult({ valid: false, reason: err.message || "Verification error" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        onClick={handleVerify}
        disabled={verifying}
        className="w-full"
      >
        {verifying ? "Verifying..." : "Verify Proof in Browser"}
      </Button>

      {result && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            result.valid
              ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
        >
          {result.valid ? (
            <div className="space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <span className="text-green-600">&#10003;</span> Cryptographically Verified
              </p>
              <p className="text-xs text-slate-500">
                Signed at: {new Date(result.signedAt).toISOString()}
              </p>
              {result.enclavePublicKey && (
                <p className="text-xs text-slate-500">
                  Enclave key: {result.enclavePublicKey.slice(0, 24)}...
                </p>
              )}
              {result.pcrs && (
                <p className="text-xs text-slate-500">
                  PCRs: {JSON.stringify(result.pcrs)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-2">
                This proof was verified entirely in your browser using the Web Crypto API.
                No server was involved in the verification.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <span className="text-red-600">&#10007;</span> Verification Failed
              </p>
              <p className="text-xs">{result.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
