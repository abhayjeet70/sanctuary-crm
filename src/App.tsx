import { BrowserRouter } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRoutes } from "@/routes/AppRoutes";
import { SupabaseSessionProvider } from "@/services/supabase/SupabaseSessionProvider";
import { SupabaseDataProvider } from "@/services/supabase/SupabaseDataProvider";

export default function App() {
  return (
    <SupabaseSessionProvider>
      <SupabaseDataProvider>
        <TooltipProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" />
          </BrowserRouter>
        </TooltipProvider>
      </SupabaseDataProvider>
    </SupabaseSessionProvider>
  );
}
