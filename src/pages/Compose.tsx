import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, Plus, Trash2, Monitor, Smartphone, Send } from "lucide-react";
import { useState } from "react";

export default function Compose() {
  const [headers, setHeaders] = useState([{ key: "", value: "" }]);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Compose Email</h1>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Form */}
          <div className="xl:col-span-3 space-y-5">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noreply@edapost.io">noreply@edapost.io</SelectItem>
                      <SelectItem value="hello@edapost.io">hello@edapost.io</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reply-To</Label>
                  <Input placeholder="reply@example.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input placeholder="recipient@example.com or upload CSV" />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input placeholder="Email subject line" />
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Load a saved template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="welcome">Welcome Email</SelectItem>
                    <SelectItem value="invoice">Invoice Template</SelectItem>
                    <SelectItem value="reset">Password Reset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Body */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <Tabs defaultValue="html">
                <div className="flex items-center justify-between">
                  <Label>Body</Label>
                  <TabsList className="h-8">
                    <TabsTrigger value="html" className="text-xs">HTML</TabsTrigger>
                    <TabsTrigger value="plain" className="text-xs">Plain Text</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="html">
                  <Textarea
                    className="min-h-[200px] font-mono text-sm"
                    defaultValue={`<html>\n  <body>\n    <h1>Hello!</h1>\n  </body>\n</html>`}
                  />
                </TabsContent>
                <TabsContent value="plain">
                  <Textarea placeholder="Plain text content..." className="min-h-[200px] text-sm" />
                </TabsContent>
              </Tabs>
            </div>

            {/* Advanced Options */}
            <Collapsible>
              <div className="bg-card border border-border rounded-lg">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-5">
                  <span className="text-sm font-medium">Advanced Options</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-5 pb-5 space-y-5">
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Custom Headers</Label>
                    {headers.map((h, i) => (
                      <div key={i} className="flex gap-2">
                        <Input placeholder="Header name" value={h.key} onChange={(e) => {
                          const copy = [...headers]; copy[i].key = e.target.value; setHeaders(copy);
                        }} className="flex-1" />
                        <Input placeholder="Value" value={h.value} onChange={(e) => {
                          const copy = [...headers]; copy[i].value = e.target.value; setHeaders(copy);
                        }} className="flex-1" />
                        <Button variant="ghost" size="icon" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setHeaders([...headers, { key: "", value: "" }])}>
                      <Plus className="h-3 w-3 mr-1" /> Add Header
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between bg-secondary rounded-md p-3">
                      <span className="text-sm">Open Tracking</span>
                      <Switch />
                    </div>
                    <div className="flex items-center justify-between bg-secondary rounded-md p-3">
                      <span className="text-sm">Click Tracking</span>
                      <Switch />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Schedule Send</Label>
                    <Input type="datetime-local" />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            <div className="flex gap-3">
              <Button variant="outline" className="gap-2"><Send className="h-4 w-4" /> Send Test Email</Button>
              <Button className="gap-2"><Send className="h-4 w-4" /> Send</Button>
            </div>
          </div>

          {/* Preview */}
          <div className="xl:col-span-2">
            <div className="bg-card border border-border rounded-lg p-5 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Preview</h3>
                <div className="flex gap-1 bg-secondary rounded-md p-0.5">
                  <button
                    onClick={() => setPreviewMode("desktop")}
                    className={`p-1.5 rounded ${previewMode === "desktop" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPreviewMode("mobile")}
                    className={`p-1.5 rounded ${previewMode === "mobile" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                  >
                    <Smartphone className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className={`bg-secondary rounded-md border border-border mx-auto ${previewMode === "mobile" ? "max-w-[320px]" : "w-full"}`}>
                <div className="p-4 min-h-[400px] flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Email preview will render here</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
