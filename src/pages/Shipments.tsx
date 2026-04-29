import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Ship, Plus, Search, MoreHorizontal, Package, Clock, CheckCircle2, AlertTriangle, Upload, FileText, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { BulkShipmentImport } from "@/components/BulkShipmentImport";
import { BulkPriceCorrection } from "@/components/BulkPriceCorrection";

type Shipment = Tables<"shipments"> & {
  items: { name: string; category: string } | null;
  projects: { name: string } | null;
};

type EvidenceFile = Tables<"evidence_files">;

const CATEGORY_LABELS: Record<string, string> = {
  dmrv_pcb: "DMRV PCB",
  dc_pcb: "DC PCB",
  ac_pcb: "AC PCB",
  home_gas_meter: "Home Gas Meter",
  industrial_gas_meter: "Industrial Gas Meter",
  cookstove: "Cookstove",
  iot_device: "IoT Device",
  antenna: "Antenna",
  sensor: "Sensor",
  tool: "Tools",
  consumable: "Consumables",
  other: "Other",
};

type ShipmentStatus = "ordered" | "in_transit" | "customs" | "received" | "partial";
type ProcurementCategory = "consumable" | "tool" | "pcb_dc" | "pcb_ac" | "other";

const PROCUREMENT_CATEGORIES: { value: ProcurementCategory; label: string }[] = [
  { value: "consumable", label: "Consumable" },
  { value: "tool", label: "Tool" },
  { value: "pcb_dc", label: "PCB (DC)" },
  { value: "pcb_ac", label: "PCB (AC)" },
  { value: "other", label: "Other" },
];

const STATUS_FLOW: Record<ShipmentStatus, ShipmentStatus[]> = {
  ordered: ["in_transit"],
  in_transit: ["customs", "received"],
  customs: ["received", "partial"],
  partial: ["received"],
  received: [],
};

