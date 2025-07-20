
import { CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { SaveStatus } from '@/hooks/useSaveStatus';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSaved?: Date | null;
  className?: string;
}

export function SaveStatusIndicator({ status, lastSaved, className = "" }: SaveStatusIndicatorProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'saving':
        return {
          icon: Loader2,
          text: 'Saving...',
          className: 'text-blue-600 animate-spin'
        };
      case 'saved':
        return {
          icon: CheckCircle2,
          text: lastSaved ? `Saved ${formatTime(lastSaved)}` : 'Saved',
          className: 'text-green-600'
        };
      case 'error':
        return {
          icon: AlertCircle,
          text: 'Save failed',
          className: 'text-red-600'
        };
      default:
        return {
          icon: Clock,
          text: 'Unsaved changes',
          className: 'text-gray-500'
        };
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const { icon: Icon, text, className: statusClassName } = getStatusInfo();

  return (
    <div className={`flex items-center gap-1 text-xs ${className}`}>
      <Icon className={`h-3 w-3 ${statusClassName}`} />
      <span className={statusClassName}>{text}</span>
    </div>
  );
}
