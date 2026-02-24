import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { MAX_BANK_STATEMENT_SIZE_MB } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUploadBankStatement } from "@/hooks/use-bank-statements";
import { cn } from "@/lib/utils";

interface UploadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadForm({ open, onOpenChange }: UploadFormProps) {
  const upload = useUploadBankStatement();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [statementMonth, setStatementMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [isSharedAccount, setIsSharedAccount] = useState(false);
  const [accountLabel, setAccountLabel] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setFile(null);
    setBankName("");
    setStatementMonth(new Date().toISOString().slice(0, 7));
    setIsSharedAccount(false);
    setAccountLabel("");
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (f.type !== "application/pdf") {
      setError("Only PDF files are supported");
      return;
    }
    if (f.size > MAX_BANK_STATEMENT_SIZE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_BANK_STATEMENT_SIZE_MB}MB`);
      return;
    }
    setError(null);
    setFile(f);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select a file");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("statement_month", statementMonth + "-01");
    if (bankName.trim()) {
      formData.append("bank_name", bankName.trim());
    }
    formData.append("is_shared_account", String(isSharedAccount));
    if (isSharedAccount && accountLabel.trim()) {
      formData.append("account_label", accountLabel.trim());
    }

    try {
      await upload.mutateAsync(formData);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Bank Statement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Drop zone */}
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 transition-colors cursor-pointer",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-8 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Drop a PDF here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Max {MAX_BANK_STATEMENT_SIZE_MB}MB
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => handleFileChange(e.target.files)}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bank_name">Bank Name (optional)</Label>
              <Input
                id="bank_name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Chase, Wells Fargo"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="statement_month">Statement Month</Label>
              <Input
                id="statement_month"
                type="month"
                value={statementMonth}
                onChange={(e) => setStatementMonth(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="is_shared">Shared Account</Label>
              <p className="text-xs text-muted-foreground">
                This account is shared with household members
              </p>
            </div>
            <Switch
              id="is_shared"
              checked={isSharedAccount}
              onCheckedChange={setIsSharedAccount}
            />
          </div>

          {isSharedAccount && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="account_label">Account Label</Label>
              <Input
                id="account_label"
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                placeholder="e.g. Joint Checking"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending || !file}>
              {upload.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
