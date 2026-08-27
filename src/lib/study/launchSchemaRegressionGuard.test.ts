import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260827135000_launch_schema_regression_guard.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
).toLowerCase();

describe("launch schema regression guard", () => {
  it("removes only the obsolete aggregate refresh trigger names", () => {
    expect(migration).toContain(
      "drop trigger if exists topic_signals_recompute_scores",
    );
    expect(migration).toContain(
      "drop trigger if exists exam_debriefs_recompute_scores",
    );
    expect(migration).not.toContain(
      "drop trigger if exists trg_refresh_scores_on_signal",
    );
    expect(migration).not.toContain(
      "drop trigger if exists trg_refresh_scores_on_debrief",
    );
  });

  it("fails closed when historical strategy outcomes cross owner boundaries", () => {
    expect(migration).toContain(
      "class.user_id is distinct from outcome.user_id",
    );
    expect(migration).toContain(
      "artifact.user_id is distinct from outcome.user_id",
    );
    expect(migration).toContain("raise exception");
    expect(migration).not.toContain("delete from public.study_strategy_outcomes");
  });

  it("guards class and artifact ownership for every future insert or relink", () => {
    expect(migration).toContain(
      "create or replace function public.enforce_strategy_outcome_owner_boundaries()",
    );
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("class.id = new.class_id");
    expect(migration).toContain("class.user_id = new.user_id");
    expect(migration).toContain("artifact.id = new.artifact_id");
    expect(migration).toContain("artifact.user_id = new.user_id");
    expect(migration.match(/for key share/gu)).toHaveLength(2);
    expect(migration).toContain(
      "before insert or update of user_id, class_id, artifact_id",
    );
  });

  it("also makes the authenticated feedback policy owner-reference aware", () => {
    expect(migration).toContain(
      'drop policy if exists "owners record their own strategy outcomes"',
    );
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("outcome_source = 'feedback'");
    expect(migration).toContain(
      "class.id = study_strategy_outcomes.class_id",
    );
    expect(migration).toContain(
      "class.user_id = study_strategy_outcomes.user_id",
    );
    expect(migration).toContain(
      "artifact.id = study_strategy_outcomes.artifact_id",
    );
    expect(migration).toContain(
      "artifact.user_id = study_strategy_outcomes.user_id",
    );
  });

  it("lands after the browser write guard and class identity repair", () => {
    const migrations = readdirSync(
      resolve(process.cwd(), "supabase/migrations"),
    ).sort();
    const boundary = migrations.indexOf(migrationName);

    expect(boundary).toBeGreaterThan(
      migrations.indexOf(
        "20260827133000_browser_learning_evidence_write_guard.sql",
      ),
    );
    expect(boundary).toBeGreaterThan(
      migrations.indexOf(
        "20260827134000_class_client_identity_owner_scope.sql",
      ),
    );
  });
});
