import { useEffect, useState, useCallback, type ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package, Plus, Search, Edit, Flame, Wifi, Radio, Cpu, HelpCircle, Wrench, Link2, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Item = Tables<"items">;
type ItemCategory =
  | "cookstove" | "iot_device" | "antenna" | "sensor" | "other"
  | "dmrv_pcb" | "dc_pcb" | "ac_pcb"
  | "home_gas_meter" | "industrial_gas_meter"
  | "tool" | "consumable";

type ItemSpecs = {
  unit_price_usd?: number | null;
  parent_item_id?: string | null;
  [key: string]: unknown;
};

function getSpecs(item: Item): ItemSpecs {
  if (!item.specifications || typeof item.specifications !== "object" || Array.isArray(item.specifications)) return {};
  return item.specifications as ItemSpecs;
}

const CATEGORIES: { value: ItemCategory; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: "cookstove", label: "Cookstove", icon: Flame },
  { value: "home_gas_meter", label: "Home Gas Meter", icon: Cpu },
  { value: "industrial_gas_meter", label: "Institutional Gas Meter", icon: Cpu },
  { value: "ac_pcb", label: "AC PCB", icon: Cpu },
  { value: "dc_pcb", label: "DC PCB", icon: Cpu },
  { value: "dmrv_pcb", label: "DMRV PCB", icon: Cpu },
  { value: "tool", label: "Tools", icon: Wrench },
  { value: "consumable", label: "Consumables", icon: Package },
  { value: "iot_device", label: "IoT Device", icon: Wifi },
  { value: "antenna", label: "Antenna", icon: Radio },
  { value: "sensor", label: "Sensor", icon: Cpu },
  { value: "other", label: "Other", icon: HelpCircle },
];

const categoryColors: Record<ItemCategory, string> = {
  cookstove: "bg-orange-100 text-orange-800 border-transparent dark:bg-orange-900/30 dark:text-orange-300",
  home_gas_meter: "bg-blue-100 text-blue-800 border-transparent dark:bg-blue-900/30 dark:text-blue-300",
  industrial_gas_meter: "bg-indigo-100 text-indigo-800 border-transparent dark:bg-indigo-900/30 dark:text-indigo-300",
  ac_pcb: "bg-purple-100 text-purple-800 border-transparent dark:bg-purple-900/30 dark:text-purple-300",
  dc_pcb: "bg-violet-100 text-violet-800 border-transparent dark:bg-violet-900/30 dark:text-violet-300",
  dmrv_pcb: "bg-fuchsia-100 text-fuchsia-800 border-transparent dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  tool: "bg-yellow-100 text-yellow-800 border-transparent dark:bg-yellow-900/30 dark:text-yellow-300",
  consumable: "bg-green-100 text-green-800 border-transparent dark:bg-green-900/30 dark:text-green-300",
  iot_device: "bg-cyan-100 text-cyan-800 border-transparent dark:bg-cyan-900/30 dark:text-cyan-300",
  antenna: "bg-primary/10 text-primary border-transparent",
  sensor: "bg-teal-100 text-teal-800 border-transparent dark:bg-teal-900/30 dark:text-teal-300",
  other: "bg-muted text-muted-foreground border-transparent",
};

function getCategoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
}

type TabView = "all" | "main" | "parts";

