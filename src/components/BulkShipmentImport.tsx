import { useState, useRef, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency, CURRENCIES, type CurrencyCode } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, ImagePlus, X, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";

interface ItemOption {
  id: string;
  name: string;
  category: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ParsedRow {
  item_name: string;
  quantity: string;
  unit_price: string;
  supplier: string;
  origin_country: string;
  procurement_type: string;
  procurement_category: string;
  project_name: string;
  expected_arrival: string;
  payment_reference: string;
  notes: string;
  errors: string[];
  item_id?: string;
  project_id?: string;
  receiptFiles: File[];
}

interface BulkShipmentImportProps {
  items: ItemOption[];
  projects: ProjectOption[];
  onImportComplete: () => void;
}

const TEMPLATE_HEADERS = [
  "item_name", "quantity", "unit_price", "supplier", "origin_country",
  "procurement_type", "procurement_category", "project_name",
  "expected_arrival", "payment_reference", "notes",
];

const TEMPLATE_EXAMPLE = [
  "DC PCB Board", "100", "12.50", "EcoStove Ltd", "China",
  "imported", "pcb_dc", "MECs", "2026-04-15", "MPESA-REF-12345", "Bulk order for Q2",
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function BulkShipmentImport({ items, projects, onImportComplete }: BulkShipmentImportProps) {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<"upload" | "review" | "receipts">("upload");
  const [batchReceipts, setBatchReceipts] = useState<File[]>([]);
  const [priceCurrency, setPriceCurrency] = useState<CurrencyCode>("USD");

  const VALID_PROC_TYPES = ["local", "imported"];
  const VALID_CATEGORIES = ["consumable", "tool", "pcb_dc", "pcb_ac", "other"];
  const CATEGORY_ALIASES: Record<string, string> = {
    tools: "tool", consumables: "consumable", "pcb dc": "pcb_dc", "pcb ac": "pcb_ac",
  };

  const normalizeWhitespace = (s: string) => s.replace(/\s+/g, " ").trim();

  const downloadTemplate = () => {
    const lines = [
      TEMPLATE_HEADERS.join(","),
      TEMPLATE_EXAMPLE.map(v => v.includes(",") ? `"${v}"` : v).join(","),
      ["Soldering Iron 60W", "5", "25.00", "Local Hardware", "Kenya", "local", "tool", "Nyalore Impact", "2026-03-20", "INV-2026-001", ""].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shipment_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast({ title: "Empty file", description: "The CSV file has no data rows.", variant: "destructive" });
        return;
      }

      // Parse headers to build column index map (handles extra/reordered columns)
      const headerCols = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));
      const colIndex = (name: string) => headerCols.indexOf(name);

      const dataLines = lines.slice(1);
      const itemMap = new Map(items.map(i => [i.name.toLowerCase().replace(/\s+/g, " "), i.id]));
      const projectMap = new Map(projects.map(p => [p.name.toLowerCase(), p.id]));

      const getCol = (cols: string[], name: string, fallback = "") => {
        const idx = colIndex(name);
        return idx >= 0 ? (cols[idx] || "").trim() : fallback;
      };

      const rows: ParsedRow[] = dataLines.map(line => {
        const cols = parseCsvLine(line);
        const rawCategory = getCol(cols, "procurement_category", "other").toLowerCase();
        const resolvedCategory = CATEGORY_ALIASES[rawCategory] || rawCategory;
        const itemName = normalizeWhitespace(getCol(cols, "item_name"));

        const row: ParsedRow = {
          item_name: itemName,
          quantity: getCol(cols, "quantity"),
          unit_price: getCol(cols, "unit_price"),
          supplier: getCol(cols, "supplier"),
          origin_country: getCol(cols, "origin_country"),
          procurement_type: getCol(cols, "procurement_type", "imported"),
          procurement_category: resolvedCategory,
          project_name: getCol(cols, "project_name"),
          expected_arrival: getCol(cols, "expected_arrival"),
          payment_reference: getCol(cols, "payment_reference"),
          notes: getCol(cols, "notes"),
          errors: [], receiptFiles: [],
        };

        if (!row.item_name) { row.errors.push("Item name is required"); }
        else {
          const match = itemMap.get(row.item_name.toLowerCase());
          if (!match) row.errors.push(`Item "${row.item_name}" not found in catalog`);
          else row.item_id = match;
        }
        if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) < 1) row.errors.push("Invalid quantity");
        if (!row.supplier) row.errors.push("Supplier is required");
        if (row.procurement_type && !VALID_PROC_TYPES.includes(row.procurement_type.toLowerCase())) row.errors.push(`Invalid procurement_type`);
        if (row.procurement_category && !VALID_CATEGORIES.includes(row.procurement_category)) row.errors.push(`Invalid category "${rawCategory}"`);
        if (row.project_name) {
          const pMatch = projectMap.get(row.project_name.toLowerCase());
          if (!pMatch) row.errors.push(`Project "${row.project_name}" not found`);
          else row.project_id = pMatch;
        }
        return row;
      });

      setParsedRows(rows);
      setStep("review");
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validRows = parsedRows.filter(r => r.errors.length === 0);
  const errorRows = parsedRows.filter(r => r.errors.length > 0);

  const addRowReceipt = (rowIndex: number, files: FileList | null) => {
    if (!files) return;
    setParsedRows(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, receiptFiles: [...r.receiptFiles, ...Array.from(files)] } : r
    ));
  };

  const removeRowReceipt = (rowIndex: number, fileIndex: number) => {
    setParsedRows(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, receiptFiles: r.receiptFiles.filter((_, fi) => fi !== fileIndex) } : r
    ));
  };

  const uploadReceiptForShipment = async (file: File, shipmentId: string) => {
    if (!user) return;
    const filePath = `shipments/${shipmentId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("evidence").upload(filePath, file);
    if (uploadError) return;

    const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(filePath);
    const sha256 = await computeSha256(file);

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
  };

  const handleImport = async () => {
    if (!user || validRows.length === 0) return;
    setImporting(true);

    const currencyRate = CURRENCIES[priceCurrency].rate; // rate = units per 1 USD
    const payloads = validRows.map(r => {
      const qty = parseInt(r.quantity, 10);
      const rawPrice = parseFloat(r.unit_price) || 0;
      // Convert from the selected currency to USD for storage
      const price = priceCurrency === "USD" ? rawPrice : rawPrice / currencyRate;
      return {
        item_id: r.item_id!, quantity: qty, unit_price: price, total_cost: qty * price,
        supplier: r.supplier, origin_country: r.origin_country || "",
        procurement_type: r.procurement_type.toLowerCase() || "imported",
        procurement_category: (r.procurement_category.toLowerCase() || "other") as any,
        project_id: r.project_id || null, expected_arrival: r.expected_arrival || null,
        notes: [r.payment_reference ? `Payment Ref: ${r.payment_reference}` : "", r.notes].filter(Boolean).join(" | ") || null,
        created_by: user.id,
      };
    });

    const { data, error } = await supabase.from("shipments").insert(payloads).select("id");

    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
      setImporting(false);
      return;
    }

    const shipmentIds = (data || []).map(d => d.id);

    // Upload batch receipts to all shipments
    for (const file of batchReceipts) {
      for (const sid of shipmentIds) {
        await uploadReceiptForShipment(file, sid);
      }
    }

    // Upload per-row receipts
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const sid = shipmentIds[i];
      if (sid && row.receiptFiles.length > 0) {
        for (const file of row.receiptFiles) {
          await uploadReceiptForShipment(file, sid);
        }
      }
    }

    shipmentIds.forEach(id => {
      logAudit({ userId: user.id, action: "bulk_import", entityType: "shipment", entityId: id, afterData: { source: "csv_import" } });
    });

    toast({ title: "Import successful", description: `${shipmentIds.length} shipments created with receipts attached.` });
    setParsedRows([]);
    setBatchReceipts([]);
    setStep("upload");
    setOpen(false);
    onImportComplete();
    setImporting(false);
  };

  const totalReceipts = batchReceipts.length + validRows.reduce((sum, r) => sum + r.receiptFiles.length, 0);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setStep("upload"); setParsedRows([]); setBatchReceipts([]); setPriceCurrency("USD"); setOpen(true); }}>
        <FileSpreadsheet className="mr-1 h-4 w-4" /> Bulk Import
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Shipment Import</DialogTitle>
            <DialogDescription>
              {step === "upload" && "Download the CSV template, fill in your shipments, then upload it here."}
              {step === "review" && "Review parsed rows, then proceed to attach proof of payment."}
              {step === "receipts" && "Attach proof of payment photos/documents to your shipments."}
            </DialogDescription>
          </DialogHeader>

          {step === "upload" && (
            <div className="space-y-4 py-4">
              {/* Currency of prices in the file */}
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <Label className="text-sm font-medium">Currency of prices in your file</Label>
                <p className="text-xs text-muted-foreground">
                  Prices will be converted to USD for storage. Select the currency you used in the spreadsheet.
                </p>
                <Select value={priceCurrency} onValueChange={(v) => setPriceCurrency(v as CurrencyCode)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CURRENCIES).map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {priceCurrency !== "USD" && (
                  <p className="text-xs text-primary">
                    1 USD = {CURRENCIES[priceCurrency].rate.toLocaleString()} {priceCurrency} — prices will be divided by {CURRENCIES[priceCurrency].rate.toLocaleString()} on import.
                  </p>
                )}
              </div>

              <div className="rounded-lg border-2 border-dashed border-border p-6 text-center space-y-3">
                <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Step 1: Download the template</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fill in item names (must match your Items Catalog), quantities, prices, payment references, and other details.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="mr-1 h-4 w-4" /> Download CSV Template
                </Button>
              </div>

              <div className="rounded-lg border-2 border-dashed border-border p-6 text-center space-y-3">
                <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Step 2: Upload your filled CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The system will validate entries, then let you attach proof of payment before importing.
                  </p>
                </div>
                <label className="cursor-pointer">
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  <Button variant="default" size="sm" asChild>
                    <span><Upload className="mr-1 h-4 w-4" /> Upload CSV</span>
                  </Button>
                </label>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Valid procurement types:</strong> local, imported</p>
                <p><strong>Valid categories:</strong> consumable, tool, pcb_dc, pcb_ac, other</p>
                <p><strong>Item names</strong> must exactly match entries in your Items Catalog</p>
                <p><strong>Project names</strong> must exactly match existing projects</p>
                <p><strong>Payment reference</strong> e.g. MPESA code, invoice number, bank ref</p>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="flex-1 overflow-auto space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-status-success">
                  <CheckCircle2 className="h-4 w-4" /> {validRows.length} valid
                </span>
                {errorRows.length > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> {errorRows.length} with errors
                  </span>
                )}
                <span className="text-muted-foreground">{parsedRows.length} total rows</span>
              </div>

              <div className="overflow-auto max-h-[45vh] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Payment Ref</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, i) => (
                      <TableRow key={i} className={row.errors.length > 0 ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm">{row.item_name || "—"}</TableCell>
                        <TableCell className="text-right text-sm">{row.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {row.unit_price ? (
                            <span>
                              <span className="text-muted-foreground">{CURRENCIES[priceCurrency].symbol} {Number(row.unit_price).toLocaleString()}</span>
                              {priceCurrency !== "USD" && (
                                <span className="ml-1 text-xs text-primary">
                                  = {formatAmount(Number(row.unit_price) / CURRENCIES[priceCurrency].rate)}
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{row.supplier || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.payment_reference || "—"}</TableCell>
                        <TableCell>
                          {row.errors.length > 0 ? (
                            <span className="text-xs text-destructive" title={row.errors.join("; ")}>
                              <AlertTriangle className="inline h-3 w-3 mr-1" />{row.errors[0]}
                            </span>
                          ) : (
                            <span className="text-xs text-status-success">
                              <CheckCircle2 className="inline h-3 w-3 mr-1" />OK
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === "receipts" && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Shared batch receipts */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Shared Batch Receipt(s)</p>
                    <p className="text-xs text-muted-foreground">These will be linked to ALL {validRows.length} shipments</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {batchReceipts.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setBatchReceipts(prev => prev.filter((_, fi) => fi !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="cursor-pointer inline-block">
                  <input type="file" accept="image/*,.pdf" multiple className="hidden"
                    onChange={e => { if (e.target.files) setBatchReceipts(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
                  <Button variant="outline" size="sm" asChild>
                    <span><Upload className="mr-1 h-4 w-4" /> Add Batch Receipt</span>
                  </Button>
                </label>
              </div>

              {/* Per-row receipts */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Per-Shipment Receipts (optional)</p>
                <p className="text-xs text-muted-foreground">Attach specific receipts to individual shipments</p>
                <div className="overflow-auto max-h-[30vh] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Payment Ref</TableHead>
                        <TableHead>Receipts</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validRows.map((row, i) => {
                        const originalIndex = parsedRows.indexOf(row);
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="text-sm">{row.item_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.payment_reference || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {row.receiptFiles.map((f, fi) => (
                                  <span key={fi} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                                    <span className="max-w-[80px] truncate">{f.name}</span>
                                    <button onClick={() => removeRowReceipt(originalIndex, fi)} className="text-muted-foreground hover:text-destructive">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                                {row.receiptFiles.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <label className="cursor-pointer">
                                <input type="file" accept="image/*,.pdf" multiple className="hidden"
                                  onChange={e => { addRowReceipt(originalIndex, e.target.files); e.target.value = ""; }} />
                                <ImagePlus className="h-4 w-4 text-muted-foreground hover:text-primary cursor-pointer" />
                              </label>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {step === "review" && (
              <>
                <Button variant="ghost" onClick={() => { setStep("upload"); setParsedRows([]); }}>Back</Button>
                <Button onClick={() => setStep("receipts")} disabled={validRows.length === 0}>
                  Next: Attach Receipts ({validRows.length} valid)
                </Button>
              </>
            )}
            {step === "receipts" && (
              <>
                <Button variant="ghost" onClick={() => setStep("review")}>Back</Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing…</>
                  ) : (
                    `Import ${validRows.length} Shipment${validRows.length !== 1 ? "s" : ""}${totalReceipts > 0 ? ` + ${totalReceipts} receipt${totalReceipts !== 1 ? "s" : ""}` : ""}`
                  )}
                </Button>
              </>
            )}
            {step === "upload" && (
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
