import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Trash2, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AbVariant {
  id: string;
  label: string;
  subject: string;
  htmlBody: string;
  plainBody: string;
  fromAddress: string;
  scheduledAt: string;
}

interface AbTestEditorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  variants: AbVariant[];
  onVariantsChange: (variants: AbVariant[]) => void;
  /** Base values from the main compose form to use as defaults */
  baseSubject: string;
  baseHtmlBody: string;
  basePlainBody: string;
  baseFromAddress: string;
}

const VARIANT_LABELS = ["A", "B", "C", "D", "E"];

function createVariant(index: number, base: Partial<AbVariant> = {}): AbVariant {
  return {
    id: crypto.randomUUID(),
    label: VARIANT_LABELS[index] || `V${index + 1}`,
    subject: base.subject || "",
    htmlBody: base.htmlBody || "",
    plainBody: base.plainBody || "",
    fromAddress: base.fromAddress || "",
    scheduledAt: base.scheduledAt || "",
  };
}

export function AbTestEditor({
  enabled,
  onEnabledChange,
  variants,
  onVariantsChange,
  baseSubject,
  baseHtmlBody,
  basePlainBody,
  baseFromAddress,
}: AbTestEditorProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const handleEnable = (on: boolean) => {
    onEnabledChange(on);
    if (on && variants.length === 0) {
      // Pre-create two variants from base values
      onVariantsChange([
        createVariant(0, { subject: baseSubject, htmlBody: baseHtmlBody, plainBody: basePlainBody, fromAddress: baseFromAddress }),
        createVariant(1, { subject: baseSubject, htmlBody: baseHtmlBody, plainBody: basePlainBody, fromAddress: baseFromAddress }),
      ]);
    }
  };

  const addVariant = () => {
    if (variants.length >= 5) return;
    onVariantsChange([
      ...variants,
      createVariant(variants.length, { subject: baseSubject, htmlBody: baseHtmlBody, plainBody: basePlainBody, fromAddress: baseFromAddress }),
    ]);
  };

  const removeVariant = (idx: number) => {
    if (variants.length <= 2) return;
    const updated = variants.filter((_, i) => i !== idx).map((v, i) => ({
      ...v,
      label: VARIANT_LABELS[i] || `V${i + 1}`,
    }));
    onVariantsChange(updated);
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const updateVariant = (idx: number, partial: Partial<AbVariant>) => {
    const updated = variants.map((v, i) => (i === idx ? { ...v, ...partial } : v));
    onVariantsChange(updated);
  };

  const splitPct = variants.length > 0 ? Math.floor(100 / variants.length) : 0;

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">A/B Testing</span>
        </div>
        <Switch checked={enabled} onCheckedChange={handleEnable} />
      </div>

      {enabled && (
        <div className="px-5 pb-5 space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
            <p className="text-xs text-primary font-medium">
              Recipients will be split evenly ({splitPct}% each) across {variants.length} variant{variants.length > 1 ? "s" : ""}. Winner is auto-selected by highest click rate.
            </p>
          </div>

          {/* Variant tabs */}
          <div className="space-y-3">
            {variants.map((variant, idx) => (
              <Collapsible
                key={variant.id}
                open={expandedIdx === idx}
                onOpenChange={(open) => setExpandedIdx(open ? idx : null)}
              >
                <div className="border border-border rounded-md">
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                        idx === 0 ? "bg-primary text-primary-foreground" :
                        idx === 1 ? "bg-success text-success-foreground" :
                        "bg-warning text-warning-foreground"
                      )}>
                        {variant.label}
                      </span>
                      <span className="text-sm font-medium">Variant {variant.label}</span>
                      {variant.subject && (
                        <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
                          — {variant.subject}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {variants.length > 2 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeVariant(idx); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {expandedIdx === idx ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="px-4 pb-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Subject Line</Label>
                      <Input
                        placeholder="Subject for this variant"
                        value={variant.subject}
                        onChange={(e) => updateVariant(idx, { subject: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">From Address</Label>
                      <Input
                        placeholder="sender@domain.com"
                        value={variant.fromAddress}
                        onChange={(e) => updateVariant(idx, { fromAddress: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Send Time (optional override)</Label>
                      <Input
                        type="datetime-local"
                        value={variant.scheduledAt}
                        onChange={(e) => updateVariant(idx, { scheduledAt: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Tabs defaultValue="html">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Email Body</Label>
                          <TabsList className="h-7">
                            <TabsTrigger value="html" className="text-[10px] px-2 py-0.5">HTML</TabsTrigger>
                            <TabsTrigger value="plain" className="text-[10px] px-2 py-0.5">Plain</TabsTrigger>
                          </TabsList>
                        </div>
                        <TabsContent value="html">
                          <Textarea
                            className="min-h-[150px] font-mono text-xs"
                            value={variant.htmlBody}
                            onChange={(e) => updateVariant(idx, { htmlBody: e.target.value })}
                            placeholder="HTML body for this variant"
                          />
                        </TabsContent>
                        <TabsContent value="plain">
                          <Textarea
                            className="min-h-[150px] text-xs"
                            value={variant.plainBody}
                            onChange={(e) => updateVariant(idx, { plainBody: e.target.value })}
                            placeholder="Plain text for this variant"
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>

          {variants.length < 5 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addVariant}>
              <Plus className="h-3 w-3" /> Add Variant ({VARIANT_LABELS[variants.length]})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
