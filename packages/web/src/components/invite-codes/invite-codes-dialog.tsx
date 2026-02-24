import { useState } from "react";
import { Copy, Check, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInviteCodes, useCreateInviteCode } from "@/hooks/use-invite-codes";

const MAX_CODES = 3;

interface InviteCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteCodesDialog({
  open,
  onOpenChange,
}: InviteCodesDialogProps) {
  const { data: codes, isLoading } = useInviteCodes();
  const createCode = useCreateInviteCode();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopy(code: string, id: string) {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const codeCount = codes?.length ?? 0;
  const canCreate = codeCount < MAX_CODES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Codes</DialogTitle>
          <DialogDescription>
            Share codes with others to let them join Spendoza. You can create up
            to {MAX_CODES} codes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !codes || codes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No invite codes yet. Create one to share.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm font-medium">
                      {code.code}
                    </span>
                    <Badge
                      variant={code.used_by ? "secondary" : "default"}
                      className="w-fit text-xs"
                    >
                      {code.used_by ? "Used" : "Available"}
                    </Badge>
                  </div>
                  {!code.used_by && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleCopy(code.code, code.id)}
                    >
                      {copiedId === code.id ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      <span className="sr-only">Copy code</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {codeCount} of {MAX_CODES} codes created
            </span>
            <Button
              size="sm"
              onClick={() => createCode.mutate()}
              disabled={!canCreate || createCode.isPending}
            >
              <Plus className="size-4" />
              {createCode.isPending ? "Creating..." : "Create Code"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
