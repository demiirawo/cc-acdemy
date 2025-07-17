import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";

interface SecurityAlertProps {
  type: 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

export function SecurityAlert({ type, title, message }: SecurityAlertProps) {
  const Icon = type === 'success' ? Shield : AlertTriangle;
  
  return (
    <Alert variant={type === 'error' ? 'destructive' : 'default'}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}