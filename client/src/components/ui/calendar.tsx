"use client"

import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-8 rounded-none border border-white/10 p-0 text-zinc-500 transition-app select-none hover:border-white/20 hover:bg-white/[0.04] hover:text-white aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-8 rounded-none border border-white/10 p-0 text-zinc-500 transition-app select-none hover:border-white/20 hover:bg-white/[0.04] hover:text-white aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "relative flex h-10 w-full items-center justify-center px-10",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-2 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative inline-flex h-8 min-w-[4.25rem] items-center justify-center gap-1 rounded-(--cell-radius) border border-white/10 bg-black/50 px-2.5",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 bg-transparent opacity-0 outline-none",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "pointer-events-none select-none",
          captionLayout === "label"
            ? "font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-300"
            : "flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300 [&>svg]:size-3 [&>svg]:text-zinc-500",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("grid w-full grid-cols-7", defaultClassNames.weekdays),
        weekday: cn(
          "text-center font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-zinc-600 select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-1 grid w-full grid-cols-7", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] text-muted-foreground select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative flex aspect-square h-full w-full items-center justify-center rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day
        ),
        range_start: cn(
          "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
          defaultClassNames.range_end
        ),
        today: cn(
          "rounded-(--cell-radius) bg-transparent text-foreground ring-1 ring-inset ring-white/15 data-[selected=true]:ring-0",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon className={cn("size-4", className)} {...props} />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  children,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isSelected =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle

  const isToday = Boolean(modifiers.today)
  const isTodaySelected = isToday && isSelected

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={isSelected}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative flex size-full aspect-square h-full w-full items-center justify-center rounded-full border-0 bg-transparent p-0 text-sm font-normal leading-none transition-app",
        "hover:bg-white/[0.07] hover:text-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
        // Plain selected day — solid white pill
        isSelected && !isToday && "bg-white text-black hover:bg-white hover:text-black",
        // Today (not selected) — outlined pill with brighter text
        isToday && !isSelected && "text-white ring-1 ring-inset ring-white/40",
        // Today + selected — accent: white fill + bold + ember dot on top
        isTodaySelected && "bg-white font-semibold text-black hover:bg-white hover:text-black",
        modifiers.outside && "text-zinc-700 opacity-60",
        modifiers.disabled && "opacity-35",
        modifiers.scheduled && !isSelected && "font-medium text-zinc-200",
        defaultClassNames.day,
        className
      )}
      {...props}
    >
      {children}
      {/* Today marker — small dot at top-right corner */}
      {isToday && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-1 top-1 size-1 rounded-full",
            isSelected ? "bg-black" : "bg-white",
          )}
        />
      )}
      {/* Scheduled marker — small dot at bottom center */}
      {modifiers.scheduled && !modifiers.outside && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full",
            isSelected ? "bg-black/60" : "bg-white/40",
          )}
        />
      )}
    </button>
  )
}

export { Calendar }
