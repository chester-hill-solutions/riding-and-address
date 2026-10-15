import type { ComponentPropsWithRef } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { inputVariants, type InputKitSize } from "./input"

type NativeSelectProps = Omit<ComponentPropsWithRef<"select">, "size"> & {
  size?: InputKitSize | number
}

/** Native select semantics, including form submission and platform pickers. */
function NativeSelect({
  className,
  children,
  size = "default",
  ...props
}: NativeSelectProps) {
  const density = typeof size === "number" ? "default" : size
  return (
    <span
      data-slot="native-select-wrapper"
      className="relative inline-flex w-full max-w-full min-w-0"
    >
      <select
        data-slot="native-select"
        data-size={density}
        size={typeof size === "number" ? size : undefined}
        className={cn(
          inputVariants({ size: density }),
          "max-w-full cursor-pointer appearance-none border-input bg-background ps-3 pe-9 text-foreground pointer-coarse:min-h-11",
          props.multiple && "h-auto appearance-auto py-1.5 pe-3",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {!props.multiple && (
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      )}
    </span>
  )
}

export { NativeSelect }
export type { NativeSelectProps }
