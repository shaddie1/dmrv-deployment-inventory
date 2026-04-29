import { useEffect, useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderOpen, Plus, Search, Target, Rocket, MapPin, Edit, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import { ProjectDetail } from "@/components/ProjectDetail";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type Deployment = Tables<"deployments"> & {
  items?: { name: string } | null;
  profiles?: { full_name: string; email: string | null } | null;
};

export default function ProjectsPage() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const canManage = hasRole("admin");

  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Detail view
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Create / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    country: "",
    region: "",
    target_quantity: "",
    total_income: "",
    budget: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: projData }, { data: deplData }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("deployments").select("*, items(name)"),
    ]);
    setProjects(projData || []);
    setDeployments((deplData || []) as unknown as Deployment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-open a project when navigated here from the dashboard
  useEffect(() => {
    const openId = (location.state as { openProjectId?: string } | null)?.openProjectId;
    if (openId && projects.length > 0) {
      const found = projects.find((p) => p.id === openId);
      if (found) setSelectedProject(found);
    }
  }, [projects, location.state]);

  const getProjectStats = (projectId: string) => {
    const projDeps = deployments.filter((d) => d.project_id === projectId);
    const deployed = projDeps.reduce((sum, d) => sum + d.quantity, 0);
    const verified = projDeps.filter((d) => d.status === "verified").reduce((sum, d) => sum + d.quantity, 0);
    const pending = projDeps.filter((d) => d.status === "scheduled" || d.status === "in_transit").reduce((sum, d) => sum + d.quantity, 0);
    return { total: projDeps.length, deployed, verified, pending };
  };

  const filtered = projects.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.country.toLowerCase().includes(q) ||
      (p.region || "").toLowerCase().includes(q)
    );
  });

  // Summary
  const totalTarget = projects.reduce((s, p) => s + p.target_quantity, 0);
  const totalDeployed = deployments.reduce((s, d) => s + d.quantity, 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", country: "", region: "", target_quantity: "", total_income: "", budget: "" });
    setDialogOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({
      name: project.name,
      description: project.description || "",
      country: project.country,
      region: project.region || "",
      target_quantity: String(project.target_quantity),
      total_income: project.total_income != null ? String(project.total_income) : "",
      budget: project.budget != null ? String(project.budget) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      country: form.country.trim(),
      region: form.region.trim() || null,
      target_quantity: parseInt(form.target_quantity, 10) || 0,
      total_income: form.total_income ? parseFloat(form.total_income) : null,
      budget: form.budget ? parseFloat(form.budget) : null,
    };

    if (editing) {
      const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Project updated", description: payload.name });
        setDialogOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("projects").insert(payload as TablesInsert<"projects">);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Project created", description: payload.name });
        setDialogOpen(false);
        fetchData();
      }
    }
    setSaving(false);
  };

  // Detail view
  if (selectedProject) {
    return (
      <>
        <ProjectDetail
          project={selectedProject}
          canManage={canManage}
          onBack={() => setSelectedProject(null)}
          onEdit={openEdit}
        />
        <ProjectFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          setForm={setForm}
          editing={!!editing}
          saving={saving}
          onSave={handleSave}
        />
      </>
    );
  }

  // List view
  const summaryCards = [
    { title: "Total Projects", value: projects.length, icon: FolderOpen, colorClass: "text-primary" },
    { title: "Target Units", value: totalTarget, icon: Target, colorClass: "text-status-info" },
    { title: "Deployed Units", value: totalDeployed, icon: Rocket, colorClass: "text-status-success" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage deployment projects and track progress</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={cn("h-4 w-4", card.colorClass)} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, country, or region..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Projects grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No projects match your search" : "No projects yet. Create one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => {
            const stats = getProjectStats(project.id);
            const progress = project.target_quantity > 0
              ? Math.min(100, Math.round((stats.deployed / project.target_quantity) * 100))
              : 0;

            return (
              <Card
                key={project.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedProject(project)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProject(project);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {project.country}{project.region ? `, ${project.region}` : ""}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end justify-between text-sm">
                    <span className="font-semibold">{stats.deployed} deployed</span>
                    <span className="text-muted-foreground">/ {project.target_quantity}</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{stats.verified} verified</span>
                    <span>{stats.pending} pending</span>
                    <span>{stats.total} deployments</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        editing={!!editing}
        saving={saving}
        onSave={handleSave}
      />
    </div>
  );
}

function ProjectFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editing,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: { name: string; description: string; country: string; region: string; target_quantity: string; total_income: string; budget: string };
  setForm: Dispatch<SetStateAction<typeof form>>;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update project details." : "Create a new deployment project."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Project Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Uganda Cookstove Phase 1"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief project description..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country *</Label>
              <Input
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="e.g. Uganda"
              />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                placeholder="e.g. Central"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Target Quantity</Label>
            <Input
              type="number"
              min={0}
              value={form.target_quantity}
              onChange={(e) => setForm((f) => ({ ...f, target_quantity: e.target.value }))}
              placeholder="e.g. 5000"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Total Income (USD)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.total_income}
                onChange={(e) => setForm((f) => ({ ...f, total_income: e.target.value }))}
                placeholder="e.g. 50000.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Budget (USD)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="e.g. 75000.00"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : editing ? "Update Project" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