export default function ItemsPage() {
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const canManage = hasRole("admin") || hasRole("warehouse_manager");

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tab, setTab] = useState<TabView>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [isReplacementPart, setIsReplacementPart] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "other" as ItemCategory,
    unit_of_measure: "unit",
    description: "",
    low_stock_threshold: "10",
    unit_price_usd: "",
    parent_item_id: "",
  });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("items")
      .select("*")
      .order("name", { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Derive helpers
  const mainItems = items.filter((i) => !getSpecs(i).parent_item_id);
  const partItems = items.filter((i) => !!getSpecs(i).parent_item_id);

  const parentName = (item: Item) => {
    const pid = getSpecs(item).parent_item_id;
    return items.find((i) => i.id === pid)?.name ?? "—";
  };

  const partCount = (item: Item) =>
    items.filter((i) => getSpecs(i).parent_item_id === item.id).length;

  // Filtered list based on tab + search + category
  const baseList = tab === "main" ? mainItems : tab === "parts" ? partItems : items;
  const filtered = baseList.filter((item) => {
    const matchSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const categoryCounts = CATEGORIES.map((c) => ({
    ...c,
    count: baseList.filter((i) => i.category === c.value).length,
  }));

  const openCreate = () => {
    setEditing(null);
    setIsReplacementPart(false);
    setForm({ name: "", category: "other", unit_of_measure: "unit", description: "", low_stock_threshold: "10", unit_price_usd: "", parent_item_id: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: Item) => {
    const specs = getSpecs(item);
    const hasParent = !!specs.parent_item_id;
    setEditing(item);
    setIsReplacementPart(hasParent);
    setForm({
      name: item.name,
      category: item.category as ItemCategory,
      unit_of_measure: item.unit_of_measure,
      description: item.description || "",
      low_stock_threshold: String(item.low_stock_threshold),
      unit_price_usd: specs.unit_price_usd != null ? String(specs.unit_price_usd) : "",
      parent_item_id: specs.parent_item_id ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const existingSpecs = editing ? (getSpecs(editing) as Record<string, unknown>) : {};
    const newSpecs: ItemSpecs = {
      ...existingSpecs,
      unit_price_usd: form.unit_price_usd ? parseFloat(form.unit_price_usd) : null,
      parent_item_id: isReplacementPart && form.parent_item_id ? form.parent_item_id : null,
    };

    const payload = {
      name: form.name.trim(),
      category: form.category,
      unit_of_measure: form.unit_of_measure.trim() || "unit",
      description: form.description.trim() || null,
      low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 10,
      specifications: newSpecs,
    };

    if (editing) {
      const { error } = await supabase.from("items").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        if (user) logAudit({ userId: user.id, action: "update", entityType: "item", entityId: editing.id, beforeData: { name: editing.name }, afterData: payload });
        toast({ title: "Item updated", description: payload.name });
        setDialogOpen(false);
        fetchItems();
      }
    } else {
      const { data, error } = await supabase.from("items").insert(payload as TablesInsert<"items">).select("id").single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        if (user && data) logAudit({ userId: user.id, action: "create", entityType: "item", entityId: data.id, afterData: payload });
        toast({ title: "Item created", description: payload.name });
        setDialogOpen(false);
        fetchItems();
      }
    }
    setSaving(false);
  };

  const getCategoryIcon = (category: string) => {
    return CATEGORIES.find((c) => c.value === category)?.icon ?? HelpCircle;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items Catalog</h1>
          <p className="text-muted-foreground">Manage item types, prices, and replacement parts</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New Item
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabView); setCategoryFilter("all"); }}>
        <TabsList>
          <TabsTrigger value="all">All Items ({items.length})</TabsTrigger>
          <TabsTrigger value="main">Main Catalog ({mainItems.length})</TabsTrigger>
          <TabsTrigger value="parts">Spare &amp; Replacement Parts ({partItems.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Category summary cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {categoryCounts.map((c) => (
          <Card
            key={c.value}
            className={cn(
              "cursor-pointer transition-shadow hover:shadow-md",
              categoryFilter === c.value && "ring-2 ring-primary"
            )}
            onClick={() => setCategoryFilter(categoryFilter === c.value ? "all" : c.value)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">{c.label}</CardTitle>
              <c.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="text-xl font-bold">{c.count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or description…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tab === "parts" ? "Spare & Replacement Parts" : tab === "main" ? "Main Catalog" : "All Items"} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery || categoryFilter !== "all"
                ? "No items match your filters."
                : tab === "parts"
                ? "No replacement parts yet. Create one by toggling 'Replacement Part' when adding an item."
                : "No items yet. Create one to get started."}
            </p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Unit</TableHead>
                    {tab !== "parts" && <TableHead>Parts</TableHead>}
                    {tab === "parts" && <TableHead>Part Of</TableHead>}
                    <TableHead>Low Stock</TableHead>
                    <TableHead className="max-w-[160px]">Description</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const Icon = getCategoryIcon(item.category);
                    const specs = getSpecs(item);
                    const price = specs.unit_price_usd;
                    const parts = partCount(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="font-medium">{item.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", categoryColors[item.category as ItemCategory])}>
                            {getCategoryLabel(item.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {price != null ? (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3 text-muted-foreground" />
                              {formatAmount(price)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.unit_of_measure}</TableCell>
                        {tab !== "parts" && (
                          <TableCell>
                            {parts > 0 ? (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <Link2 className="h-3 w-3" />{parts}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {tab === "parts" && (
                          <TableCell className="text-sm text-muted-foreground">{parentName(item)}</TableCell>
                        )}
                        <TableCell className="text-sm">{item.low_stock_threshold}</TableCell>
                        <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                          {item.description || "—"}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                              <Edit className="h-4 w-4" />
                            </Button>
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "New Item"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update item details." : "Add a new item or replacement part to the catalog."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Replacement part toggle */}
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                id="is-part"
                checked={isReplacementPart}
                onCheckedChange={(v) => {
                  setIsReplacementPart(v);
                  if (!v) setForm((f) => ({ ...f, parent_item_id: "" }));
                }}
              />
              <Label htmlFor="is-part" className="cursor-pointer">
                <span className="font-medium">Replacement / Spare Part</span>
                <span className="ml-2 text-xs text-muted-foreground">Link this item to a parent catalog item</span>
              </Label>
            </div>

            {/* Parent item selector */}
            {isReplacementPart && (
              <div className="space-y-2">
                <Label>Parent Item *</Label>
                <Select
                  value={form.parent_item_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, parent_item_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent item…" />
                  </SelectTrigger>
                  <SelectContent>
                    {mainItems
                      .filter((i) => !editing || i.id !== editing.id)
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={isReplacementPart ? "e.g. Seal Kit, Gas Hose, Fuse" : "e.g. Home Gas Meter Mk2"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v as ItemCategory }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Input
                  value={form.unit_of_measure}
                  onChange={(e) => setForm((f) => ({ ...f, unit_of_measure: e.target.value }))}
                  placeholder="unit, kg, set, piece…"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.unit_price_usd}
                    onChange={(e) => setForm((f) => ({ ...f, unit_price_usd: e.target.value }))}
                    placeholder="0.00"
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Low Stock Threshold</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))}
                  placeholder="10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Specifications, model numbers, notes…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || (isReplacementPart && !form.parent_item_id)}
            >
              {saving ? "Saving…" : editing ? "Update Item" : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
