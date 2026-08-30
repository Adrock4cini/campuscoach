import { createRoot } from "react-dom/client";
import "./index.css";
import { installGlobalErrorReporting } from "@/lib/observability/clientErrorReporter";
import { validateBrowserSupabaseConfig } from "@/integrations/supabase/browserConfig";
import ConfigRecoveryScreen from "@/components/system/ConfigRecoveryScreen";

installGlobalErrorReporting();

const root = createRoot(document.getElementById("root")!);

function browserConfigIsUsable(): boolean {
  try {
    validateBrowserSupabaseConfig({
      url: import.meta.env.VITE_SUPABASE_URL,
      publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    });
    return true;
  } catch {
    return false;
  }
}

// A build that shipped without public backend configuration must degrade to a
// visible recovery screen. Importing App (and through it the Supabase client)
// would throw at module scope and leave a blank page instead.
if (browserConfigIsUsable()) {
  void import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
  });
} else {
  root.render(<ConfigRecoveryScreen />);
}
