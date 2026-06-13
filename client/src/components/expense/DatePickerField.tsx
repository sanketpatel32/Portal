import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { labelClass, calendarMonthRange, parseLocalDate, toLocalDateInput } from "./shared";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
};

export function DatePickerField({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalDate(value);
  const now = new Date();
  const { startMonth, endMonth } = calendarMonthRange(now);

  return (
    <div className="block">
      <span className={labelClass}>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-auto w-full justify-between rounded-none border-white/10 bg-black px-4 py-3 font-mono text-sm font-normal text-white hover:border-white/20 hover:bg-black hover:text-white",
              !selected && "text-zinc-600"
            )}
          >
            {selected
              ? selected.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Pick a date"}
            <CalendarIcon className="size-4 shrink-0 opacity-50" strokeWidth={1.5} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto border-white/10 bg-[#09090e] p-0 text-white ring-white/10"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? now}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            onSelect={(date) => {
              if (!date) return;
              onChange(toLocalDateInput(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
