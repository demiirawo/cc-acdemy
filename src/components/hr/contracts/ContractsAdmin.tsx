import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, FileSignature } from "lucide-react";
import { ContractTemplatesManager } from "./ContractTemplatesManager";
import { ContractsManager } from "./ContractsManager";

export function ContractsAdmin() {
  return (
    <Tabs defaultValue="sent" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="sent" className="flex items-center gap-2">
          <FileSignature className="h-4 w-4" /> Sent Contracts
        </TabsTrigger>
        <TabsTrigger value="templates" className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> Templates
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sent" className="mt-0">
        <ContractsManager />
      </TabsContent>
      <TabsContent value="templates" className="mt-0">
        <ContractTemplatesManager />
      </TabsContent>
    </Tabs>
  );
}
