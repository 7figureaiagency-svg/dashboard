import { useEffect, useState } from "react";
import { Building2, Check, IndianRupee, MapPin, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreatePropertySubmission } from "@/lib/crm-data";
import { formatMoney, type Lead } from "@/lib/crm";

interface AddPropertyListingModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: "FLAT", label: "Apartment / Flat" },
  { value: "VILLA", label: "Villa / Bungalow" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "PLOT", label: "Plot / Land" },
];

const CONFIGURATIONS = [
  "1BHK",
  "2BHK",
  "3BHK",
  "4BHK",
  "5BHK",
  "Penthouse",
  "Row House",
  "Commercial Office",
  "Retail Shop",
  "Plot",
];

export function AddPropertyListingModal({
  lead,
  open,
  onOpenChange,
  onSuccess,
}: AddPropertyListingModalProps) {
  const createSubmission = useCreatePropertySubmission();

  const [category, setCategory] = useState("FLAT");
  const [societyName, setSocietyName] = useState("");
  const [location, setLocation] = useState(lead?.location || "");
  const [configuration, setConfiguration] = useState("3BHK");
  const [transactionType, setTransactionType] = useState<"SALE" | "RENT">("SALE");
  const [priceInLakhs, setPriceInLakhs] = useState("");
  const [rentPerMonth, setRentPerMonth] = useState("");
  const [carpetArea, setCarpetArea] = useState("");
  const [furnishing, setFurnishing] = useState("SEMI_FURNISHED");
  const [possession, setPossession] = useState("READY_TO_MOVE");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setLocation(lead?.location || "");
    }
  }, [open, lead?.location]);

  const calculatedPriceNumber =
    transactionType === "SALE"
      ? Number(priceInLakhs) > 0
        ? Number(priceInLakhs) * 100000
        : null
      : null;

  const calculatedRentNumber =
    transactionType === "RENT" ? (Number(rentPerMonth) > 0 ? Number(rentPerMonth) : null) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!societyName.trim()) {
      toast.error("Please enter the Society or Project name");
      return;
    }
    if (transactionType === "SALE" && (!priceInLakhs || Number(priceInLakhs) <= 0)) {
      toast.error("Please specify the expected asking price in Lakhs");
      return;
    }
    if (transactionType === "RENT" && (!rentPerMonth || Number(rentPerMonth) <= 0)) {
      toast.error("Please specify expected monthly rent");
      return;
    }

    try {
      await createSubmission.mutateAsync({
        submission: {
          client_id: lead?.client_id,
          lead_id: lead?.lead_id,
          owner_name: lead?.name || "Verified Owner",
          owner_phone: lead?.phone || null,
          property_category: category,
          property_type: configuration,
          society_name: societyName.trim(),
          project_name: societyName.trim(),
          location: (location || lead?.location || "").trim() || "Vadodara",
          configuration,
          transaction_type: transactionType,
          carpet_area_sqft: carpetArea ? Number(carpetArea) : null,
          expected_price: calculatedPriceNumber,
          expected_rent: calculatedRentNumber,
          furnishing_status: furnishing,
          possession_status: possession,
          notes: notes.trim() || null,
          status: "PENDING_VERIFICATION",
        },
        lead,
      });

      // Reset form
      setSocietyName("");
      setPriceInLakhs("");
      setRentPerMonth("");
      setCarpetArea("");
      setNotes("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      // Toast handled by mutation onError
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 rounded-2xl border-border/80 bg-card/95 backdrop-blur-md shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Header */}
          <DialogHeader className="p-5 pb-3 border-b border-border/60 text-left bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Building2 className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  <span>Add Seller Property Listing</span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                    Dual Role Engine
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  List property for sale or rent on behalf of <strong>{lead?.name || "Client"}</strong>. Automatically upgrades lead to Dual Role (Buyer + Seller) and activates in-house buyer cross-matching.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Form Content */}
          <div className="p-5 space-y-4">
            {/* Transaction Type Segmented Toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Listing Intent</Label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/50 border border-border/50">
                <button
                  type="button"
                  onClick={() => setTransactionType("SALE")}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    transactionType === "SALE"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🏷️ For Sale (Sell Resale)
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionType("RENT")}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    transactionType === "RENT"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🔑 For Rent (Lease Out)
                </button>
              </div>
            </div>

            {/* Category Segmented Buttons */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Property Category</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all text-center ${
                      category === cat.value
                        ? "border-purple-500/80 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Society / Project Name & Locality */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="society_name" className="text-xs font-semibold text-foreground">
                  Society / Project Name *
                </Label>
                <Input
                  id="society_name"
                  placeholder="e.g. Nilamber Bellissimo, Sun Crest"
                  value={societyName}
                  onChange={(e) => setSocietyName(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="location" className="text-xs font-semibold text-foreground">
                  Locality / Landmark
                </Label>
                <div className="relative">
                  <MapPin className="size-3.5 absolute left-3 top-2.5 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    id="location"
                    placeholder="e.g. Alkapuri, Vasna Road"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="rounded-xl h-9 text-xs pl-8"
                  />
                </div>
              </div>
            </div>

            {/* Configuration & Carpet Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Configuration</Label>
                <Select value={configuration} onValueChange={setConfiguration}>
                  <SelectTrigger className="rounded-xl h-9 text-xs">
                    <SelectValue placeholder="Select Configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIGURATIONS.map((cfg) => (
                      <SelectItem key={cfg} value={cfg}>
                        {cfg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="carpet_area" className="text-xs font-semibold text-foreground">
                  Carpet Area (sq.ft)
                </Label>
                <Input
                  id="carpet_area"
                  type="number"
                  placeholder="e.g. 1450"
                  value={carpetArea}
                  onChange={(e) => setCarpetArea(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
              </div>
            </div>

            {/* Pricing / Demand */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>{transactionType === "SALE" ? "Asking Price (₹ Lakhs) *" : "Monthly Rent (₹) *"}</span>
                {calculatedPriceNumber && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Preview: {formatMoney(calculatedPriceNumber)}
                  </span>
                )}
                {calculatedRentNumber && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Preview: ₹{calculatedRentNumber.toLocaleString("en-IN")}/mo
                  </span>
                )}
              </Label>
              <div className="relative">
                <IndianRupee className="size-3.5 absolute left-3 top-2.5 text-muted-foreground/60 pointer-events-none" />
                {transactionType === "SALE" ? (
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 85 (for ₹85 Lakhs) or 120 (for ₹1.2 Cr)"
                    value={priceInLakhs}
                    onChange={(e) => setPriceInLakhs(e.target.value)}
                    className="rounded-xl h-9 text-xs pl-8"
                    required
                  />
                ) : (
                  <Input
                    type="number"
                    step="500"
                    placeholder="e.g. 35000"
                    value={rentPerMonth}
                    onChange={(e) => setRentPerMonth(e.target.value)}
                    className="rounded-xl h-9 text-xs pl-8"
                    required
                  />
                )}
              </div>
            </div>

            {/* Furnishing & Possession */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Furnishing Status</Label>
                <Select value={furnishing} onValueChange={setFurnishing}>
                  <SelectTrigger className="rounded-xl h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNFURNISHED">Unfurnished</SelectItem>
                    <SelectItem value="SEMI_FURNISHED">Semi-Furnished</SelectItem>
                    <SelectItem value="FURNISHED">Fully Furnished</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Possession Status</Label>
                <Select value={possession} onValueChange={setPossession}>
                  <SelectTrigger className="rounded-xl h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READY_TO_MOVE">Ready to Move</SelectItem>
                    <SelectItem value="WITHIN_3_MONTHS">Within 3 Months</SelectItem>
                    <SelectItem value="UNDER_CONSTRUCTION">Under Construction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Executive Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-semibold text-muted-foreground">
                Executive Notes & Features
              </Label>
              <Textarea
                id="notes"
                placeholder="Key highlights: East-facing, 2 covered parking, higher floor garden view, negotiable price..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl text-xs min-h-[70px] resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs h-9"
              disabled={createSubmission.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createSubmission.isPending}
              className="apple-button rounded-xl text-xs font-bold h-9 bg-purple-600 hover:bg-purple-700 text-white shadow-xs gap-1.5"
            >
              {createSubmission.isPending ? (
                <span>Adding Listing...</span>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Save Listing & Upgrade Client</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
