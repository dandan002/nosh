import * as React from "react";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";

function Input({
  className,
  icon,
  ...props
}: React.ComponentProps<"input"> & { icon?: string }) {
  return (
    <div
      className={cn(
        "relative flex items-center bg-surface-container-lowest border-b border-outline-variant input-focus-ring transition-colors duration-200 rounded-t-DEFAULT",
        className,
      )}
    >
      {icon ? <Icon name={icon} className="text-outline ml-3" /> : null}
      <input
        data-slot="input"
        className="w-full bg-transparent border-none outline-none focus:ring-0 font-body-md text-body-md text-on-surface placeholder:text-outline-variant py-4 px-3"
        {...props}
      />
    </div>
  );
}

export { Input };
