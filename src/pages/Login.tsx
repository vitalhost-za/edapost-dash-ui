import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(217, 91%, 60%) 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />

      <div className="relative w-full max-w-sm mx-4">
        <div className="bg-card border border-border rounded-lg p-8 shadow-xl">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">EdaPost</span>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="admin@edapost.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••" />
            </div>
            <Button className="w-full">Sign In</Button>
          </form>

          <div className="mt-4 text-center">
            <button className="text-xs text-primary hover:underline">Forgot password?</button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Self-hosted email infrastructure by EdaPost
        </p>
      </div>
    </div>
  );
}
