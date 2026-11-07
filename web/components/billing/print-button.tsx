"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Icon name="print" className="text-lg" />
      Print
    </Button>
  );
}
