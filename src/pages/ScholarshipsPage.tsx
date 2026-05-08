import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Award, Bookmark, BookmarkCheck, Search, Sparkles, ExternalLink, Calendar,
} from "lucide-react";
import { scholarships, allTags, type Scholarship } from "@/data/scholarships";
import { getDaysUntil } from "@/data/demo";
import { studentProfile } from "@/data/demo";

export default function ScholarshipsPage() {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [effort, setEffort] = useState<"all" | "low" | "medium" | "high">("all");
  const [savedOnly, setSavedOnly] = useState(false);

  const filtered = useMemo(() => {
    return scholarships.filter((s) => {
      if (savedOnly && !saved.has(s.id)) return false;
      if (effort !== "all" && s.effort !== effort) return false;
      if (activeTag && !s.tags.includes(activeTag)) return false;
      if (search && !`${s.title} ${s.provider} ${s.description}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, activeTag, effort, savedOnly, saved]);

  const recommended = scholarships.filter((s) => s.recommended);

  const toggleSave = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 glass-strong noise-overlay p-6 md:p-8"
      >
        <div aria-hidden className="absolute -top-24 -right-24 h-[280px] w-[280px] rounded-full bg-accent/20 blur-[100px]" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="h-16 w-16 rounded-2xl bg-gradient-calm flex items-center justify-center shadow-glow">
            <Award className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <span className="text-[11px] uppercase tracking-[0.22em] text-primary/90">Discover funding</span>
            <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1">Scholarships</h1>
            <p className="mt-2 text-foreground/70">
              Personalized matches for {studentProfile.major} · {studentProfile.year}.
              Save the ones that fit and we'll track deadlines for you.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Recommended */}
      {recommended.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Recommended for you
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommended.map((s) => (
              <ScholarshipCard
                key={s.id}
                s={s}
                saved={saved.has(s.id)}
                onToggle={() => toggleSave(s.id)}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search scholarships, providers, keywords…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/40"
              />
            </div>
            <Button
              variant={savedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setSavedOnly((v) => !v)}
            >
              <BookmarkCheck className="h-4 w-4 mr-1.5" />
              Saved {saved.size > 0 && `(${saved.size})`}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="All efforts" active={effort === "all"} onClick={() => setEffort("all")} />
            <FilterChip label="Quick apply" active={effort === "low"} onClick={() => setEffort("low")} />
            <FilterChip label="Medium" active={effort === "medium"} onClick={() => setEffort("medium")} />
            <FilterChip label="In-depth" active={effort === "high"} onClick={() => setEffort("high")} />
            <span className="w-px bg-border mx-1.5" />
            <FilterChip label="All tags" active={activeTag === null} onClick={() => setActiveTag(null)} />
            {allTags.map((t) => (
              <FilterChip key={t} label={t} active={activeTag === t} onClick={() => setActiveTag(t)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((s) => (
          <ScholarshipCard key={s.id} s={s} saved={saved.has(s.id)} onToggle={() => toggleSave(s.id)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="shadow-soft border-dashed">
          <CardContent className="p-10 text-center text-muted-foreground">
            No scholarships match those filters. Try clearing them.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-all ${
        active
          ? "bg-primary/15 border-primary/40 text-foreground"
          : "border-border/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ScholarshipCard({
  s, saved, onToggle, compact,
}: { s: Scholarship; saved: boolean; onToggle: () => void; compact?: boolean }) {
  const days = getDaysUntil(s.deadline);
  const urgent = days <= 14;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`shadow-card h-full ${urgent ? "border-warning/30" : ""}`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-display font-semibold text-foreground">{s.title}</h3>
                {s.recommended && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    <Sparkles className="h-2.5 w-2.5 mr-1" /> Match
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{s.provider}</p>
            </div>
            <button
              onClick={onToggle}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/40 transition-colors"
              aria-label={saved ? "Unsave" : "Save"}
            >
              {saved ? (
                <BookmarkCheck className="h-4 w-4 text-primary" />
              ) : (
                <Bookmark className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-2xl font-display font-semibold text-foreground">
              ${s.amount.toLocaleString()}
            </span>
            <Badge variant="secondary" className={`text-[10px] ${urgent ? "bg-warning/10 text-warning" : ""}`}>
              <Calendar className="h-3 w-3 mr-1" />
              {days > 0 ? `${days}d left` : "Closed"}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">{s.effort} effort</Badge>
          </div>

          {!compact && (
            <p className="text-sm text-foreground/75 mt-3 leading-relaxed">{s.description}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>

          <Button size="sm" className="mt-4 w-full bg-gradient-calm border-0 text-primary-foreground hover:opacity-90">
            View & Apply <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
