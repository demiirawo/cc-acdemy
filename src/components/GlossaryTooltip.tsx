import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

interface GlossaryTooltipProps {
  term: string;
  definition: string;
  children: React.ReactNode;
}

export const GlossaryTooltip: React.FC<GlossaryTooltipProps> = ({
  term,
  definition,
  children,
}) => {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="border-b-2 border-purple-500 cursor-help">
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{term}</h4>
          <p className="text-sm text-muted-foreground">
            {definition}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};