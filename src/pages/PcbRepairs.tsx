import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logAudit } from "@/lib/auditLog";
import { COMPANY_BATCHES, COMPANY_ORIGINS, FAULT_CATEGORIES } from "@/lib/repair-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Search, FileText, Clock, CheckCircle, Cpu, CookingPot,
  Save, RotateCcw, ArrowRightLeft, Eye, Pencil, Trash2, Download,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

const ROWS_PER_PAGE = 15;

const statusColorMap: Record<string, string> = {
  intake: "bg-blue-600 text-white",
  diagnosis: "bg-yellow-600 text-white",
  in_repair: "bg-orange-600 text-white",
  testing: "bg-purple-600 text-white",
  completed: "bg-green-600 text-white",
  scrapped: "bg-red-600 text-white",
};

interface Project {
  id: string;
  name: string;
  country: string;
}

interface RepairRow {
  id: string;
  serial_number: string;
  fault_description: string;
  diagnosis_notes: string;
  repair_notes: string;
  status: string;
  priority: string;
  technician_id: string | null;
  is_charger_repair: boolean;
  total_cost: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  item_id: string | null;
  deployment_id: string | null;
  batch: string;
  device_type: string;
  cooker_model: string;
  device_origin: string;
  fault_source: string;
  fault_category: string;
  repair_action: string;
  components_replaced: string;
  meter_replaced: boolean;
  replacement_serial: string;
  replacement_device_type: string;
  project_id: string | null;
}

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  technician: "",
  project_id: "",
  batch: "",
  device_type: "",
  cooker_model: "",
  serial_number: "",
  device_origin: "",
  fault_source: "PCB Fault" as string,
  fault_category: "",
  fault_description: "",
  repair_action: "",
  components_replaced: "",
  status: "intake" as string,
  meter_replaced: false,
  replacement_serial: "",
  replacement_device_type: "External Metering",
  total_cost: 0,
  notes: "",
});

