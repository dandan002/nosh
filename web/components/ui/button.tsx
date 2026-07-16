import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-DEFAULT font-label-lg text-label-lg transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-primary shadow-sm hover:bg-primary/90 active:scale-[0.98]",
        secondary:
          "bg-secondary text-on-secondary ambient-shadow hover:bg-on-secondary-container",
        default:
          "bg-primary-container text-on-primary-container industrial-pressed hover:opacity-90",
        outline:
          "border border-outline bg-transparent text-on-surface industrial-pressed hover:bg-surface-container-highest",
        ghost:
          "bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
        destructive:
          "bg-error text-on-error shadow-sm hover:bg-error/90 industrial-pressed",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3 text-body-sm",
        lg: "h-12 px-6",
        icon: "h-10 w-10 p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
