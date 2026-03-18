import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import Compose from "./pages/Compose";
import Campaigns from "./pages/Campaigns";
import Queue from "./pages/Queue";
import Logs from "./pages/Logs";
import Bounces from "./pages/Bounces";
import Suppression from "./pages/Suppression";
import DnsHealth from "./pages/DnsHealth";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/Settings";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/compose" element={<Compose />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/bounces" element={<Bounces />} />
          <Route path="/suppression" element={<Suppression />} />
          <Route path="/dns" element={<DnsHealth />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
