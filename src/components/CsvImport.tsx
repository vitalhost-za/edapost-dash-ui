import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ParsedRecipient {
  email: string;
  name?: string;
}

interface CsvImportProps {
  onImport: (recipients: ParsedRecipient[]) => void;
}

function parseCSV(text: string): ParsedRecipient[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  // Parse header
  const headerCols = firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const emailIdx = headerCols.findIndex((h) =>
    ["email", "e-mail", "email_address", "emailaddress", "mail"].includes(h)
  );
  const nameIdx = headerCols.findIndex((h) =>
    ["name", "full_name", "fullname", "display_name", "first_name", "firstname"].includes(h)
  );

  const hasHeader = emailIdx !== -1;
  const eIdx = hasHeader ? emailIdx : 0;
  const nIdx = hasHeader ? nameIdx : -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const results: ParsedRecipient[] = [];
  const seen = new Set<string>();

  for (const line of dataLines) {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const email = cols[eIdx]?.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    results.push({
      email,
      name: nIdx >= 0 ? cols[nIdx]?.trim() || undefined : undefined,
    });
  }

  return results;
}

export function CsvImport({ onImport }: CsvImportProps) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRecipient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((f: File) => {
    setError(null);
    setParsed(null);

    if (!f.name.match(/\.(csv|tsv|txt)$/i)) {
      setError("Please upload a CSV, TSV, or TXT file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum 5 MB.");
      return;
    }

    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const recipients = parseCSV(text);
      if (recipients.length === 0) {
        setError("No valid email addresses found. Ensure your CSV has an 'email' column.");
        return;
      }
      setParsed(recipients);
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  const handleConfirm = () => {
    if (!parsed) return;
    onImport(parsed);
    toast.success(`${parsed.length} recipients imported`);
    setFile(null);
    setParsed(null);
  };

  const reset = () => {
    setFile(null);
    setParsed(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {!parsed && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) processFile(f);
            }}
          />
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground">
            Drop a CSV file or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            CSV with an "email" column. Optional "name" column. Max 5 MB.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Preview */}
      {parsed && (
        <div className="bg-secondary/50 border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{file?.name}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-foreground font-medium">{parsed.length}</span>
            <span className="text-muted-foreground">valid recipients found</span>
            {parsed.some((r) => r.name) && (
              <span className="text-muted-foreground">
                · {parsed.filter((r) => r.name).length} with names
              </span>
            )}
          </div>

          {/* Sample */}
          <div className="max-h-[120px] overflow-y-auto text-xs font-mono bg-background rounded border border-border p-2 space-y-0.5">
            {parsed.slice(0, 10).map((r, i) => (
              <div key={i} className="text-muted-foreground">
                {r.name ? `${r.name} <${r.email}>` : r.email}
              </div>
            ))}
            {parsed.length > 10 && (
              <div className="text-muted-foreground/60">
                … and {parsed.length - 10} more
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirm} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Import {parsed.length} Recipients
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
