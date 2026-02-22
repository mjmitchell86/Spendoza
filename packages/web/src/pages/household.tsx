import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useHousehold } from "@/hooks/use-household";
import { CreateHousehold } from "@/components/household/create-household";
import { JoinHousehold } from "@/components/household/join-household";
import { MemberList } from "@/components/household/member-list";
import { InviteForm } from "@/components/household/invite-form";
import { SharingConfig } from "@/components/household/sharing-config";

export function HouseholdPage() {
  const { user } = useAuth();
  const { data: householdData, isLoading, error, refetch } = useHousehold();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load household"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const household = householdData?.household;
  const members = householdData?.members ?? [];
  const currentUserId = user?.id ?? "";
  const isHead = household?.head_of_household_id === currentUserId;
  const currentMember = members.find((m) => m.id === currentUserId);

  // No household — show create/join options
  if (!household) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Household</h1>
          <p className="text-sm text-muted-foreground">
            Create or join a household to share finances with your family
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <CreateHousehold />
          <JoinHousehold />
        </div>
      </div>
    );
  }

  // Has household — show management view
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {household.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your household members and sharing preferences
        </p>
      </div>

      {/* Members */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            headId={household.head_of_household_id}
            currentUserId={currentUserId}
            isHead={isHead}
          />
        </CardContent>
      </Card>

      {/* Invite (head only) */}
      {isHead && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Invite Members</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm inviteCode={household.invite_code} />
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Sharing Config */}
      {currentMember && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Your Sharing Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <SharingConfig
              currentIncomeMode={currentMember.income_sharing_mode}
              currentExpenseMode={currentMember.expense_sharing_mode}
              currentSharedAmount={null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
