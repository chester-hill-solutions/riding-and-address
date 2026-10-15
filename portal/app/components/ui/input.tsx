import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  composeRenderProps,
  Input as InputPrimitive,
} from "react-aria-components"

import { cn } from "../../lib/utils"

/**
 * Density sizes aligned with Button / SelectTrigger (`sm` … `touch`).
 */
const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-transparent bg-input/50 text-base transition-[color,box-shadow] duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        sm: "h-8 px-2 sm:h-7 sm:text-xs",
        md: "h-9 px-2.5 sm:h-8 sm:text-sm",
        default: "h-8 px-2.5 py-1",
        lg: "h-11 px-3 sm:h-10 sm:text-sm",
        touch: "min-h-11 px-3 py-2.5 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type InputKitSize = NonNullable<VariantProps<typeof inputVariants>["size"]>

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof InputPrimitive>, "size" | "className"> &
  VariantProps<typeof inputVariants> & {
    className?: string
  }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={composeRenderProps(className, (className) =>
        cn(inputVariants({ size }), className)
      )}
      {...props}
    />
  )
}

export { Input, inputVariants }
export type { InputKitSize }
