import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
        <div className="bg-card border border-border rounded-lg p-8 shadow-xl">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight">EdaPost</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="admin@edapost.io" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" defaultValue="password123" />
            </div>
            <Button className="w-full">Sign In</Button>
          </form>

          <div className="mt-4 text-center">
            <button className="text-xs text-primary hover:underline">Forgot password?</button>
          </div>
        </div>
      </div>
    </div>
  );
}
