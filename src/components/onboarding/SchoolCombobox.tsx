import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, School as SchoolIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SchoolRow {
  id: string;
  name: string;
}

export function SchoolCombobox({
  value,
  onChange,
  placeholder = "Search your school…",
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    const q = query.trim();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const req = supabase
          .from("schools")
          .select("id,name")
          .order("name", { ascending: true })
          .limit(20);
        const { data } = q
          ? await req.ilike("name", `%${q}%`)
          : await req;
        if (!cancel) setRows((data ?? []) as SchoolRow[]);
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 180);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showCreate =
    query.trim().length > 1 &&
    !rows.some((r) => r.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <SchoolIcon className="h-4 w-4 opacity-60" />
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Searching…" : "No schools found."}
            </CommandEmpty>
            {rows.length > 0 && (
              <CommandGroup heading="Schools">
                {rows.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={r.name}
                    onSelect={() => {
                      onChange(r.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === r.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {r.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup heading="Add new">
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={() => {
                    onChange(query.trim());
                    setOpen(false);
                  }}
                >
                  <span className="text-sm">
                    Use “<span className="font-medium">{query.trim()}</span>”
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
