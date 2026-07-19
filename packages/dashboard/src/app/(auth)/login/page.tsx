"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Trash2, UserPlus, LogIn, User, ChevronRight, KeyRound } from "lucide-react";

type Step = "accounts" | "signin" | "signup" | "otp-verify";

interface StoredAccount {
  email: string;
  orgName: string;
  lastUsed: number;
}

interface LookupResult {
  exists: boolean;
  email?: string;
  org?: { id: string; name: string };
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [source, setSource] = useState("");
  const [otp, setOtp] = useState("");

  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [existingUserFlow, setExistingUserFlow] = useState(false);

  useEffect(() => {
    try {
      // Migrate legacy single-account format to multi-account format
      const legacyRaw = localStorage.getItem("wrankey_remembered_user");
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (legacy?.email) {
          const accountsStr = localStorage.getItem("wrankey_accounts");
          const existing: StoredAccount[] = accountsStr ? JSON.parse(accountsStr) : [];
          if (!existing.find(a => a.email === legacy.email)) {
            existing.push({ email: legacy.email, orgName: legacy.orgName || "", lastUsed: Date.now() });
          }
          existing.sort((a, b) => b.lastUsed - a.lastUsed);
          localStorage.setItem("wrankey_accounts", JSON.stringify(existing));
        }
        localStorage.removeItem("wrankey_remembered_user");
      }

      const raw = localStorage.getItem("wrankey_accounts");
      if (!raw) {
        setStep("signin");
        return;
      }
      const parsed: StoredAccount[] = JSON.parse(raw);
      if (parsed && parsed.length > 0) {
        setAccounts(parsed);
        setStep("accounts");
      } else {
        setStep("signin");
      }
    } catch {
      setStep("signin");
    }
  }, []);

  const doLogin = (res: any, orgNameAlreadySet?: boolean) => {
    login(
      res.sessionToken,
      { id: res.user.id, email: res.user.email || res.user.phone, role: res.user.role },
      { id: res.org.id, name: res.org.name },
    );
    const needsOnboarding = res.isNewUser && !orgNameAlreadySet;
    router.push(needsOnboarding ? "/onboarding" : "/");
  };

  const sendOtpAndGoToVerify = async (emailAddr: string, isExisting?: boolean) => {
    if (!emailAddr || loading) return;
    setLoading(true);
    setError("");
    try {
      const lookupRes: any = await apiFetch("/auth/email/lookup", {
        method: "POST",
        body: JSON.stringify({ email: emailAddr }),
      }).catch(() => ({ exists: false }));
      setLookupResult(lookupRes);
      const effectiveExisting = isExisting ?? lookupRes.exists;
      setExistingUserFlow(effectiveExisting);

      const body: any = { email: emailAddr };
      if (!effectiveExisting && orgName) body.orgName = orgName;

      const sendRes: any = await apiFetch("/auth/email/send", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStep("otp-verify");
      if (sendRes.emailSent === false) {
        setError(sendRes.message || "Email could not be sent.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleAccountClick = async (account: StoredAccount) => {
    setEmail(account.email);
    setOrgName(account.orgName);
    await sendOtpAndGoToVerify(account.email, true);
  };

  const handleSigninSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    await sendOtpAndGoToVerify(email);
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !orgName || loading) return;
    await sendOtpAndGoToVerify(email, false);
  };

  const handleRemoveAccount = (emailToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = accounts.filter(a => a.email !== emailToRemove);
    setAccounts(updated);
    localStorage.setItem("wrankey_accounts", JSON.stringify(updated));
    if (updated.length === 0) {
      setStep("signup");
    }
  };

  const goToSignin = () => {
    setEmail("");
    setStep("signin");
  };

  const goToSignup = () => {
    setEmail("");
    setFullName("");
    setOrgName("");
    setSource("");
    setStep("signup");
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const body: any = { email, otp };
      const isExisting = existingUserFlow || lookupResult?.exists;

      if (isExisting && lookupResult?.org?.id) {
        body.orgId = lookupResult.org.id;
      } else if (!isExisting) {
        if (orgName) body.orgName = orgName;
        if (fullName) body.name = fullName;
        if (source) body.tags = [`source:${source}`];
      }

      const res: any = await apiFetch("/auth/email/verify", {
        method: "POST",
        body: JSON.stringify(body),
      });
      doLogin(res, !!isExisting);
    } catch (err: any) {
      setError(err.message || "Invalid OTP code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-[420px] border border-border shadow-xl rounded-2xl bg-card overflow-hidden p-8">
        <CardContent className="p-0">
          {error && (
            <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          {/* Step: Accounts List */}
          {step === "accounts" && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
                  <LogIn className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground tracking-tight">Welcome Back</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose an account to sign in</p>
              </div>

              <div className="space-y-2">
                {accounts.map((account) => (
                  <div key={account.email} className="border border-border rounded-xl overflow-hidden bg-card">
                    <div
                      onClick={() => handleAccountClick(account)}
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted border border-border text-muted-foreground group-hover:border-primary/40 transition-colors">
                          <User className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight truncate">
                            {account.email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {account.orgName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <button
                          type="button"
                          onClick={(e) => handleRemoveAccount(account.email, e)}
                          className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors ml-1"
                          title="Remove account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={goToSignin}
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center"
                >
                  Sign in with a different account
                </button>
                <button
                  type="button"
                  onClick={goToSignup}
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center"
                >
                  Create a new account
                </button>
              </div>
            </div>
          )}

          {/* Step: Sign In (existing user, email only) */}
          {step === "signin" && (
            <form onSubmit={handleSigninSubmit} className="space-y-4">
              <div className="flex justify-center mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
                  <LogIn className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <h2 className="text-xl font-semibold text-center text-foreground tracking-tight mb-6">
                Sign In
              </h2>

              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 px-4 rounded-lg transition-colors"
                autoFocus
              />

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 font-medium rounded-lg text-sm mt-6 transition-colors shadow-sm"
              >
                {loading ? "Checking..." : "Continue"}
              </Button>

              <div className="text-center mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail("");
                    if (accounts.length > 0) {
                      setStep("accounts");
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors block w-full"
                >
                  {accounts.length > 0 ? "← Back to accounts" : ""}
                </button>
                <button
                  type="button"
                  onClick={goToSignup}
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors block w-full"
                >
                  Create a new account
                </button>
              </div>
            </form>
          )}

          {/* Step: Sign Up (new user, full form) */}
          {step === "signup" && (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="flex justify-center mb-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
                  <UserPlus className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <h2 className="text-xl font-semibold text-center text-foreground tracking-tight mb-6">
                Create Your WranKey Account
              </h2>

              <div className="space-y-3">
                <Input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11 px-4 rounded-lg transition-colors"
                />

                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 px-4 rounded-lg transition-colors"
                />

                <Input
                  type="text"
                  placeholder="Organization name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className="h-11 px-4 rounded-lg transition-colors"
                />

                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-11 px-4 rounded-lg text-muted-foreground text-left transition-colors focus:ring-offset-0">
                    <SelectValue placeholder="How did you hear about us?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Search</SelectItem>
                    <SelectItem value="friend">Friend / Colleague</SelectItem>
                    <SelectItem value="social">Social Media</SelectItem>
                    <SelectItem value="blog">Blog Post / Article</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 font-medium rounded-lg text-sm mt-6 transition-colors shadow-sm"
              >
                {loading ? "Checking..." : "Continue"}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground mt-6 leading-relaxed px-4">
                By continuing, you agree to WranKey's{" "}
                <a href="#" className="underline hover:text-foreground transition-colors font-medium">Terms and Conditions</a>{" "}
                and{" "}
                <a href="#" className="underline hover:text-foreground transition-colors font-medium">Privacy Policy</a>.
              </p>

              {accounts.length > 0 && (
                <div className="text-center mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail("");
                      setFullName("");
                      setOrgName("");
                      setSource("");
                      setStep("accounts");
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
                  >
                    ← Back to accounts
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Step: OTP Verification */}
          {step === "otp-verify" && (
            <form onSubmit={verifyOtp} className="space-y-6">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
                  <KeyRound className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground tracking-tight">Verify Your Email</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Code sent to <strong className="text-foreground font-semibold">{email}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  required
                  maxLength={6}
                  autoFocus
                  className="h-11 text-center font-mono text-lg tracking-widest rounded-lg transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </Button>

              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setOtp("");
                    if (accounts.length > 0) {
                      setStep("accounts");
                    } else {
                      setStep("signin");
                      setEmail("");
                      setFullName("");
                      setOrgName("");
                      setSource("");
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
