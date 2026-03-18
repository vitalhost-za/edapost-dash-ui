import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link, Image, Type, Heading1, Heading2,
  Monitor, Smartphone, Undo, Redo, Code, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HtmlEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
}

const COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
  "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6",
  "#c0392b", "#d35400", "#f39c12", "#27ae60", "#2980b9", "#8e44ad",
];

export function HtmlEditor({ value, onChange, minHeight = "360px" }: HtmlEditorProps) {
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const editorRef = useRef<HTMLDivElement>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imgUrl, setImgUrl] = useState("");

  // Sync value → editor only on mode switch or initial load
  useEffect(() => {
    if (mode === "visual" && editorRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [mode]);

  // Initial load
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && value) {
      editorRef.current.innerHTML = value;
    }
  }, []);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    syncFromEditor();
  }, []);

  const syncFromEditor = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const insertLink = () => {
    if (!linkUrl) return;
    const html = `<a href="${linkUrl}" style="color:#3498db;text-decoration:underline">${linkText || linkUrl}</a>`;
    exec("insertHTML", html);
    setLinkUrl("");
    setLinkText("");
  };

  const insertImage = () => {
    if (!imgUrl) return;
    exec("insertHTML", `<img src="${imgUrl}" alt="" style="max-width:100%;height:auto" />`);
    setImgUrl("");
  };

  const ToolBtn = ({
    icon: Icon,
    onClick,
    title,
    active,
  }: {
    icon: React.ElementType;
    onClick: () => void;
    title: string;
    active?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded hover:bg-accent transition-colors",
        active && "bg-accent text-primary"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-0.5 pr-2 border-r border-border mr-1">
          <button
            type="button"
            onClick={() => setMode("visual")}
            className={cn(
              "px-2 py-1 text-xs rounded font-medium transition-colors",
              mode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode("code")}
            className={cn(
              "px-2 py-1 text-xs rounded font-medium transition-colors",
              mode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code className="h-3 w-3 inline mr-1" />
            HTML
          </button>
        </div>

        {mode === "visual" && (
          <>
            <ToolBtn icon={Undo} onClick={() => exec("undo")} title="Undo" />
            <ToolBtn icon={Redo} onClick={() => exec("redo")} title="Redo" />
            <div className="w-px h-5 bg-border mx-1" />
            <ToolBtn icon={Heading1} onClick={() => exec("formatBlock", "h1")} title="Heading 1" />
            <ToolBtn icon={Heading2} onClick={() => exec("formatBlock", "h2")} title="Heading 2" />
            <ToolBtn icon={Type} onClick={() => exec("formatBlock", "p")} title="Paragraph" />
            <div className="w-px h-5 bg-border mx-1" />
            <ToolBtn icon={Bold} onClick={() => exec("bold")} title="Bold" />
            <ToolBtn icon={Italic} onClick={() => exec("italic")} title="Italic" />
            <ToolBtn icon={Underline} onClick={() => exec("underline")} title="Underline" />
            <div className="w-px h-5 bg-border mx-1" />
            <ToolBtn icon={AlignLeft} onClick={() => exec("justifyLeft")} title="Align Left" />
            <ToolBtn icon={AlignCenter} onClick={() => exec("justifyCenter")} title="Align Center" />
            <ToolBtn icon={AlignRight} onClick={() => exec("justifyRight")} title="Align Right" />
            <div className="w-px h-5 bg-border mx-1" />
            <ToolBtn icon={List} onClick={() => exec("insertUnorderedList")} title="Bullet List" />
            <ToolBtn icon={ListOrdered} onClick={() => exec("insertOrderedList")} title="Numbered List" />
            <div className="w-px h-5 bg-border mx-1" />

            {/* Color picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" title="Text Color" className="p-1.5 rounded hover:bg-accent transition-colors">
                  <Palette className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <div className="grid grid-cols-6 gap-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => exec("foreColor", c)}
                      className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Link */}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" title="Insert Link" className="p-1.5 rounded hover:bg-accent transition-colors">
                  <Link className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3" align="start">
                <div className="space-y-1.5">
                  <Label className="text-xs">URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Text (optional)</Label>
                  <Input
                    placeholder="Click here"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button size="sm" onClick={insertLink} className="w-full">
                  Insert Link
                </Button>
              </PopoverContent>
            </Popover>

            {/* Image */}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" title="Insert Image" className="p-1.5 rounded hover:bg-accent transition-colors">
                  <Image className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3" align="start">
                <div className="space-y-1.5">
                  <Label className="text-xs">Image URL</Label>
                  <Input
                    placeholder="https://example.com/image.png"
                    value={imgUrl}
                    onChange={(e) => setImgUrl(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button size="sm" onClick={insertImage} className="w-full">
                  Insert Image
                </Button>
              </PopoverContent>
            </Popover>
          </>
        )}

        {/* Preview device toggle */}
        <div className="ml-auto flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setPreviewDevice("desktop")}
            className={cn("p-1 rounded", previewDevice === "desktop" ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewDevice("mobile")}
            className={cn("p-1 rounded", previewDevice === "mobile" ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-border">
        {/* Edit pane */}
        <div style={{ minHeight }}>
          {mode === "visual" ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncFromEditor}
              className="p-4 outline-none prose prose-sm max-w-none text-foreground h-full overflow-y-auto"
              style={{ minHeight }}
            />
          ) : (
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="border-0 rounded-none font-mono text-sm resize-none focus-visible:ring-0 h-full"
              style={{ minHeight }}
            />
          )}
        </div>

        {/* Preview pane */}
        <div className="bg-muted/30 p-4 hidden lg:block" style={{ minHeight }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Preview</p>
          <div
            className={cn(
              "bg-white rounded border border-border mx-auto overflow-hidden transition-all",
              previewDevice === "mobile" ? "max-w-[320px]" : "w-full"
            )}
          >
            <iframe
              srcDoc={value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")}
              className="w-full border-0"
              style={{ minHeight: `calc(${minHeight} - 60px)` }}
              title="Template Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
