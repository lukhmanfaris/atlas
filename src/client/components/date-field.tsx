import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/client/components/ui/button";
import { Calendar } from "@/client/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover";

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function formatDisplay(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/** A calendar in a popover. The value is always a YYYY-MM-DD business date. */
export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={`w-full justify-start gap-2 font-normal ${className ?? ""}`}
          />
        }
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        {value ? formatDisplay(value) : <span className="text-muted-foreground">{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDate(value)}
          defaultMonth={parseDate(value)}
          onSelect={(next) => {
            if (next) {
              onChange(toIso(next));
              setOpen(false);
            }
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
