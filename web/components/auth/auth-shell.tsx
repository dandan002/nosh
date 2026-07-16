import type { ReactNode } from "react";

export function AuthShell({
  step,
  stepLabel,
  title,
  subtitle,
  children,
}: {
  step?: { current: number; total: number };
  stepLabel?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="w-full max-w-page-max-width mx-auto min-h-screen flex flex-col md:flex-row relative">
      {/* Left Side: Visual / Brand Anchor */}
      <div className="hidden md:flex flex-1 relative bg-gradient-to-br from-primary via-primary-container to-on-primary-fixed-variant overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent" />
        <div className="relative z-10 p-margin-desktop flex flex-col justify-between h-full">
          <div className="flex items-baseline gap-1">
            <span className="font-display-lg text-display-lg font-bold text-on-primary">r</span>
            <span className="font-display-lg text-display-lg font-bold text-on-primary">ev</span>
          </div>
          <div className="max-w-md">
            <p className="font-headline-md text-headline-md text-on-primary mb-4">
              Precision, calm, and organic flow for your restaurant operations.
            </p>
            <p className="font-body-md text-body-md text-primary-fixed">
              Seating, orders, and the kitchen line — one system, built for
              how a service actually runs.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side: Form Content */}
      <div className="flex-1 flex flex-col justify-center px-margin-mobile py-12 md:px-[10%] bg-surface">
        <div className="w-full max-w-md mx-auto space-y-12">
          <div className="md:hidden text-center mb-8">
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
              rev
            </span>
          </div>

          <div className="space-y-6">
            {step ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    Step {step.current} of {step.total}
                  </span>
                  {stepLabel ? (
                    <span className="font-label-caps text-label-caps text-primary">
                      {stepLabel}
                    </span>
                  ) : null}
                </div>
                <div className="h-1 bg-surface-variant rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(step.current / step.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
            <div>
              <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background">
                {title}
              </h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
                {subtitle}
              </p>
            </div>
          </div>

          {children}
        </div>
      </div>
    </main>
  );
}