interface ItemOption {
  id: string;
  name: string;
  category: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export default function ShipmentsPage() {
  const { user, hasRole } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const canManage = hasRole("admin") || hasRole("warehouse_manager");
  const canCreate = canManage || hasRole("field_officer");

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    item_id: "",
    quantity: "",
    unit_price: "",
    supplier: "",
    origin_country: "",
    expected_arrival: "",
    procurement_type: "imported" as "local" | "imported",
    procurement_category: "other" as ProcurementCategory,
    project_id: "",
    notes: "",
  });

  // Receipt upload
  const [receiptShipmentId, setReceiptShipmentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [receiptCounts, setReceiptCounts] = useState<Record<string, number>>({});
  const [viewReceiptsOpen, setViewReceiptsOpen] = useState(false);
  const [viewReceiptsShipment, setViewReceiptsShipment] = useState<Shipment | null>(null);
  const [receipts, setReceipts] = useState<EvidenceFile[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  // Receive dialog
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveShipment, setReceiveShipment] = useState<Shipment | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveCondition, setReceiveCondition] = useState("good");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiving, setReceiving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: shipmentData }, { data: itemData }, { data: projectData }, { data: evidenceCounts }] = await Promise.all([
      supabase
        .from("shipments")
        .select("*, items(name, category), projects(name)")
        .order("created_at", { ascending: false }),
      supabase.from("items").select("id, name, category"),
      supabase.from("projects").select("id, name"),
      supabase
        .from("evidence_files")
        .select("linked_entity_id")
        .eq("linked_entity_type", "shipment")
        .eq("event_type", "shipment"),
    ]);
    setShipments((shipmentData || []) as unknown as Shipment[]);
    setItems(itemData || []);
    setProjects(projectData || []);
    // Count receipts per shipment
    const counts: Record<string, number> = {};
    (evidenceCounts || []).forEach((e) => {
      counts[e.linked_entity_id] = (counts[e.linked_entity_id] || 0) + 1;
    });
    setReceiptCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = shipments.filter((s) => {
    const matchSearch =
      !searchQuery ||
      s.items?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.origin_country.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Summary counts
  const counts = {
    total: shipments.length,
    ordered: shipments.filter((s) => s.status === "ordered").length,
    inTransit: shipments.filter((s) => s.status === "in_transit" || s.status === "customs").length,
    received: shipments.filter((s) => s.status === "received").length,
  };

  const handleCreate = async () => {
    if (!user || !form.item_id || !form.quantity || !form.supplier) return;
    setSaving(true);

    const qty = parseInt(form.quantity, 10);
    const price = parseFloat(form.unit_price) || 0;
    const payload: TablesInsert<"shipments"> = {
      item_id: form.item_id,
      quantity: qty,
      unit_price: price,
      total_cost: qty * price,
      supplier: form.supplier,
      origin_country: form.origin_country,
      expected_arrival: form.expected_arrival || null,
      procurement_type: form.procurement_type,
      procurement_category: form.procurement_category,
      project_id: form.project_id || null,
      notes: form.notes || null,
      created_by: user.id,
    };

    const { data, error } = await supabase.from("shipments").insert(payload).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Shipment created", description: `${form.quantity} units from ${form.supplier}` });
      if (data) {
        logAudit({ userId: user.id, action: "create", entityType: "shipment", entityId: data.id, afterData: payload as any });
      }
      setCreateOpen(false);
      resetForm();
      fetchData();
    }
    setSaving(false);
  };

  const resetForm = () => setForm({ item_id: "", quantity: "", unit_price: "", supplier: "", origin_country: "", expected_arrival: "", procurement_type: "imported", procurement_category: "other", project_id: "", notes: "" });

  const updateStatus = async (shipment: Shipment, newStatus: ShipmentStatus) => {
    if (newStatus === "received" || newStatus === "partial") {
      setReceiveShipment(shipment);
      setReceiveQty(newStatus === "received" ? String(shipment.quantity) : "");
      setReceiveCondition("good");
      setReceiveNotes("");
      setReceiveOpen(true);
      return;
    }

    const { error } = await supabase
      .from("shipments")
      .update({ status: newStatus })
      .eq("id", shipment.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (user) logAudit({ userId: user.id, action: "status_change", entityType: "shipment", entityId: shipment.id, beforeData: { status: shipment.status }, afterData: { status: newStatus } });
      toast({ title: "Status updated", description: `Shipment marked as ${newStatus.replace(/_/g, " ")}` });
      fetchData();
    }
  };

  const handleReceive = async () => {
    if (!receiveShipment || !user || !receiveQty) return;
    setReceiving(true);

    const qty = parseInt(receiveQty, 10);
    const isPartial = qty < receiveShipment.quantity;
    const newStatus: ShipmentStatus = isPartial ? "partial" : "received";

    // Update shipment status and actual arrival
    const { error: shipErr } = await supabase
      .from("shipments")
      .update({
        status: newStatus,
        actual_arrival: new Date().toISOString().split("T")[0],
      })
      .eq("id", receiveShipment.id);

    if (shipErr) {
      toast({ title: "Error", description: shipErr.message, variant: "destructive" });
      setReceiving(false);
      return;
    }

    // Create stock batch
    const { error: batchErr } = await supabase.from("stock_batches").insert({
      shipment_id: receiveShipment.id,
      item_id: receiveShipment.item_id,
      quantity_received: qty,
      quantity_available: qty,
      condition: receiveCondition,
      notes: receiveNotes || null,
    });

    if (batchErr) {
      toast({ title: "Warning", description: `Shipment updated but stock batch failed: ${batchErr.message}`, variant: "destructive" });
    } else {
      logAudit({ userId: user.id, action: "receive", entityType: "shipment", entityId: receiveShipment.id, afterData: { quantity_received: qty, condition: receiveCondition, status: newStatus } });
      toast({
        title: isPartial ? "Partial receipt recorded" : "Shipment received",
        description: `${qty} units added to warehouse stock.`,
      });
    }

    setReceiveOpen(false);
    setReceiveShipment(null);
    fetchData();
    setReceiving(false);
  };

  const handleReceiptUpload = async (shipmentId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    setReceiptShipmentId(shipmentId);

    for (const file of Array.from(files)) {
      const filePath = `shipments/${shipmentId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(filePath);

      // Compute simple hash placeholder (real SHA-256 would need crypto API)
      const hashBuffer = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      await supabase.from("evidence_files").insert({
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type.startsWith("image/") ? "photo" : "document",
        file_size: file.size,
        sha256_hash: sha256,
        event_type: "shipment" as const,
        linked_entity_type: "shipment",
        linked_entity_id: shipmentId,
        uploaded_by: user.id,
      });
    }

    toast({ title: "Receipts uploaded", description: `${files.length} file(s) uploaded successfully.` });
    setUploading(false);
    setReceiptShipmentId(null);
    fetchData();
  };

  const openViewReceipts = async (shipment: Shipment) => {
    setViewReceiptsShipment(shipment);
    setViewReceiptsOpen(true);
    setLoadingReceipts(true);
    const { data } = await supabase
      .from("evidence_files")
      .select("*")
      .eq("linked_entity_type", "shipment")
      .eq("linked_entity_id", shipment.id)
      .order("created_at", { ascending: false });
    setReceipts((data || []) as EvidenceFile[]);
    setLoadingReceipts(false);
  };

  const summaryCards = [
    { title: "Total Shipments", value: counts.total, icon: Ship, colorClass: "text-primary" },
    { title: "Ordered", value: counts.ordered, icon: Package, colorClass: "text-status-info" },
    { title: "In Transit / Customs", value: counts.inTransit, icon: Clock, colorClass: "text-status-warning" },
    { title: "Received", value: counts.received, icon: CheckCircle2, colorClass: "text-status-success" },
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
          <h1 className="text-2xl font-bold tracking-tight">Shipments</h1>
          <p className="text-muted-foreground">Track procurement from order to warehouse</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <BulkPriceCorrection onCorrectionComplete={fetchData} />
            <BulkShipmentImport items={items} projects={projects} onImportComplete={fetchData} />
            <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> New Shipment
            </Button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by item, supplier, or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="customs">Customs</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipments ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery || statusFilter !== "all" ? "No shipments match your filters" : "No shipments yet. Create one to get started."}
            </p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>Item</TableHead>
                     <TableHead>Category</TableHead>
                     <TableHead className="text-right">Qty</TableHead>
                     <TableHead className="text-right">Unit Price</TableHead>
                     <TableHead className="text-right">Total</TableHead>
                     <TableHead>Supplier</TableHead>
                     <TableHead>Source</TableHead>
                     <TableHead>Project</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Receipts</TableHead>
                     {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const nextStatuses = STATUS_FLOW[s.status as ShipmentStatus] || [];
                    return (
                       <TableRow key={s.id}>
                         <TableCell className="font-medium">{s.items?.name || "—"}</TableCell>
                         <TableCell className="capitalize">{PROCUREMENT_CATEGORIES.find(c => c.value === (s as any).procurement_category)?.label || "—"}</TableCell>
                         <TableCell className="text-right">{s.quantity}</TableCell>
                         <TableCell className="text-right">{(s as any).unit_price ? formatAmount(Number((s as any).unit_price)) : "—"}</TableCell>
                         <TableCell className="text-right font-medium">{(s as any).total_cost ? formatAmount(Number((s as any).total_cost)) : "—"}</TableCell>
                         <TableCell>{s.supplier || "—"}</TableCell>
                         <TableCell className="capitalize">{(s as any).procurement_type || "—"}</TableCell>
                         <TableCell>{(s as any).projects?.name || "—"}</TableCell>
                         <TableCell><StatusBadge status={s.status} /></TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {receiptCounts[s.id] ? (
                               <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => openViewReceipts(s)}>
                                 <FileText className="h-3.5 w-3.5" /> {receiptCounts[s.id]}
                               </Button>
                             ) : (
                               <span className="text-xs text-muted-foreground">None</span>
                             )}
                             <label className="cursor-pointer">
                               <input
                                 type="file"
                                 multiple
                                 accept="image/*,.pdf,.jpg,.jpeg,.png"
                                 className="hidden"
                                 onChange={(e) => handleReceiptUpload(s.id, e.target.files)}
                               />
                               {uploading && receiptShipmentId === s.id ? (
                                 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                               ) : (
                                 <Upload className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                               )}
                             </label>
                           </div>
                         </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            {nextStatuses.length > 0 ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {nextStatuses.map((ns) => (
                                    <DropdownMenuItem key={ns} onClick={() => updateStatus(s, ns)}>
                                      Mark as {ns.replace(/_/g, " ")}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-xs text-muted-foreground">Done</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Shipment</DialogTitle>
            <DialogDescription>Log a new procurement shipment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={form.item_id} onValueChange={(v) => setForm((f) => ({ ...f, item_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(
                    items.reduce<Record<string, ItemOption[]>>((groups, item) => {
                      const cat = item.category || "other";
                      if (!groups[cat]) groups[cat] = [];
                      groups[cat].push(item);
                      return groups;
                    }, {})
                  ).map(([category, categoryItems]) => (
                    <div key={category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {CATEGORY_LABELS[category] || category}
                      </div>
                      {categoryItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              {items.length === 0 && (
                <p className="text-xs text-status-warning">No items found. Create items in the Items Catalog first.</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  placeholder="e.g. 500"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unit_price}
                  onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                  placeholder="e.g. 12.50"
                />
              </div>
              <div className="space-y-2">
                <Label>Total Cost</Label>
                <Input
                  readOnly
                  value={form.quantity && form.unit_price ? `Ksh ${(parseFloat(form.quantity) * parseFloat(form.unit_price)).toFixed(2)}` : "—"}
                  className="bg-muted"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Input
                  value={form.supplier}
                  onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                  placeholder="e.g. EcoStove Ltd"
                />
              </div>
              <div className="space-y-2">
                <Label>Procurement Type</Label>
                <Select value={form.procurement_type} onValueChange={(v: "local" | "imported") => setForm((f) => ({ ...f, procurement_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Locally Purchased</SelectItem>
                    <SelectItem value="imported">Imported</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.procurement_category} onValueChange={(v: ProcurementCategory) => setForm((f) => ({ ...f, procurement_category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCUREMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origin Country</Label>
                <Input
                  value={form.origin_country}
                  onChange={(e) => setForm((f) => ({ ...f, origin_country: e.target.value }))}
                  placeholder="e.g. China"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Arrival</Label>
                <Input
                  type="date"
                  value={form.expected_arrival}
                  onChange={(e) => setForm((f) => ({ ...f, expected_arrival: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Additional details..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.item_id || !form.quantity || !form.supplier}
            >
              {saving ? "Creating…" : "Create Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Shipment</DialogTitle>
            <DialogDescription>
              {receiveShipment?.items?.name} — {receiveShipment?.quantity} units ordered from {receiveShipment?.supplier}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quantity Received *</Label>
              <Input
                type="number"
                min={1}
                max={receiveShipment?.quantity}
                value={receiveQty}
                onChange={(e) => setReceiveQty(e.target.value)}
                placeholder={`Max: ${receiveShipment?.quantity}`}
              />
              {receiveQty && parseInt(receiveQty) < (receiveShipment?.quantity || 0) && (
                <p className="text-xs text-status-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> This will be recorded as a partial receipt.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={receiveCondition} onValueChange={setReceiveCondition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Receiving notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={receiving || !receiveQty || parseInt(receiveQty) < 1}>
              {receiving ? "Processing…" : "Confirm Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Receipts Dialog */}
      <Dialog open={viewReceiptsOpen} onOpenChange={setViewReceiptsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipts</DialogTitle>
            <DialogDescription>
              {viewReceiptsShipment?.items?.name} — {viewReceiptsShipment?.supplier}
            </DialogDescription>
          </DialogHeader>
          {loadingReceipts ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : receipts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No receipts uploaded yet.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-auto">
              {receipts.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-md border p-3">
                  {r.file_type.startsWith("image") || r.file_name.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                    <img src={r.file_url} alt={r.file_name} className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()} · {r.file_size ? `${(r.file_size / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                  <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-7 text-xs">View</Button>
                  </a>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  if (viewReceiptsShipment) {
                    handleReceiptUpload(viewReceiptsShipment.id, e.target.files).then(() => {
                      openViewReceipts(viewReceiptsShipment);
                    });
                  }
                }}
              />
              <Button variant="outline" asChild>
                <span><Upload className="mr-1 h-4 w-4" /> Upload More</span>
              </Button>
            </label>
            <Button variant="outline" onClick={() => setViewReceiptsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
