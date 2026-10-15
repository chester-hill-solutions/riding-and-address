"use client"

import {
  Checkbox as CheckboxPrimitive,
  composeRenderProps,
  type CheckboxProps,
} from "react-aria-components"

import { cn } from "../../lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      // RAC Checkbox is itself a <label>. Put label copy as children —
      // do not wrap Checkbox in an outer <label> (nested labels break selection).
      className={cn(
        "group/checkbox peer relative flex w-fit shrink-0 items-center gap-2 text-sm outline-none select-none group-has-disabled/field:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      {composeRenderProps(
        children,
        (children, { isSelected, isIndeterminate }) => (
          <>
            <span
              data-slot="checkbox-indicator"
              className="grid size-4 shrink-0 place-content-center rounded-[5px] border border-transparent bg-input/90 transition-shadow [&>svg]:size-3.5 group-data-[focus-visible]/checkbox:border-ring group-data-[focus-visible]/checkbox:ring-2 group-data-[focus-visible]/checkbox:ring-ring/30 group-data-[invalid]/checkbox:border-destructive group-data-[invalid]/checkbox:ring-2 group-data-[invalid]/checkbox:ring-destructive/20 dark:group-data-[invalid]/checkbox:border-destructive/50 dark:group-data-[invalid]/checkbox:ring-destructive/40 group-data-[selected]/checkbox:border-primary group-data-[selected]/checkbox:bg-primary group-data-[selected]/checkbox:text-primary-foreground group-data-[indeterminate]/checkbox:border-primary group-data-[indeterminate]/checkbox:bg-primary group-data-[indeterminate]/checkbox:text-primary-foreground group-data-[invalid]/checkbox:group-data-[selected]/checkbox:border-primary"
            >
              {isIndeterminate ? (
                <MinusIcon />
              ) : isSelected ? (
                <CheckIcon />
              ) : null}
            </span>
            {children}
          </>
        )
      )}
    </CheckboxPrimitive>
  )
}

export { Checkbox }
