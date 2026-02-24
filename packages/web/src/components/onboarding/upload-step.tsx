import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { Upload, FileText } from "lucide-react";
import { MAX_BANK_STATEMENT_SIZE_MB } from "@spendoza/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadBankStatement } from "@/hooks/use-bank-statements";
import { cn } from "@/lib/utils";

interface UploadStepProps {
  onNext: (statementId: string | null) => void;
  onSkip: () => void;
}

export function UploadStep({ onNext, onSkip }: UploadStepProps) {
  const upload = useUploadBankStatement();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [statementMonth, setStatementMonth] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (statementMonth) {
      formData.append("statement_month", statementMonth + "-01");
    }
    if (bankName.trim()) {
      formData.append("bank_name", bankName.trim());
    }
    formData.append("is_shared_account", "false");

    try {
      const result = await upload.mutateAsync(formData);
      onNext(result.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Upload a Bank Statement
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload a PDF bank statement and we'll automatically extract your
          transactions.
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
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <>
              <FileText className="size-10 text-primary" />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                Click or drop to replace
              </p>
            </>
          ) : (
            <>
              <Upload className="size-10 text-muted-foreground" />
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ob_bank_name">Bank Name (optional)</Label>
            <Input
              id="ob_bank_name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Chase, Wells Fargo"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ob_statement_month">Statement Month (optional)</Label>
            <Input
              id="ob_statement_month"
              type="month"
              value={statementMonth}
              onChange={(e) => setStatementMonth(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Auto-detected from transactions if not provided
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" disabled={upload.isPending || !file}>
            {upload.isPending ? "Uploading..." : "Upload & Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
