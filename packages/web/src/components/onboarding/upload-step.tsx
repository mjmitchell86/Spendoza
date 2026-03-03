import { useState, useRef, useMemo, type FormEvent, type DragEvent } from "react";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { MAX_BANK_STATEMENT_SIZE_MB } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadBankStatement, useBankStatements } from "@/hooks/use-bank-statements";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = new Set(["application/pdf", "text/csv"]);

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "csv" || ext === "pdf";
}

interface UploadStepProps {
  onNext: (statementIds: string[]) => void;
  onSkip: () => void;
}

type FileStatus = "pending" | "uploading" | "done" | "error";

interface QueuedFile {
  file: File;
  status: FileStatus;
  error?: string;
  statementId?: string;
  bankName: string;
}

const MAX_SIZE = MAX_BANK_STATEMENT_SIZE_MB * 1024 * 1024;

export function UploadStep({ onNext, onSkip }: UploadStepProps) {
  const upload = useUploadBankStatement();
  const { data: statements } = useBankStatements();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [bankName, setBankName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const bankNames = useMemo(() => {
    const names = new Set<string>();
    statements?.forEach((s) => { if (s.bank_name) names.add(s.bank_name); });
    return Array.from(names).sort();
  }, [statements]);

  const hasCSV = files.some((f) => f.file.name.toLowerCase().endsWith(".csv"));

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
        continue;
      }
      existingNames.add(f.name);
      newFiles.push({ file: f, status: "pending", bankName: "" });
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

  function updateFileBankName(index: number, value: string) {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, bankName: value } : f))
    );
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

    const completedIds: string[] = [];

    // Upload each file sequentially to avoid hitting API limits
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f))
      );

      const formData = new FormData();
      formData.append("file", files[i].file);
      const fileBankName = files[i].bankName.trim() || bankName.trim();
      if (fileBankName) {
        formData.append("bank_name", fileBankName);
      }
      formData.append("is_shared_account", "false");

      try {
        const result = await upload.mutateAsync(formData);
        const id = result.id ?? null;
        if (id) completedIds.push(id);
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "done", statementId: id } : f
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", error: msg } : f
          )
        );
      }
    }

    setIsUploading(false);

    if (completedIds.length > 0) {
      onNext(completedIds);
    }
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Upload Bank Statements
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload PDF or CSV bank statements and we'll automatically extract
          your transactions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Drop zone */}
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
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
          <Upload className="size-10 text-muted-foreground" />
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
              {(doneCount > 0 || errorCount > 0) &&
                ` — ${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`}
            </p>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {files.map((qf, i) => (
                <div
                  key={qf.file.name}
                  className="flex flex-col gap-1 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-2 text-sm">
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
                  {qf.status === "pending" && (
                    <Input
                      list="ob-bank-name-suggestions"
                      value={qf.bankName}
                      onChange={(e) => updateFileBankName(i, e.target.value)}
                      placeholder="Bank name (optional)"
                      disabled={isUploading}
                      className="h-7 text-xs ml-5.5"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="ob_bank_name">
            Default Bank Name{hasCSV ? "" : " (optional)"}
          </Label>
          <Input
            id="ob_bank_name"
            list="ob-bank-name-suggestions"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder={hasCSV ? "Select or enter bank name" : "e.g. Chase, Wells Fargo"}
            disabled={isUploading}
          />
          {bankNames.length > 0 && (
            <datalist id="ob-bank-name-suggestions">
              {bankNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={isUploading}
          >
            Skip for now
          </Button>
          <Button type="submit" disabled={isUploading || pendingCount === 0}>
            {isUploading
              ? `Uploading ${doneCount + 1} of ${files.length}...`
              : pendingCount === 1
                ? "Upload & Continue"
                : `Upload ${pendingCount} Files & Continue`}
          </Button>
        </div>
      </form>
    </div>
  );
}
