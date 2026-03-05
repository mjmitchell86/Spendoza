import { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WelcomeStep } from "@/components/onboarding/welcome-step";
import { UploadStep } from "@/components/onboarding/upload-step";
import { ProcessingStep } from "@/components/onboarding/processing-step";
import { ReviewStep } from "@/components/onboarding/review-step";
import { CompleteStep } from "@/components/onboarding/complete-step";

type Step = "welcome" | "upload" | "processing" | "review" | "complete";

const STEP_ORDER: Step[] = [
  "welcome",
  "upload",
  "processing",
  "review",
  "complete",
];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  upload: "Upload",
  processing: "Processing",
  review: "Review",
  complete: "Complete",
};

function getStepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

function getProgressValue(step: Step): number {
  const index = getStepIndex(step);
  return ((index + 1) / STEP_ORDER.length) * 100;
}

function canGoBack(step: Step): boolean {
  return step === "upload";
}

function getPrevStep(step: Step): Step {
  if (step === "upload") return "welcome";
  return step;
}

export function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [statementIds, setStatementIds] = useState<string[]>([]);

  const handleProcessingComplete = useCallback(() => {
    setCurrentStep("review");
  }, []);

  const handleProcessingError = useCallback(() => {
    setCurrentStep("complete");
  }, []);

  const handleSkipReview = useCallback(() => {
    setCurrentStep("complete");
  }, []);

  function renderStep() {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep onNext={() => setCurrentStep("upload")} />;

      case "upload":
        return (
          <UploadStep
            onNext={(ids) => {
              setStatementIds(ids);
              setCurrentStep("processing");
            }}
            onSkip={() => setCurrentStep("complete")}
          />
        );

      case "processing":
        return statementIds.length > 0 ? (
          <ProcessingStep
            statementIds={statementIds}
            onComplete={handleProcessingComplete}
            onError={handleProcessingError}
            onSkipReview={handleSkipReview}
          />
        ) : null;

      case "review":
        return statementIds.length > 0 ? (
          <ReviewStep
            statementIds={statementIds}
            onNext={() => setCurrentStep("complete")}
          />
        ) : null;

      case "complete":
        return <CompleteStep />;

      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        {/* Step indicator */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {STEP_LABELS[currentStep]}
            </span>
            <span className="text-muted-foreground">
              Step {getStepIndex(currentStep) + 1} of {STEP_ORDER.length}
            </span>
          </div>
          <Progress value={getProgressValue(currentStep)} className="h-2" />
          <div className="flex justify-between">
            {STEP_ORDER.map((step) => {
              const index = getStepIndex(step);
              const currentIndex = getStepIndex(currentStep);
              const isActive = index === currentIndex;
              const isCompleted = index < currentIndex;
              return (
                <div
                  key={step}
                  className={
                    "text-xs " +
                    (isActive
                      ? "font-medium text-foreground"
                      : isCompleted
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50")
                  }
                >
                  {STEP_LABELS[step]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Card shell */}
        <Card>
          <CardContent className="pt-6">
            {/* Back button */}
            {canGoBack(currentStep) && (
              <div className="mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep(getPrevStep(currentStep))}
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
              </div>
            )}

            {renderStep()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
