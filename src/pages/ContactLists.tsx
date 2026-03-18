import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, Upload, Loader2, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { CsvImport } from "@/components/CsvImport";
import { format } from "date-fns";

export default function ContactLists() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editListId, setEditListId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addContactOpen, setAddContactOpen] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");

  const { data: lists, isLoading } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["contact-list-members", editListId],
    enabled: !!editListId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_list_members")
        .select("*")
        .eq("list_id", editListId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contact_lists").insert({
        user_id: user!.id,
        name: newName.trim(),
        description: newDesc.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      toast.success("Contact list created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      if (editListId) setEditListId(null);
      toast.success("List deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addContactMutation = useMutation({
    mutationFn: async ({ listId, email, name }: { listId: string; email: string; name: string }) => {
      const { error } = await supabase.from("contact_list_members").insert({
        list_id: listId,
        user_id: user!.id,
        email: email.trim(),
        name: name.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-list-members", editListId] });
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      setContactEmail("");
      setContactName("");
      setAddContactOpen(null);
      toast.success("Contact added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_list_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-list-members", editListId] });
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      toast.success("Contact removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkImportMutation = useMutation({
    mutationFn: async ({ listId, contacts }: { listId: string; contacts: { email: string; name?: string }[] }) => {
      const rows = contacts.map((c) => ({
        list_id: listId,
        user_id: user!.id,
        email: c.email,
        name: c.name || null,
      }));
      const { error } = await supabase.from("contact_list_members").upsert(rows, { onConflict: "list_id,email" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["contact-list-members", editListId] });
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      toast.success(`${vars.contacts.length} contacts imported`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeList = lists?.find((l) => l.id === editListId);

  if (editListId && activeList) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Button variant="ghost" size="sm" onClick={() => setEditListId(null)} className="mb-2">← Back to Lists</Button>
              <h1 className="text-2xl font-bold tracking-tight">{activeList.name}</h1>
              {activeList.description && <p className="text-sm text-muted-foreground mt-1">{activeList.description}</p>}
            </div>
            <div className="flex gap-2">
              <CsvImport onImport={(contacts) => bulkImportMutation.mutate({ listId: editListId, contacts })} />
              <Dialog open={addContactOpen === editListId} onOpenChange={(o) => setAddContactOpen(o ? editListId : null)}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5"><UserPlus className="h-4 w-4" /> Add Contact</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Email *</Label>
                      <Input placeholder="email@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input placeholder="John Doe" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!contactEmail.trim() || addContactMutation.isPending}
                      onClick={() => addContactMutation.mutate({ listId: editListId, email: contactEmail, name: contactName })}
                    >
                      {addContactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                      Add Contact
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members && members.length > 0 ? members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.email}</TableCell>
                    <TableCell className="text-muted-foreground">{m.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(m.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteContactMutation.mutate(m.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No contacts yet. Add contacts manually or import from CSV.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contact Lists</h1>
            <p className="text-sm text-muted-foreground mt-1">Create reusable recipient lists for your campaigns.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5"><Plus className="h-4 w-4" /> New List</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Contact List</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input placeholder="e.g., Newsletter Subscribers" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea placeholder="Optional description..." value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="min-h-[80px]" />
                </div>
                <Button className="w-full" disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  Create List
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : lists && lists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <Card key={list.id} className="p-5 space-y-3 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setEditListId(list.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{list.name}</h3>
                      {list.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{list.description}</p>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(list.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-xs">{list.contact_count} contacts</Badge>
                  <span>{format(new Date(list.created_at), "MMM d, yyyy")}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium">No contact lists yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create a list to organize your recipients.</p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
