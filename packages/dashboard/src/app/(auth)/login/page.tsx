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

type Step = "signup" | "welcome-back" | "otp-verify";

interface RememberedUser {
  email: string;
  orgName: string;
}

interface LookupResult {
  exists: boolean;
  email?: string;
  org?: { id: string; name: string };
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("signup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [source, setSource] = useState("");
  const [otp, setOtp] = useState("");

  const [rememberedUser, setRememberedUser] = useState<RememberedUser | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  // Initialize and check for remembered user on mount
  useEffect(() => {
    const saved = localStorage.getItem("wrankey_remembered_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email) {
          setRememberedUser(parsed);
          setStep("welcome-back");
          setEmail(parsed.email);
        }
      } catch (e) {
        console.error("Error parsing remembered user:", e);
      }
    }
  }, []);

  const doLogin = (res: any, orgNameAlreadySet?: boolean) => {
    login(
      res.sessionToken,
      { id: res.user.id, email: res.user.email || res.user.phone, role: res.user.role },
      { id: res.org.id, name: res.org.name },
    );
    // Remember user in localStorage
    localStorage.setItem(
      "wrankey_remembered_user",
      JSON.stringify({ email: res.user.email, orgName: res.org.name })
    );
    // Only send to onboarding if truly a new user AND they didn't already name their org in the signup form
    const needsOnboarding = res.isNewUser && !orgNameAlreadySet;
    router.push(needsOnboarding ? "/onboarding" : "/");
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !orgName || loading) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await apiFetch("/auth/email/lookup", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setLookupResult(res);

      if (res.exists) {
        setRememberedUser({
          email: res.email,
          orgName: res.org?.name || "My Organization",
        });
      }

      const body: any = { email };
      if (orgName) body.orgName = orgName;
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

  const handleRememberedUserClick = async () => {
    if (!email || loading) return;
    setLoading(true);
    setError("");
    try {
      const sendRes: any = await apiFetch("/auth/email/send", {
        method: "POST",
        body: JSON.stringify({ email }),
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

  const handleRemoveRememberedUser = () => {
    localStorage.removeItem("wrankey_remembered_user");
    setRememberedUser(null);
    setLookupResult(null);
    setEmail("");
    setOrgName("");
    setFullName("");
    setSource("");
    setStep("signup");
  };

  const handleDifferentEmail = () => {
    setRememberedUser(null);
    setLookupResult(null);
    setEmail("");
    setOrgName("");
    setFullName("");
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
      const isExisting = lookupResult?.exists || (rememberedUser?.email === email);

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

          {/* ── Step 1: Create Account / Signup ───────────────── */}
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
            </form>
          )}

          {/* ── Step 2: Welcome Back ────────────────── */}
          {step === "welcome-back" && rememberedUser && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
                  <LogIn className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground tracking-tight">Welcome Back</h2>
                <p className="text-sm text-muted-foreground mt-1">Continue to sign in</p>
              </div>

              <div 
                onClick={handleRememberedUserClick}
                className="border border-border hover:border-primary/40 cursor-pointer rounded-xl p-4 bg-card flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted border border-border text-muted-foreground group-hover:border-primary/40 transition-colors">
                    <User className="w-5 h-5 stroke-[1.5]" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      {rememberedUser.email}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rememberedUser.orgName}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button 
                    type="button" 
                    onClick={handleRememberedUserClick} 
                    disabled={loading} 
                    className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button 
                    type="button" 
                    onClick={handleRemoveRememberedUser} 
                    className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={handleDifferentEmail}
                  className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  Or enter a different email
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: OTP verification ─────────────── */}
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
                    if (rememberedUser && rememberedUser.email === email) {
                      setStep("welcome-back");
                    } else {
                      setStep("signup");
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to sign in
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
