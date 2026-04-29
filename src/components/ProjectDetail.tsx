import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { logAudit } from "@/lib/auditLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft, Edit, Rocket, Ship, Package, DollarSign, Wrench, ShoppingCart,
  Plus, MapPin, Camera, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Project = Tables<"projects">;

interface ProjectDetailProps {
  project: Project;
  canManage: boolean;
  onBack: () => void;
  onEdit: (project: Project) => void;
}

interface ItemOption { id: string; name: string; category: string }
interface BatchOption { id: string; item_id: string; quantity_available: number; shipments: { supplier: string } | null }

type ProcurementCategory = "consumable" | "tool" | "pcb_dc" | "pcb_ac" | "other";
const PROCUREMENT_CATEGORIES: { value: ProcurementCategory; label: string }[] = [
  { value: "consumable", label: "Consumable" },
  { value: "tool", label: "Tool" },
  { value: "pcb_dc", label: "PCB (DC)" },
  { value: "pcb_ac", label: "PCB (AC)" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABELS: Record<string, string> = {
  consumable: "Consumables", tool: "Tools", pcb_dc: "PCB (DC)", pcb_ac: "PCB (AC)", other: "Other",
};

const REPAIR_STATUSES = ["intake", "diagnosis", "in_repair", "testing", "completed", "scrapped"] as const;
const REPAIR_STATUS_COLORS: Record<string, string> = {
  intake: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  diagnosis: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  in_repair: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  testing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  scrapped: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function ProjectDetail({ project, canManage, onBack, onEdit }: ProjectDetailProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const [deployments, setDeployments] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [repairs, setRepairs] = useState<any[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRepairs, setActiveRepairs] = useState(0);

  // — Shipment dialog —
  const [shipOpen, setShipOpen] = useState(false);
  const [shipSaving, setShipSaving] = useState(false);
  const [shipForm, setShipForm] = useState({
    item_id: "", quantity: "", unit_price: "", supplier: "",
    origin_country: "", expected_arrival: "",
    procurement_type: "imported" as "local" | "imported",
    procurement_category: "other" as ProcurementCategory,
    notes: "",
  });

  // — Deployment dialog —
  const [deplOpen, setDeplOpen] = useState(false);
  const [deplSaving, setDeplSaving] = useState(false);
  const [deplForm, setDeplForm] = useState({
    item_id: "", stock_batch_id: "", quantity: "",
    location_name: "", gps_latitude: "", gps_longitude: "",
    deployment_date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // — Repair dialog —
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairForm, setRepairForm] = useState({
    serial_number: "", device_type: "", fault_description: "",
    fault_category: "", repair_action: "", components_replaced: "",
    status: "intake", priority: "normal", total_cost: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [
      { data: deps },
      { data: ships },
      { data: repairsData },
      { data: itemsData },
      { data: batchesData },
    ] = await Promise.all([
      supabase.from("deployments").select("*, items(name, category)").eq("project_id", project.id).order("deployment_date", { ascending: false }),
      supabase.from("shipments").select("*, items(name, category)").eq("project_id", project.id).order("created_at", { ascending: false }),
      supabase.from("pcb_repairs").select("id, serial_number, fault_description, status, priority, created_at, device_type, fault_category, total_cost").eq("project_id", project.id).order("created_at", { ascending: false }),
      supabase.from("items").select("id, name, category").order("name"),
      supabase.from("stock_batches").select("id, item_id, quantity_available, shipments(supplier)").gt("quantity_available", 0),
    ]);
    setDeployments(deps || []);
    setShipments(ships || []);
    setRepairs(repairsData || []);
    setItems(itemsData || []);
    setBatches((batchesData || []) as unknown as BatchOption[]);
    setActiveRepairs(
      (repairsData || []).filter((r) => r.status !== "completed" && r.status !== "scrapped").length
    );
    setLoading(false);
  }, [project.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stats
  const totalDeployed = deployments.reduce((s, d) => s + d.quantity, 0);
  const verified = deployments.filter((d) => d.status === "verified").reduce((s, d) => s + d.quantity, 0);
  const pending = deployments.filter((d) => d.status === "scheduled" || d.status === "in_transit").reduce((s, d) => s + d.quantity, 0);
  const progress = project.target_quantity > 0 ? Math.min(100, Math.round((totalDeployed / project.target_quantity) * 100)) : 0;
  const totalShipmentCost = shipments.reduce((s, sh) => s + (Number(sh.total_cost) || 0), 0);
  const totalShipped = shipments.reduce((s, sh) => s + sh.quantity, 0);

  // Materials breakdown
  type MatCat = { qty: number; cost: number; items: string[] };
  const materialsByCategory = shipments.reduce((acc: Record<string, MatCat>, sh: any) => {
    const cat = sh.procurement_category || "other";
    if (!acc[cat]) acc[cat] = { qty: 0, cost: 0, items: [] };
    acc[cat].qty += sh.quantity;
    acc[cat].cost += Number(sh.total_cost) || 0;
    const itemName = sh.items?.name;
    if (itemName && !acc[cat].items.includes(itemName)) acc[cat].items.push(itemName);
    return acc;
  }, {});

  // Filtered batches for deployment
  const filteredBatches = deplForm.item_id ? batches.filter((b) => b.item_id === deplForm.item_id) : batches;
  const selectedBatch = batches.find((b) => b.id === deplForm.stock_batch_id);

  // — Handlers —

  const handleLogShipment = async () => {
    if (!user || !shipForm.item_id || !shipForm.quantity || !shipForm.supplier) return;
    setShipSaving(true);
    const qty = parseInt(shipForm.quantity, 10);
    const price = parseFloat(shipForm.unit_price) || 0;
    const payload: TablesInsert<"shipments"> = {
      item_id: shipForm.item_id,
      quantity: qty,
      unit_price: price,
      total_cost: qty * price,
      supplier: shipForm.supplier,
      origin_country: shipForm.origin_country,
      expected_arrival: shipForm.expected_arrival || null,
      procurement_type: shipForm.procurement_type,
      procurement_category: shipForm.procurement_category,
      project_id: project.id,
      notes: shipForm.notes || null,
      created_by: user.id,
    };
    const { data, error } = await supabase.from("shipments").insert(payload).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (data) logAudit({ userId: user.id, action: "create", entityType: "shipment", entityId: data.id, afterData: payload as any });
      toast({ title: "Shipment logged", description: `${qty} units from ${shipForm.supplier}` });
      setShipOpen(false);
      setShipForm({ item_id: "", quantity: "", unit_price: "", supplier: "", origin_country: "", expected_arrival: "", procurement_type: "imported", procurement_category: "other", notes: "" });
      fetchData();
    }
    setShipSaving(false);
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS not available", variant: "destructive" });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeplForm((f) => ({ ...f, gps_latitude: pos.coords.latitude.toFixed(6), gps_longitude: pos.coords.longitude.toFixed(6) }));
        setGpsLoading(false);
        toast({ title: "GPS captured" });
      },
      (err) => { setGpsLoading(false); toast({ title: "GPS error", description: err.message, variant: "destructive" }); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const hashFile = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hb = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hb)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleLogDeployment = async () => {
    if (!user || !deplForm.item_id || !deplForm.stock_batch_id || !deplForm.quantity) return;
    const qty = parseInt(deplForm.quantity, 10);
    if (!selectedBatch || qty > selectedBatch.quantity_available) {
      toast({ title: "Error", description: "Quantity exceeds available stock.", variant: "destructive" });
      return;
    }
    setDeplSaving(true);

    const payload: TablesInsert<"deployments"> = {
      project_id: project.id,
      item_id: deplForm.item_id,
      stock_batch_id: deplForm.stock_batch_id,
      quantity: qty,
      field_officer_id: user.id,
      created_by: user.id,
      location_name: deplForm.location_name || null,
      gps_latitude: deplForm.gps_latitude ? parseFloat(deplForm.gps_latitude) : null,
      gps_longitude: deplForm.gps_longitude ? parseFloat(deplForm.gps_longitude) : null,
      deployment_date: deplForm.deployment_date,
      notes: deplForm.notes || null,
    };

    const { data: newDep, error: depErr } = await supabase.from("deployments").insert(payload).select("id").single();
    if (depErr || !newDep) {
      toast({ title: "Error", description: depErr?.message || "Failed", variant: "destructive" });
      setDeplSaving(false);
      return;
    }

    // Deduct stock
    await supabase.from("stock_batches").update({ quantity_available: selectedBatch.quantity_available - qty }).eq("id", deplForm.stock_batch_id);

    // Upload evidence
    if (evidenceFile) {
      setUploading(true);
      const hash = await hashFile(evidenceFile);
      const filePath = `deployments/${newDep.id}/${Date.now()}_${evidenceFile.name}`;
      const { error: upErr } = await supabase.storage.from("evidence").upload(filePath, evidenceFile);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(filePath);
        await supabase.from("evidence_files").insert({
          event_type: "deployment" as const,
          linked_entity_type: "deployment",
          linked_entity_id: newDep.id,
          project_id: project.id,
          file_name: evidenceFile.name,
          file_type: evidenceFile.type || "image/jpeg",
          file_size: evidenceFile.size,
          file_url: urlData.publicUrl,
          sha256_hash: hash,
          uploaded_by: user.id,
          gps_latitude: deplForm.gps_latitude ? parseFloat(deplForm.gps_latitude) : null,
          gps_longitude: deplForm.gps_longitude ? parseFloat(deplForm.gps_longitude) : null,
        });
      }
      setUploading(false);
    }

    logAudit({ userId: user.id, action: "create", entityType: "deployment", entityId: newDep.id, afterData: payload as any });
    toast({ title: "Deployment logged", description: `${qty} units scheduled.` });
    setDeplOpen(false);
    setDeplForm({ item_id: "", stock_batch_id: "", quantity: "", location_name: "", gps_latitude: "", gps_longitude: "", deployment_date: new Date().toISOString().split("T")[0], notes: "" });
    setEvidenceFile(null);
    fetchData();
    setDeplSaving(false);
  };

  const handleLogRepair = async () => {
    if (!user || !repairForm.serial_number || !repairForm.fault_description) return;
    setRepairSaving(true);
    const payload = {
      project_id: project.id,
      serial_number: repairForm.serial_number,
      device_type: repairForm.device_type || null,
      fault_description: repairForm.fault_description,
      fault_category: repairForm.fault_category || null,
      repair_action: repairForm.repair_action || null,
      components_replaced: repairForm.components_replaced || null,
      status: repairForm.status,
      priority: repairForm.priority,
      total_cost: repairForm.total_cost ? parseFloat(repairForm.total_cost) : null,
      repair_notes: repairForm.notes || null,
      created_by: user.id,
    };
    const { data, error } = await supabase.from("pcb_repairs").insert(payload).select("id").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (data) logAudit({ userId: user.id, action: "create", entityType: "repair", entityId: data.id, afterData: payload });
      toast({ title: "Repair logged", description: `S/N ${repairForm.serial_number}` });
      setRepairOpen(false);
      setRepairForm({ serial_number: "", device_type: "", fault_description: "", fault_category: "", repair_action: "", components_replaced: "", status: "intake", priority: "normal", total_cost: "", notes: "" });
      fetchData();
    }
    setRepairSaving(false);
  };

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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground">
            {project.country}{project.region ? `, ${project.region}` : ""}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => onEdit(project)}>
            <Edit className="mr-1 h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deployed</CardTitle>
            <Rocket className="h-4 w-4 text-status-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalDeployed}</div>
            <p className="text-xs text-muted-foreground">/ {project.target_quantity} target</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Shipped</CardTitle>
            <Ship className="h-4 w-4 text-status-info" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalShipped}</div>
            <p className="text-xs text-muted-foreground">{shipments.length} shipments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-status-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatAmount(totalShipmentCost)}</div>
            <p className="text-xs text-muted-foreground">
              {totalShipped > 0 ? `${formatAmount(totalShipmentCost / totalShipped)}/unit avg` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Verified</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{verified}</div>
            <p className="text-xs text-muted-foreground">{pending} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Repairs</CardTitle>
            <Wrench className={`h-4 w-4 ${activeRepairs > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeRepairs}</div>
            <p className="text-xs text-muted-foreground">{repairs.length} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Deployment progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Deployment Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progress} className="h-3" />
          <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
        </CardContent>
      </Card>

      {/* Materials breakdown */}
      {Object.keys(materialsByCategory).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Materials Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(materialsByCategory).map(([cat, data]) => {
                  const d = data as MatCat;
                  return (
                    <TableRow key={cat}>
                      <TableCell className="font-medium">{CATEGORY_LABELS[cat] || cat}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{d.items.join(", ") || "—"}</TableCell>
                      <TableCell className="text-right">{d.qty}</TableCell>
                      <TableCell className="text-right">{formatAmount(d.cost)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{totalShipped}</TableCell>
                  <TableCell className="text-right">{formatAmount(totalShipmentCost)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="shipments">
        <TabsList>
          <TabsTrigger value="shipments">Shipments ({shipments.length})</TabsTrigger>
          <TabsTrigger value="deployments">Deployments ({deployments.length})</TabsTrigger>
          <TabsTrigger value="repairs">Repairs ({repairs.length})</TabsTrigger>
        </TabsList>

        {/* — Shipments tab — */}
        <TabsContent value="shipments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Shipments</CardTitle>
              <Button size="sm" onClick={() => setShipOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Log Shipment
              </Button>
            </CardHeader>
            <CardContent>
              {shipments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No shipments yet. Log one above.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipments.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.items?.name || "—"}</TableCell>
                          <TableCell>{s.supplier || "—"}</TableCell>
                          <TableCell>{CATEGORY_LABELS[s.procurement_category] || s.procurement_category || "—"}</TableCell>
                          <TableCell className="text-right">{s.quantity}</TableCell>
                          <TableCell className="text-right">{s.unit_price ? formatAmount(Number(s.unit_price)) : "—"}</TableCell>
                          <TableCell className="text-right">{s.total_cost ? formatAmount(Number(s.total_cost)) : "—"}</TableCell>
                          <TableCell><StatusBadge status={s.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* — Deployments tab — */}
        <TabsContent value="deployments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Deployments</CardTitle>
              <Button size="sm" onClick={() => setDeplOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Log Deployment
              </Button>
            </CardHeader>
            <CardContent>
              {deployments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No deployments yet. Log one above.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>GPS</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deployments.map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.items?.name || "—"}</TableCell>
                          <TableCell className="text-right">{d.quantity}</TableCell>
                          <TableCell>{d.location_name || "—"}</TableCell>
                          <TableCell>{d.deployment_date}</TableCell>
                          <TableCell>
                            {d.gps_latitude && d.gps_longitude ? (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                {Number(d.gps_latitude).toFixed(4)}, {Number(d.gps_longitude).toFixed(4)}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell><StatusBadge status={d.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* — Repairs tab — */}
        <TabsContent value="repairs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Repairs</CardTitle>
              <Button size="sm" onClick={() => setRepairOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Log Repair
              </Button>
            </CardHeader>
            <CardContent>
              {repairs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No repairs yet. Log one above.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serial #</TableHead>
                        <TableHead>Device Type</TableHead>
                        <TableHead>Fault</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repairs.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-sm font-medium">{r.serial_number}</TableCell>
                          <TableCell>{r.device_type || "—"}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm">{r.fault_description}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.fault_category || "—"}</TableCell>
                          <TableCell>
                            <Badge className={r.priority === "high" ? "bg-red-100 text-red-800 border-transparent" : r.priority === "low" ? "bg-muted text-muted-foreground border-transparent" : "bg-blue-100 text-blue-800 border-transparent"}>
                              {r.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{r.total_cost ? formatAmount(Number(r.total_cost)) : "—"}</TableCell>
                          <TableCell>
                            <Badge className={REPAIR_STATUS_COLORS[r.status] || ""}>
                              {r.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Log Shipment Dialog ===== */}
      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Shipment</DialogTitle>
            <DialogDescription>Record a new procurement shipment for <strong>{project.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={shipForm.item_id} onValueChange={(v) => setShipForm((f) => ({ ...f, item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select an item" /></SelectTrigger>
                <SelectContent>
                  {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {items.length === 0 && <p className="text-xs text-amber-600">No items in catalog yet. Add items in Items Catalog first.</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" min={1} value={shipForm.quantity} onChange={(e) => setShipForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="500" />
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input type="number" min={0} step="0.01" value={shipForm.unit_price} onChange={(e) => setShipForm((f) => ({ ...f, unit_price: e.target.value }))} placeholder="12.50" />
              </div>
              <div className="space-y-2">
                <Label>Total</Label>
                <Input readOnly className="bg-muted" value={shipForm.quantity && shipForm.unit_price ? `$${(parseFloat(shipForm.quantity) * parseFloat(shipForm.unit_price)).toFixed(2)}` : "—"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Input value={shipForm.supplier} onChange={(e) => setShipForm((f) => ({ ...f, supplier: e.target.value }))} placeholder="e.g. EcoStove Ltd" />
              </div>
              <div className="space-y-2">
                <Label>Procurement Type</Label>
                <Select value={shipForm.procurement_type} onValueChange={(v: "local" | "imported") => setShipForm((f) => ({ ...f, procurement_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Locally Purchased</SelectItem>
                    <SelectItem value="imported">Imported</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={shipForm.procurement_category} onValueChange={(v: ProcurementCategory) => setShipForm((f) => ({ ...f, procurement_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROCUREMENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Origin Country</Label>
                <Input value={shipForm.origin_country} onChange={(e) => setShipForm((f) => ({ ...f, origin_country: e.target.value }))} placeholder="e.g. China" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expected Arrival</Label>
              <Input type="date" value={shipForm.expected_arrival} onChange={(e) => setShipForm((f) => ({ ...f, expected_arrival: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={shipForm.notes} onChange={(e) => setShipForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional details..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipOpen(false)}>Cancel</Button>
            <Button onClick={handleLogShipment} disabled={shipSaving || !shipForm.item_id || !shipForm.quantity || !shipForm.supplier}>
              {shipSaving ? "Saving…" : "Log Shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Log Deployment Dialog ===== */}
      <Dialog open={deplOpen} onOpenChange={setDeplOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Deployment</DialogTitle>
            <DialogDescription>Record a field deployment for <strong>{project.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select value={deplForm.item_id} onValueChange={(v) => setDeplForm((f) => ({ ...f, item_id: v, stock_batch_id: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stock Batch *</Label>
                <Select value={deplForm.stock_batch_id} onValueChange={(v) => setDeplForm((f) => ({ ...f, stock_batch_id: v }))} disabled={!deplForm.item_id}>
                  <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                  <SelectContent>
                    {filteredBatches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.shipments?.supplier || "Batch"} — {b.quantity_available} avail</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {deplForm.item_id && filteredBatches.length === 0 && <p className="text-xs text-amber-600">No stock available for this item.</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" min={1} max={selectedBatch?.quantity_available} value={deplForm.quantity} onChange={(e) => setDeplForm((f) => ({ ...f, quantity: e.target.value }))} placeholder={selectedBatch ? `Max: ${selectedBatch.quantity_available}` : ""} />
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={deplForm.deployment_date} onChange={(e) => setDeplForm((f) => ({ ...f, deployment_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location Name</Label>
              <Input value={deplForm.location_name} onChange={(e) => setDeplForm((f) => ({ ...f, location_name: e.target.value }))} placeholder="e.g. Kibera Community Centre" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <Label>GPS Coordinates</Label>
                <Button type="button" size="sm" variant="outline" onClick={captureGPS} disabled={gpsLoading}>
                  {gpsLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MapPin className="mr-1 h-3 w-3" />}
                  {gpsLoading ? "Capturing…" : "Capture GPS"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" step="any" placeholder="Latitude" value={deplForm.gps_latitude} onChange={(e) => setDeplForm((f) => ({ ...f, gps_latitude: e.target.value }))} />
                <Input type="number" step="any" placeholder="Longitude" value={deplForm.gps_longitude} onChange={(e) => setDeplForm((f) => ({ ...f, gps_longitude: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Evidence Photo</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("depl-evidence")?.click()}>
                  <Camera className="mr-1 h-3 w-3" />
                  {evidenceFile ? "Change Photo" : "Upload Photo"}
                </Button>
                {evidenceFile && <span className="text-xs text-muted-foreground truncate max-w-[180px]">{evidenceFile.name}</span>}
              </div>
              <input id="depl-evidence" type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={deplForm.notes} onChange={(e) => setDeplForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Deployment notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeplOpen(false)}>Cancel</Button>
            <Button onClick={handleLogDeployment} disabled={deplSaving || uploading || !deplForm.item_id || !deplForm.stock_batch_id || !deplForm.quantity}>
              {deplSaving || uploading ? "Saving…" : "Log Deployment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Log Repair Dialog ===== */}
      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Repair</DialogTitle>
            <DialogDescription>Record a device repair for <strong>{project.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Serial Number *</Label>
                <Input value={repairForm.serial_number} onChange={(e) => setRepairForm((f) => ({ ...f, serial_number: e.target.value }))} placeholder="e.g. SN-001234" />
              </div>
              <div className="space-y-2">
                <Label>Device Type</Label>
                <Input value={repairForm.device_type} onChange={(e) => setRepairForm((f) => ({ ...f, device_type: e.target.value }))} placeholder="e.g. AC PCB, Cookstove" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fault Description *</Label>
              <Textarea value={repairForm.fault_description} onChange={(e) => setRepairForm((f) => ({ ...f, fault_description: e.target.value }))} placeholder="Describe the fault..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fault Category</Label>
                <Input value={repairForm.fault_category} onChange={(e) => setRepairForm((f) => ({ ...f, fault_category: e.target.value }))} placeholder="e.g. PCB Fault" />
              </div>
              <div className="space-y-2">
                <Label>Repair Action</Label>
                <Input value={repairForm.repair_action} onChange={(e) => setRepairForm((f) => ({ ...f, repair_action: e.target.value }))} placeholder="e.g. Replaced capacitor" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Components Replaced</Label>
              <Input value={repairForm.components_replaced} onChange={(e) => setRepairForm((f) => ({ ...f, components_replaced: e.target.value }))} placeholder="e.g. Fuse, relay" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={repairForm.status} onValueChange={(v) => setRepairForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPAIR_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={repairForm.priority} onValueChange={(v) => setRepairForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Repair Cost ($)</Label>
                <Input type="number" min={0} step="0.01" value={repairForm.total_cost} onChange={(e) => setRepairForm((f) => ({ ...f, total_cost: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={repairForm.notes} onChange={(e) => setRepairForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional repair notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepairOpen(false)}>Cancel</Button>
            <Button onClick={handleLogRepair} disabled={repairSaving || !repairForm.serial_number || !repairForm.fault_description}>
              {repairSaving ? "Saving…" : "Log Repair"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
