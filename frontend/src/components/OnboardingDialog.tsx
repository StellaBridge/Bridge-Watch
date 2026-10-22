import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";

type OnboardingStep = {
  title: string;
  body: React.ReactNode;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
};

export default function OnboardingDialog({ open, onClose, onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const contentRef = useFocusTrap({
    isActive: open,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  });

  const steps: OnboardingStep[] = useMemo(
    () => [
      {
        title: "Welcome to Bridge Watch",
        body: (
          <div className="space-y-3 text-sm text-stellar-text-secondary">
            <p>
              This dashboard helps you monitor bridged assets on Stellar: health scores, bridge
              status, and price signals.
            </p>
            <p>
              For the official Soroban SDK documentation, open{" "}
              <a
                href="https://developers.stellar.org/docs/build/smart-contracts"
                target="_blank"
                rel="noreferrer"
                className="text-stellar-blue hover:underline"
              >
                Developer Help
              </a>
              .
            </p>
          </div>
        ),
      },
      {
        title: "Start on the Dashboard",
        body: (
          <div className="space-y-2 text-sm text-stellar-text-secondary">
            <p>
              Use filters to narrow down assets, then open any asset card for detailed monitoring.
            </p>
            <p>
              Tip: keyboard users can tab to the filter controls and asset cards (focus rings are
              enabled throughout).
            </p>
          </div>
        ),
      },
      {
        title: "Compare assets in Analytics",
        body: (
          <div className="space-y-2 text-sm text-stellar-text-secondary">
            <p>
              The Analytics page is where you can compare multiple assets side-by-side once you’ve
              selected them.
            </p>
            <p>
              You can jump there anytime:{" "}
              <Link className="text-stellar-blue hover:underline" to="/analytics">
                open Analytics
              </Link>
              .
            </p>
          </div>
        ),
      },
    ],
    []
  );

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
  }, [open]);

  if (!open) return null;

  const isLast = stepIndex === steps.length - 1;
  const step = steps[stepIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className="relative w-full max-w-lg bg-stellar-card border border-stellar-border rounded-lg shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="onboarding-title" className="text-xl font-semibold text-stellar-text-primary">
                {step.title}
              </h2>
              <p id="onboarding-desc" className="sr-only">
                Onboarding steps for new users
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-stellar-text-secondary hover:text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              aria-label="Close onboarding"
            >
              ✕
            </button>
          </div>

          <div className="mt-4">{step.body}</div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-stellar-text-secondary hover:text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-md px-2 py-1"
            >
              Skip
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={stepIndex === 0}
                className="bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 text-sm text-stellar-text-primary disabled:opacity-50 hover:bg-stellar-border focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLast) onComplete();
                  else setStepIndex((i) => Math.min(steps.length - 1, i + 1));
                }}
                className="bg-stellar-blue rounded-lg px-3 py-2 text-sm text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card"
              >
                {isLast ? "Finish" : "Next"}
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-stellar-text-secondary">
            Step {stepIndex + 1} of {steps.length}
          </div>
        </div>
      </div>
    </div>
  );
}

