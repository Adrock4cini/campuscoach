import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorReporting } from "@/lib/observability/clientErrorReporter";

installGlobalErrorReporting();
createRoot(document.getElementById("root")!).render(<App />);
