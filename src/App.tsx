import { BrowserRouter } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRoutes } from "@/routes/AppRoutes";
import { MockDataProvider } from "@/services/mock/MockDataProvider";
import { MockSessionProvider } from "@/services/mock/MockSessionProvider";

export default function App() {
  return (
    <MockSessionProvider>
      <MockDataProvider>
        <TooltipProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" />
          </BrowserRouter>
        </TooltipProvider>
      </MockDataProvider>
    </MockSessionProvider>
  );
}
