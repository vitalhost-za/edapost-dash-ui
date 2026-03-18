import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tags } from "lucide-react";

const MERGE_TAGS = [
  { tag: "{{name}}", description: "Full name" },
  { tag: "{{first_name}}", description: "First name" },
  { tag: "{{last_name}}", description: "Last name" },
  { tag: "{{email}}", description: "Email address" },
  { tag: "{{date}}", description: "Current date" },
  { tag: "{{year}}", description: "Current year" },
  { tag: "{{unsubscribe_url}}", description: "Unsubscribe link" },
];

interface MergeTagPickerProps {
  onInsert: (tag: string) => void;
}

export function MergeTagPicker({ onInsert }: MergeTagPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
          <Tags className="h-3 w-3" /> Merge Tags
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-[10px] text-muted-foreground font-medium mb-1.5 px-1">
          Click to insert at cursor
        </p>
        <div className="space-y-0.5">
          {MERGE_TAGS.map((m) => (
            <button
              key={m.tag}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors text-left"
              onClick={() => onInsert(m.tag)}
            >
              <code className="font-mono text-primary text-[11px]">{m.tag}</code>
              <span className="text-muted-foreground text-[10px]">{m.description}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Replace merge tags in a template string */
export function replaceMergeTags(
  template: string,
  recipient: { email: string; name?: string | null }
): string {
  const name = recipient.name || "";
  const firstName = name.split(/\s+/)[0] || "";
  const lastName = name.split(/\s+/).slice(1).join(" ") || "";

  return template
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*full_name\s*\}\}/gi, name)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*last_name\s*\}\}/gi, lastName)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, "#unsubscribe")
    .replace(/\{\{\s*date\s*\}\}/gi, new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))
    .replace(/\{\{\s*year\s*\}\}/gi, new Date().getFullYear().toString());
}

export { MERGE_TAGS };
