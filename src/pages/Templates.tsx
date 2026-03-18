import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { HtmlEditor } from "@/components/HtmlEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Loader2, Trash2, Edit, Copy, Star, StarOff,
  FileText, LayoutTemplate, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Template {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  html_body: string;
  plain_body: string | null;
  category: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ["custom", "welcome", "newsletter", "transactional", "notification", "marketing"];

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #f4f4f7; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #3b82f6; padding: 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
    .content { padding: 32px 24px; }
    .content h2 { color: #1f2937; margin-top: 0; }
    .content p { color: #4b5563; line-height: 1.6; }
    .btn { display: inline-block; background: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .footer { padding: 24px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Company</h1>
    </div>
    <div class="content">
      <h2>Hello!</h2>
      <p>This is a starter email template. Edit it to match your brand and message.</p>
      <p><a href="#" class="btn">Call to Action</a></p>
    </div>
    <div class="footer">
      <p>&copy; 2026 Your Company. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

export default function Templates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formCategory, setFormCategory] = useState("custom");
  const [formHtml, setFormHtml] = useState(DEFAULT_HTML);
  const [formPlain, setFormPlain] = useState("");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates", categoryFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("email_templates")
        .select("*")
        .order("updated_at", { ascending: false });

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }
      if (search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Template[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formName.trim()) throw new Error("Template name is required");

      const payload = {
        user_id: user!.id,
        name: formName.trim(),
        description: formDescription.trim() || null,
        subject: formSubject.trim(),
        html_body: formHtml,
        plain_body: formPlain.trim() || null,
        category: formCategory,
      };

      if (editId) {
        const { error } = await supabase.from("email_templates").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success(editId ? "Template updated" : "Template created");
      closeEditor();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteId(null);
      toast.success("Template deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from("email_templates").update({ is_favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-templates"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: Template) => {
      const { error } = await supabase.from("email_templates").insert({
        user_id: user!.id,
        name: `${template.name} (copy)`,
        description: template.description,
        subject: template.subject,
        html_body: template.html_body,
        plain_body: template.plain_body,
        category: template.category,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template duplicated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNewEditor = () => {
    setEditId(null);
    setFormName("");
    setFormDescription("");
    setFormSubject("");
    setFormCategory("custom");
    setFormHtml(DEFAULT_HTML);
    setFormPlain("");
    setEditorOpen(true);
  };

  const openEditEditor = (t: Template) => {
    setEditId(t.id);
    setFormName(t.name);
    setFormDescription(t.description || "");
    setFormSubject(t.subject);
    setFormCategory(t.category);
    setFormHtml(t.html_body);
    setFormPlain(t.plain_body || "");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditId(null);
  };

  if (editorOpen) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {editId ? "Edit Template" : "New Template"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Design your email template with the visual editor.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeEditor}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gap-1.5"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editId ? "Update Template" : "Save Template"}
              </Button>
            </div>
          </div>

          {/* Meta fields */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Name *</Label>
                <Input
                  placeholder="e.g., Welcome Email"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subject Line</Label>
                <Input
                  placeholder="Email subject"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  placeholder="Brief description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* HTML Editor */}
          <HtmlEditor value={formHtml} onChange={setFormHtml} minHeight="400px" />

          {/* Plain text fallback */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-2">
            <Label className="text-xs">Plain Text Fallback</Label>
            <Textarea
              placeholder="Optional plain text version…"
              value={formPlain}
              onChange={(e) => setFormPlain(e.target.value)}
              className="min-h-[100px] text-sm"
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">Create reusable email templates for your campaigns.</p>
          </div>
          <Button className="gap-2" onClick={openNewEditor}>
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>

        {/* Toolbar */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates…"
                className="pl-9 bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="bg-background border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors group"
                >
                  {/* Thumbnail / preview */}
                  <div className="relative h-36 bg-muted/50 overflow-hidden">
                    <iframe
                      srcDoc={t.html_body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")}
                      className="w-full h-full border-0 pointer-events-none scale-[0.5] origin-top-left"
                      style={{ width: "200%", height: "200%" }}
                      title={t.name}
                      sandbox="allow-same-origin"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPreviewTemplate(t)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                    <button
                      onClick={() => toggleFavorite.mutate({ id: t.id, is_favorite: !t.is_favorite })}
                      className="absolute top-2 left-2"
                    >
                      {t.is_favorite ? (
                        <Star className="h-4 w-4 text-warning fill-warning" />
                      ) : (
                        <StarOff className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  </div>

                  <div className="p-3 space-y-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground truncate">{t.name}</h3>
                      {t.subject && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {t.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex gap-1 pt-1 border-t border-border">
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => openEditEditor(t)}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => duplicateMutation.mutate(t)}>
                        <Copy className="h-3 w-3 mr-1" /> Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(t.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted mb-3">
                <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No templates yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first email template to speed up campaign creation.
              </p>
              <Button onClick={openNewEditor} className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> New Template
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
            <DialogDescription>{previewTemplate?.subject || "No subject"}</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="bg-white rounded border border-border overflow-hidden">
              <iframe
                srcDoc={previewTemplate.html_body}
                className="w-full min-h-[500px] border-0"
                title="Template Preview"
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this email template. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