export default function PcbRepairsPage() {
  const { user, hasRole } = useAuth();
  // Stored monetary values are KES (legacy data); display directly with a KSh label.
  const formatAmount = (value: number) =>
    `KSh ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFault, setFilterFault] = useState("all");
  const [page, setPage] = useState(0);

  // Form
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  // View / Delete
  const [viewRecord, setViewRecord] = useState<RepairRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canManage = hasRole("admin") || hasRole("warehouse_manager") || hasRole("field_officer");

  useEffect(() => {
    fetchRepairs();
    fetchProjects();
    fetchProfiles();
  }, []);

  async function fetchRepairs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pcb_repairs" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading repairs", description: error.message, variant: "destructive" });
    } else {
      setRepairs((data as any[]) || []);
    }
    setLoading(false);
  }

  async function fetchProjects() {
    const { data } = await supabase.from("projects").select("id, name, country");
    if (data) setProjects(data);
  }

  async function fetchProfiles() {
    const { data } = await supabase.from("profiles").select("id, full_name");
    if (data) setProfiles(data);
  }

  const getProjectName = (id: string | null) => {
    if (!id) return "—";
    return projects.find((p) => p.id === id)?.name || "—";
  };

  const getProjectFlag = (name: string) => {
    const country = projects.find((p) => p.name === name)?.country || "";
    const flags: Record<string, string> = { Kenya: "🇰🇪", Uganda: "🇺🇬", Tanzania: "🇹🇿" };
    return flags[country] || "🏳️";
  };

  const getProfileName = (id: string | null) => {
    if (!id) return "—";
    return profiles.find((p) => p.id === id)?.full_name || id.slice(0, 8);
  };

  // Selected project name for form
  const selectedProjectName = projects.find((p) => p.id === form.project_id)?.name || "";
  const batches = COMPANY_BATCHES[selectedProjectName] || [];
  const origins = COMPANY_ORIGINS[selectedProjectName] || [];

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleBatchChange = (batchLabel: string) => {
    const batch = batches.find((b) => b.label === batchLabel);
    if (batch) {
      setForm((f) => ({
        ...f,
        batch: batch.label,
        device_type: batch.deviceType,
        cooker_model: batch.cookerModel,
      }));
    }
  };

  const handleProjectChange = (projectId: string) => {
    setForm((f) => ({
      ...f,
      project_id: projectId,
      batch: "",
      device_type: "",
      cooker_model: "",
      device_origin: "",
    }));
    // Auto-select first batch
    const pName = projects.find((p) => p.id === projectId)?.name || "";
    const pBatches = COMPANY_BATCHES[pName] || [];
    if (pBatches.length > 0) {
      setForm((f) => ({
        ...f,
        project_id: projectId,
        batch: pBatches[0].label,
        device_type: pBatches[0].deviceType,
        cooker_model: pBatches[0].cookerModel,
      }));
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const techProfile = profiles.find(
      (p) => p.full_name.toLowerCase() === form.technician.toLowerCase()
    );

    const payload: any = {
      serial_number: form.serial_number,
      fault_description: form.fault_description,
      fault_source: form.fault_source,
      fault_category: form.fault_category,
      batch: form.batch,
      device_type: form.device_type,
      cooker_model: form.cooker_model,
      device_origin: form.device_origin,
      repair_action: form.repair_action,
      components_replaced: form.components_replaced,
      status: form.status,
      meter_replaced: form.meter_replaced,
      replacement_serial: form.replacement_serial,
      replacement_device_type: form.replacement_device_type,
      total_cost: form.total_cost,
      repair_notes: form.notes,
      project_id: form.project_id || null,
      is_charger_repair: form.fault_source === "Cooker Fault",
      technician_id: techProfile?.id || null,
    };

    if (editingId) {
      const { error } = await supabase
        .from("pcb_repairs" as any)
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Record updated" });
        logAudit({ userId: user.id, action: "update", entityType: "pcb_repair", entityId: editingId, afterData: payload });
        handleReset();
        fetchRepairs();
      }
    } else {
      payload.created_by = user.id;
      const { data, error } = await supabase
        .from("pcb_repairs" as any)
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Record saved" });
        logAudit({ userId: user.id, action: "create", entityType: "pcb_repair", entityId: (data as any).id, afterData: data as any });
        handleReset();
        fetchRepairs();
      }
    }
  }

  function handleEdit(record: RepairRow) {
    setEditingId(record.id);
    setForm({
      date: record.created_at ? record.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      technician: getProfileName(record.technician_id),
      project_id: record.project_id || "",
      batch: record.batch || "",
      device_type: record.device_type || "",
      cooker_model: record.cooker_model || "",
      serial_number: record.serial_number || "",
      device_origin: record.device_origin || "",
      fault_source: record.fault_source || "PCB Fault",
      fault_category: record.fault_category || "",
      fault_description: record.fault_description || "",
      repair_action: record.repair_action || "",
      components_replaced: record.components_replaced || "",
      status: record.status || "intake",
      meter_replaced: record.meter_replaced || false,
      replacement_serial: record.replacement_serial || "",
      replacement_device_type: record.replacement_device_type || "External Metering",
      total_cost: Number(record.total_cost) || 0,
      notes: record.repair_notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    if (!user) return;
    const { error } = await supabase.from("pcb_repairs" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Record deleted" });
      logAudit({ userId: user.id, action: "delete", entityType: "pcb_repair", entityId: id });
      fetchRepairs();
    }
  }

  function handleReset() {
    setForm(emptyForm());
    setEditingId(null);
  }

  function exportToCSV() {
    const headers = ["ID", "Date", "Company", "Batch", "Device Type", "Cooker Model", "Serial", "Origin", "Fault Source", "Fault Category", "Fault Description", "Repair Action", "Components", "Status", "Meter Replaced", "Cost", "Notes"];
    const rows = filtered.map((r) => [
      r.id.slice(0, 8), r.created_at?.slice(0, 10) || "", getProjectName(r.project_id),
      r.batch, r.device_type, r.cooker_model, r.serial_number, r.device_origin,
      r.fault_source, r.fault_category, `"${(r.fault_description || "").replace(/"/g, '""')}"`,
      `"${(r.repair_action || "").replace(/"/g, '""')}"`, r.components_replaced,
      r.status, r.meter_replaced ? "Yes" : "No", r.total_cost || 0,
      `"${(r.repair_notes || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pcb-repairs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Filtering
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return repairs.filter((r) => {
      if (filterProject !== "all" && r.project_id !== filterProject) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterFault !== "all" && r.fault_source !== filterFault) return false;
      if (q) {
        const haystack = [r.serial_number, r.fault_description, r.batch, r.device_origin, r.fault_category, r.repair_action, r.components_replaced, r.repair_notes].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [repairs, search, filterProject, filterStatus, filterFault]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRecords = filtered.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);

  // Stats
  const stats = {
    total: repairs.length,
    pending: repairs.filter((r) => !["completed", "scrapped"].includes(r.status)).length,
    repaired: repairs.filter((r) => r.status === "completed").length,
    pcbFaults: repairs.filter((r) => r.fault_source === "PCB Fault").length,
    cookerFaults: repairs.filter((r) => r.fault_source === "Cooker Fault").length,
  };

  const statItems = [
    { label: "Total Records", value: stats.total, icon: FileText, color: "text-primary" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-500" },
    { label: "Repaired", value: stats.repaired, icon: CheckCircle, color: "text-green-500" },
    { label: "PCB Faults", value: stats.pcbFaults, icon: Cpu, color: "text-red-500" },
    { label: "Cooker Faults", value: stats.cookerFaults, icon: CookingPot, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">PCB Repair Tracker</h1>
        <p className="text-muted-foreground">Track PCB and cooker repairs through the full workflow</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statItems.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
              <div>
                <p className="font-mono text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Inline Repair Form */}
      {canManage && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="font-mono text-lg text-primary">
              {editingId ? `✏️ Editing Record` : "➕ New Repair Entry"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Row 1: Date, Technician, Company */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Technician</Label>
                  <Input placeholder="Name" value={form.technician} onChange={(e) => set("technician", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Select value={form.project_id} onValueChange={handleProjectChange}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {getProjectFlag(p.name)} {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Batch, Device Type, Cooker Model */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Batch / Bunch</Label>
                  <Select value={form.batch} onValueChange={handleBatchChange}>
                    <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                    <SelectContent>
                      {batches.map((b) => (
                        <SelectItem key={b.label} value={b.label}>
                          {b.label} ({b.units} units)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Device Type</Label>
                  <Input value={form.device_type} readOnly className="bg-secondary" />
                </div>
                <div className="space-y-1.5">
                  <Label>Cooker Model</Label>
                  <Input value={form.cooker_model} readOnly className="bg-secondary" />
                </div>
              </div>

              {/* Row 3: Serial, Device Origin, Fault Source, Fault Category */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Device Serial / Unit ID</Label>
                  <Input placeholder="Serial number" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Device Origin (Area)</Label>
                  <Select value={form.device_origin} onValueChange={(v) => set("device_origin", v)}>
                    <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                    <SelectContent>
                      {origins.map((area) => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fault Source</Label>
                  <div className="flex gap-1 rounded-md border p-1">
                    {["PCB Fault", "Cooker Fault"].map((src) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => set("fault_source", src)}
                        className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                          form.fault_source === src
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Fault Category</Label>
                  <Select value={form.fault_category} onValueChange={(v) => set("fault_category", v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {FAULT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fault Description */}
              <div className="space-y-1.5">
                <Label>Fault Description</Label>
                <Textarea placeholder="Describe the fault..." value={form.fault_description} onChange={(e) => set("fault_description", e.target.value)} rows={2} />
              </div>

              {/* Repair Action + Components */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Repair Action Taken</Label>
                  <Textarea placeholder="Describe the repair..." value={form.repair_action} onChange={(e) => set("repair_action", e.target.value)} rows={2} />
                </div>
                <div className="space-y-1.5">
                  <Label>Components Replaced</Label>
                  <Input placeholder="e.g. capacitor C12, relay K1" value={form.components_replaced} onChange={(e) => set("components_replaced", e.target.value)} />
                </div>
              </div>

              {/* Status, Cost, Notes */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Repair Status</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intake">Intake</SelectItem>
                      <SelectItem value="diagnosis">Diagnosis</SelectItem>
                      <SelectItem value="in_repair">In Repair</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="scrapped">Scrapped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Repair Cost</Label>
                  <Input type="number" min={0} value={form.total_cost || ""} onChange={(e) => set("total_cost", Number(e.target.value))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Additional Notes</Label>
                  <Input placeholder="Any extra notes..." value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>

              {/* Meter Replacement */}
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <ArrowRightLeft className="h-4 w-4 text-primary" />
                  <Label htmlFor="meter-replaced" className="font-medium">Meter Replaced?</Label>
                  <Switch
                    id="meter-replaced"
                    checked={form.meter_replaced}
                    onCheckedChange={(v) => set("meter_replaced", v)}
                  />
                </div>
                {form.meter_replaced && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pl-7">
                    <div className="space-y-1.5">
                      <Label>Replacement Meter Serial</Label>
                      <Input
                        placeholder="New meter serial / unit ID"
                        value={form.replacement_serial}
                        onChange={(e) => set("replacement_serial", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Replacement Device Type</Label>
                      <Select value={form.replacement_device_type} onValueChange={(v) => set("replacement_device_type", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="External Metering">External Metering</SelectItem>
                          <SelectItem value="Internal Metering">Internal Metering</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button type="submit" className="gap-2" disabled={!form.serial_number || !form.fault_description}>
                  <Save className="h-4 w-4" />
                  {editingId ? "Update Record" : "Save Record"}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  {editingId ? "Cancel Edit" : "Reset"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={filterProject} onValueChange={(v) => { setFilterProject(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{getProjectFlag(p.name)} {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="intake">Intake</SelectItem>
            <SelectItem value="diagnosis">Diagnosis</SelectItem>
            <SelectItem value="in_repair">In Repair</SelectItem>
            <SelectItem value="testing">Testing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="scrapped">Scrapped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterFault} onValueChange={(v) => { setFilterFault(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Fault" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Faults</SelectItem>
            <SelectItem value="PCB Fault">PCB Fault</SelectItem>
            <SelectItem value="Cooker Fault">Cooker Fault</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportToCSV}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      {/* Records Table */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">ID</TableHead>
                <TableHead className="font-mono text-xs">Date</TableHead>
                <TableHead className="font-mono text-xs">Company</TableHead>
                <TableHead className="font-mono text-xs">Batch</TableHead>
                <TableHead className="font-mono text-xs">Serial</TableHead>
                <TableHead className="font-mono text-xs">Fault</TableHead>
                <TableHead className="font-mono text-xs">Category</TableHead>
                <TableHead className="font-mono text-xs">Status</TableHead>
                <TableHead className="font-mono text-xs text-right">Cost</TableHead>
                <TableHead className="font-mono text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                pageRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-primary">{r.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{r.created_at?.slice(0, 10) || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="border-0 text-xs">
                        {getProjectName(r.project_id)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.batch || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.serial_number}</TableCell>
                    <TableCell className="text-xs">{r.fault_source || "—"}</TableCell>
                    <TableCell className="text-xs">{r.fault_category || "—"}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColorMap[r.status] || ""} border-0 text-xs`}>
                        {r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(r.total_cost) > 0 ? formatAmount(Number(r.total_cost)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewRecord(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {filtered.length} record{filtered.length !== 1 && "s"} — Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!viewRecord} onOpenChange={() => setViewRecord(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {viewRecord && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-primary">{viewRecord.id.slice(0, 8)}</DialogTitle>
                <DialogDescription>Repair record details</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {viewRecord.created_at?.slice(0, 10)}</div>
                <div><span className="text-muted-foreground">Company:</span> {getProjectName(viewRecord.project_id)}</div>
                <div><span className="text-muted-foreground">Batch:</span> {viewRecord.batch || "—"}</div>
                <div><span className="text-muted-foreground">Device Type:</span> {viewRecord.device_type || "—"}</div>
                <div><span className="text-muted-foreground">Cooker Model:</span> {viewRecord.cooker_model || "—"}</div>
                <div><span className="text-muted-foreground">Serial:</span> <span className="font-mono">{viewRecord.serial_number}</span></div>
                <div><span className="text-muted-foreground">Device Origin:</span> {viewRecord.device_origin || "—"}</div>
                <div><span className="text-muted-foreground">Fault Source:</span> {viewRecord.fault_source || "—"}</div>
                <div><span className="text-muted-foreground">Category:</span> {viewRecord.fault_category || "—"}</div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge className={`${statusColorMap[viewRecord.status] || ""} border-0 text-xs`}>
                    {viewRecord.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                </div>
                <div className="col-span-2"><span className="text-muted-foreground">Fault Description:</span> {viewRecord.fault_description || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Repair Action:</span> {viewRecord.repair_action || "—"}</div>
                <div><span className="text-muted-foreground">Components:</span> {viewRecord.components_replaced || "—"}</div>
                <div><span className="text-muted-foreground">Cost:</span> {formatAmount(Number(viewRecord.total_cost) || 0)}</div>
                {viewRecord.meter_replaced && (
                  <div className="col-span-2 mt-2 rounded border border-primary/30 bg-primary/5 p-2">
                    <p className="text-xs font-medium text-primary mb-1">🔄 Meter Replaced</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Old Serial:</span> <span className="font-mono">{viewRecord.serial_number}</span></div>
                      <div><span className="text-muted-foreground">New Serial:</span> <span className="font-mono">{viewRecord.replacement_serial}</span></div>
                      <div><span className="text-muted-foreground">New Type:</span> {viewRecord.replacement_device_type}</div>
                    </div>
                  </div>
                )}
                <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {viewRecord.repair_notes || "—"}</div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this repair record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) { handleDelete(deleteId); setDeleteId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
