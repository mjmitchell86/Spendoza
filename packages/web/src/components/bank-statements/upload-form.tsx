import { useState, useRef, useMemo, type FormEvent, type DragEvent } from "react";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
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
import { useUploadBankStatement, useBankStatements } from "@/hooks/use-bank-statements";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = new Set(["application/pdf", "text/csv"]);

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  // Some systems report text/plain for CSVs — check extension as fallback
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "csv" || ext === "pdf";
}

interface UploadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FileStatus = "pending" | "uploading" | "done" | "error";

interface QueuedFile {
  file: File;
  status: FileStatus;
  error?: string;
}

const MAX_SIZE = MAX_BANK_STATEMENT_SIZE_MB * 1024 * 1024;

export function UploadForm({ open, onOpenChange }: UploadFormProps) {
  const upload = useUploadBankStatement();
  const { data: statements } = useBankStatements();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [bankName, setBankName] = useState("");
  const [statementMonth, setStatementMonth] = useState("");
  const [isSharedAccount, setIsSharedAccount] = useState(false);
  const [accountLabel, setAccountLabel] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const bankNames = useMemo(() => {
    const names = new Set<string>();
    statements?.forEach((s) => { if (s.bank_name) names.add(s.bank_name); });
    return Array.from(names).sort();
  }, [statements]);

  const hasCSV = files.some((f) => f.file.name.toLowerCase().endsWith(".csv"));

  function resetForm() {
    setFiles([]);
    setBankName("");
    setStatementMonth("");
    setIsSharedAccount(false);
    setAccountLabel("");
    setError(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const newFiles: QueuedFile[] = [];
    const errors: string[] = [];
    const existingNames = new Set(files.map((f) => f.file.name));

    for (const f of Array.from(fileList)) {
      if (!isAcceptedFile(f)) {
        errors.push(`${f.name}: not a PDF or CSV`);
        continue;
      }
      if (f.size > MAX_SIZE) {
        errors.push(`${f.name}: exceeds ${MAX_BANK_STATEMENT_SIZE_MB}MB`);
        continue;
      }
      if (existingNames.has(f.name)) {
        continue; // skip duplicate
      }
      existingNames.add(f.name);
      newFiles.push({ file: f, status: "pending" });
    }

    if (errors.length > 0) {
      setError(errors.join(". "));
    } else {
      setError(null);
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
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
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) {
      setError("Please select at least one file");
      return;
    }
    setError(null);
    setIsUploading(true);

    // Upload each file sequentially to avoid hitting API limits
    let allSucceeded = true;
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      );

      const formData = new FormData();
      formData.append("file", files[i].file);
      if (statementMonth) {
        formData.append("statement_month", statementMonth + "-01");
      }
      if (bankName.trim()) {
        formData.append("bank_name", bankName.trim());
      }
      formData.append("is_shared_account", String(isSharedAccount));
      if (isSharedAccount && accountLabel.trim()) {
        formData.append("account_label", accountLabel.trim());
      }

      try {
        await upload.mutateAsync(formData);
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f))
        );
      } catch (err) {
        allSucceeded = false;
        const msg = err instanceof Error ? err.message : "Upload failed";
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: msg } : f
          )
        );
      }
    }

    setIsUploading(false);

    if (allSucceeded) {
      resetForm();
      onOpenChange(false);
    }
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const hasResults = doneCount > 0 || errorCount > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isUploading) {
          resetForm();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Bank Statements</DialogTitle>
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
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              isUploading && "pointer-events-none opacity-50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop PDFs or CSVs here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Max {MAX_BANK_STATEMENT_SIZE_MB}MB per file
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,application/pdf,text/csv"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="hidden"
            />
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Your bank statement is deleted after processing. We only store the
            extracted transaction data, never the original file.
          </p>

          {/* File list */}
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
                {hasResults &&
                  ` — ${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`}
              </p>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {files.map((qf, i) => (
                  <div
                    key={qf.file.name}
                    className="flex items-center gap-2 rounded px-2 py-1 text-sm"
                  >
                    {qf.status === "pending" && (
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {qf.status === "uploading" && (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    )}
                    {qf.status === "done" && (
                      <CheckCircle2 className="size-3.5 shrink-0 text-green-600" />
                    )}
                    {qf.status === "error" && (
                      <AlertCircle className="size-3.5 shrink-0 text-destructive" />
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate",
                        qf.status === "error" && "text-destructive"
                      )}
                      title={qf.error ?? qf.file.name}
                    >
                      {qf.file.name}
                      {qf.error && (
                        <span className="ml-1 text-xs">({qf.error})</span>
                      )}
                    </span>
                    {qf.status === "pending" && !isUploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="shrink-0 rounded p-0.5 hover:bg-muted"
                      >
                        <X className="size-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bank_name">
                Bank Name{hasCSV ? "" : " (optional)"}
              </Label>
              <Input
                id="bank_name"
                list="bank-name-suggestions"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder={hasCSV ? "Select or enter bank name" : "e.g. Chase, Wells Fargo"}
                disabled={isUploading}
              />
              {bankNames.length > 0 && (
                <datalist id="bank-name-suggestions">
                  {bankNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="statement_month">Statement Month (optional)</Label>
              <Input
                id="statement_month"
                type="month"
                value={statementMonth}
                onChange={(e) => setStatementMonth(e.target.value)}
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Auto-detected from transactions if not provided
              </p>
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
              disabled={isUploading}
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
                disabled={isUploading}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
            >
              {hasResults && !isUploading ? "Close" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={isUploading || pendingCount === 0}
            >
              {isUploading
                ? `Uploading ${doneCount + 1} of ${files.length}...`
                : pendingCount === 1
                  ? "Upload"
                  : `Upload ${pendingCount} Files`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
