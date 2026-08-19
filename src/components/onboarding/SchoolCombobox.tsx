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
import { canonicalizeSchoolName } from "@/lib/onboarding/options";
import { searchKnownSchools } from "@/lib/onboarding/schoolDirectory";

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

  const canonicalQuery = canonicalizeSchoolName(query);
  const directoryRows: SchoolRow[] = searchKnownSchools(query, 8).map((s) => ({
    id: `known-${s.name}`,
    name: s.name,
  }));
  const aliasMatch = canonicalQuery !== query.trim()
    ? { id: `alias-${canonicalQuery}`, name: canonicalQuery }
    : null;
  const merged: SchoolRow[] = [];
  for (const row of [...(aliasMatch ? [aliasMatch] : []), ...directoryRows, ...rows]) {
    if (!merged.some((r) => r.name.toLowerCase() === row.name.toLowerCase())) merged.push(row);
  }
  const visibleRows = merged;
  const customNameCandidate = canonicalQuery.length >= 2 &&
    /[\p{L}\p{N}]/u.test(canonicalQuery) &&
    !visibleRows.some((r) => r.name.toLowerCase() === canonicalQuery.toLowerCase());

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
            {visibleRows.length > 0 && (
              <CommandGroup heading="Schools">
                {visibleRows.map((r) => (
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
            {customNameCandidate && (
              <CommandGroup heading="Use your school name">
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={() => {
                    onChange(canonicalQuery);
                    setOpen(false);
                  }}
                >
                  <span className="text-sm">
                    Use “<span className="font-medium">{canonicalQuery}</span>”
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {!loading && query.trim().length > 0 && visibleRows.length === 0 && !customNameCandidate && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Type at least two letters, then use your school name even if it is not listed yet.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
