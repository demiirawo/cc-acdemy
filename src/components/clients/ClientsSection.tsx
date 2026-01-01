import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { ClientList } from "./ClientList";
import { ClientDetailsManager } from "./ClientDetailsManager";
import { ClientProfitCalculator } from "./ClientProfitCalculator";
import { Building2, FileText, TrendingUp } from "lucide-react";

export function ClientsSection() {
  const { isAdmin } = useUserRole();
  const [activeTab, setActiveTab] = useState("list");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    setActiveTab("details");
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Client Management</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Manage clients, view profitability, and access client resources" : "View client information and schedules"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full mb-6" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              All Clients
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Client Details
            </TabsTrigger>
            <TabsTrigger value="profit" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Profit Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-0">
            <ClientList onClientSelect={handleClientSelect} />
          </TabsContent>
          
          <TabsContent value="details" className="mt-0">
            <ClientDetailsManager 
              selectedClientId={selectedClientId} 
              onClientSelect={setSelectedClientId}
            />
          </TabsContent>
          
          <TabsContent value="profit" className="mt-0">
            <ClientProfitCalculator />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}