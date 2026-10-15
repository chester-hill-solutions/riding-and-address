"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * A presentational table.
 *
 * ## Why this is plain HTML rather than `react-aria-components`
 *
 * RAC's `Table` is a **collection** component, not a wrapper. `useTable` has to know every
 * row, cell and column before it renders anything, because keyboard navigation and selection
 * are driven off that model.
 *
 * RAC builds that model by scanning declared children, and its collections do **not** support
 * conditionally rendering collection children. Get the two sides out of step and it fails at
 * runtime, with no compile-time signal:
 *
 * ```
 * Cell count must match column count. Found 5 cells and 3 columns.
 * ```
 * (adobe/react-spectrum#8127 — raised by hiding columns conditionally.)
 *
 * Note what is *not* the trigger: a `<Column>` with a label inside it is RAC's own documented
 * usage (`<Column id="name" isRowHeader>Name</Column>`), so `<TableHead>Build</TableHead>`
 * is fine. The failure needs the *number* of declared columns to disagree with the number of
 * cells in a row.
 *
 * This table declares no collection semantics — no `selectionMode`, no `allowsSorting`, no
 * `isRowHeader` — so the collection model buys nothing here and contributes only the failure
 * mode. These `data-slot` names and class strings are shadcn's plain-HTML convention
 * throughout, which is what they were always describing.
 *
 * **If sorting or selection is ever needed here, do not switch this to RAC's `Table`.** RAC
 * would then be correct, and the row-header prop would come back with it. Prefer a headless
 * table for the state (sort descriptor, selected keys) and keep the markup plain — the markup
 * stays ours, so the contract cannot be violated at the call site. `ui-kit` vendors components
 * into consuming repos, so a vendored base that drags a dependency ages worse than 150 lines of
 * HTML that a consumer can read.
 *
 * `TableCaption` is a `<caption>`, so it must be the **first child** of `<Table>` — not a
 * sibling after it. It was a `<figcaption>` outside the table, which is not valid there
 * either; the first consumer never rendered one, which is how that survived.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "data-empty:h-24 data-empty:text-center [&_tr:last-child]:border-0",
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-selected:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}