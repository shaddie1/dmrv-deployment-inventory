import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";

interface BulkPriceCorrectionProps {
  onCorrectionComplete: () => void;
}

interface ShipmentToFix {
  id: string;
  item_name: string;
  supplier: string;
  quantity: number;
  unit_price: number;
  total_cost: number;
  corrected_unit: number;
  corrected_total: number;
}

export function BulkPriceCorrection({ onCorrectionComplete }: BulkPriceCorrectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const [open, setOpen] = useState(false);
  const [sourceCurrency, setSourceCurrency] = useState<CurrencyCode>("KES");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [shipments, setShipments] = useState<ShipmentToFix[]>([]);
  const [fetched, setFetched] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const rate = CURRENCIES[sourceCurrency].rate;

  const fetchBulkImportedShipments = async () => {
    setLoading(true);
    setFetched(false);
    setUsedFallback(false);

    // Try audit_log first to find bulk-imported IDs
    const { data: auditRows } = await supabase
      .from("audit_log")
      .select("entity_id")
      .eq("action", "bulk_import")
      .eq("entity_type", "shipment");

    let query = supabase
      .from("shipments")
      .select("id, quantity, unit_price, total_cost, supplier, items(name)")
      .order("created_at", { ascending: false });

    if (auditRows && auditRows.length > 0) {
      const ids = auditRows.map((r) => r.entity_id);
      query = query.in("id", ids);
    } else {
      // No audit trail — fall back to all shipments
      setUsedFallback(true);
    }

    const { data: ships } = await query;

    const rows: ShipmentToFix[] = (ships || []).map((s: any) => ({
      id: s.id,
      item_name: s.items?.name || "—",
      supplier: s.supplier || "—",
      quantity: s.quantity,
      unit_price: Number(s.unit_price) || 0,
      total_cost: Number(s.total_cost) || 0,
      corrected_unit: (Number(s.unit_price) || 0) / rate,
      corrected_total: (Number(s.total_cost) || 0) / rate,
    }));

    setShipments(rows);
    setFetched(true);
    setLoading(false);
  };

  // Recompute corrected values when currency changes
  const recalculate = (newRate: number) =>
    setShipments((prev) =>
      prev.map((s) => ({
        ...s,
        corrected_unit: s.unit_price / newRate,
        corrected_total: s.total_cost / newRate,
      }))
    );

  const handleCurrencyChange = (code: CurrencyCode) => {
    setSourceCurrency(code);
    if (fetched) recalculate(CURRENCIES[code].rate);
  };

  const handleApply = async () => {
    if (!user || shipments.length === 0) return;
    setApplying(true);

    const errors: string[] = [];
    for (const s of shipments) {
      const { error } = await supabase
        .from("shipments")
        .update({
          unit_price: Math.round(s.corrected_unit * 100) / 100,
          total_cost: Math.round(s.corrected_total * 100) / 100,
        })
        .eq("id", s.id);

      if (error) errors.push(s.id);
      else {
        logAudit({
          userId: user.id,
          action: "price_correction",
          entityType: "shipment",
          entityId: s.id,
          beforeData: { unit_price: s.unit_price, total_cost: s.total_cost, currency: sourceCurrency },
          afterData: { unit_price: s.corrected_unit, total_cost: s.corrected_total, currency: "USD" },
        });
      }
    }

    setApplying(false);

    if (errors.length > 0) {
      toast({
        title: "Partial failure",
        description: `${errors.length} shipment(s) failed to update.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Prices corrected",
        description: `${shipments.length} shipment(s) updated from ${sourceCurrency} → USD.`,
      });
      setOpen(false);
      setShipments([]);
      setFetched(false);
      onCorrectionComplete();
    }
  };

  const totalSavingDiff = shipments.reduce(
    (acc, s) => ({ before: acc.before + s.total_cost, after: acc.after + s.corrected_total }),
    { before: 0, after: 0 }
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); setShipments([]); setFetched(false); }}>
        <RefreshCw className="mr-1 h-4 w-4" /> Fix Import Prices
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Correct Bulk Import Prices</DialogTitle>
            <DialogDescription>
              If your CSV prices were in a local currency (e.g. KES), use this tool to convert
              them to their correct USD equivalent. The audit log is used to identify bulk-imported shipments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-auto">
            {/* Currency selector */}
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  This will divide the stored prices by the selected currency rate to get the correct USD value.
                  This action is <strong>irreversible via this tool</strong> — make sure your selection is correct.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Original currency in your CSV</Label>
                  <Select value={sourceCurrency} onValueChange={(v) => handleCurrencyChange(v as CurrencyCode)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(CURRENCIES)
                        .filter((c) => c.code !== "USD")
                        .map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.symbol} {c.code} — {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="pt-5 text-sm text-muted-foreground">
                  ÷ {rate.toLocaleString()} = USD value
                </div>
              </div>
            </div>

            {/* Fetch button */}
            {!fetched && (
              <Button onClick={fetchBulkImportedShipments} disabled={loading} className="w-full" variant="outline">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading bulk-imported shipments…</>
                ) : (
                  "Preview corrections"
                )}
              </Button>
            )}

            {/* Results */}
            {fetched && shipments.length === 0 && (
              <div className="rounded-lg border p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm font-medium">No shipments found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No shipments exist in the system yet.
                </p>
              </div>
            )}

            {fetched && usedFallback && shipments.length > 0 && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-700 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                <p className="text-xs text-orange-800 dark:text-orange-300">
                  No bulk-import audit trail was found — showing <strong>all {shipments.length} shipments</strong>.
                  Only proceed if all of them have prices stored in {sourceCurrency} that need converting.
                </p>
              </div>
            )}

            {fetched && shipments.length > 0 && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{shipments.length} shipment(s) found</span>
                  <Badge variant="secondary" className="gap-1">
                    Total: {formatAmount(totalSavingDiff.before)}
                    <ArrowRight className="h-3 w-3" />
                    {formatAmount(totalSavingDiff.after)}
                  </Badge>
                </div>

                <div className="overflow-auto max-h-[40vh] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">
                          Stored Price ({sourceCurrency})
                        </TableHead>
                        <TableHead className="text-right">→ Corrected (USD)</TableHead>
                        <TableHead className="text-right">Total After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipments.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm font-medium">{s.item_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.supplier}</TableCell>
                          <TableCell className="text-right text-sm">{s.quantity}</TableCell>
                          <TableCell className="text-right text-sm text-red-600 dark:text-red-400">
                            {CURRENCIES[sourceCurrency].symbol} {s.unit_price.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm text-green-600 dark:text-green-400 font-medium">
                            {formatAmount(s.corrected_unit)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatAmount(s.corrected_total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setFetched(false); setShipments([]); fetchBulkImportedShipments(); }}
                  disabled={loading}
                >
                  <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {fetched && shipments.length > 0 && (
              <Button onClick={handleApply} disabled={applying}>
                {applying ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Applying…</>
                ) : (
                  `Apply ${sourceCurrency} → USD correction (${shipments.length} shipments)`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
