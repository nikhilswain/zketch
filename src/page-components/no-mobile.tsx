import { Monitor, Smartphone, Tablet } from "lucide-react";

const NoMobile = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="text-center max-w-lg mx-auto space-y-8">
          {/* Device Icons */}
          <div className="flex items-center justify-center gap-8 mb-12">
            <div className="p-4 rounded-lg bg-surface border border-border">
              <Tablet className="w-8 h-8 text-primary" />
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
          </div>

          {/* Mobile Icon with Strike */}
          <div className="relative mb-12">
            <div className="p-4 rounded-lg bg-muted inline-block">
              <Smartphone className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-0.5 bg-destructive rotate-45" />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <h1 className="text-3xl font-medium text-foreground">
              Desktop & Tablet Only
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed">
              This application is optimized for larger screens and is not
              available on mobile devices.
            </p>

            <p className="text-base text-muted-foreground">
              PS — not supporting mobile is my new time-management hack.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoMobile;
