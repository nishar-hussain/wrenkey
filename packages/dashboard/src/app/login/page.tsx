"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWranKey } from "@wrankey/sdk/react";

export default function LoginPage() {
  const { loginWithEmail, sendEmailOtp, isLoading } = useWranKey();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await sendEmailOtp(email);
      setStep("otp");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await loginWithEmail(email, otp);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary-600">ArKey</h1>
            <p className="text-gray-500 mt-2">AI-Native Wallet & Agent Platform</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendOtp}>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="you@example.com"
                required
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-4 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Sending..." : "Send OTP"}
              </button>
              <p className="text-xs text-gray-400 text-center mt-4">
                In development mode, check server console for OTP
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter OTP sent to {email}
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="000000"
                required
                maxLength={6}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-4 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Verifying..." : "Sign In"}
              </button>
              <button type="button" onClick={() => setStep("email")} className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-gray-700">
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
