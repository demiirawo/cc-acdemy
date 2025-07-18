import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, BarChart3, FileText, Users, Zap } from 'lucide-react';

interface Macro {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  insertHtml: string;
  tags?: string[];
}

interface MacroBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (macro: Macro) => void;
  macros?: Macro[];
}

const defaultMacros: Macro[] = [
  {
    id: 'toc',
    name: 'Table of Contents',
    description: 'Generate a table of contents from page headings',
    category: 'Navigation',
    insertHtml: '<div class="macro-toc"><h4>Table of Contents</h4><ul><li>Heading 1</li><li>Heading 2</li></ul></div>',
    tags: ['navigation', 'contents', 'headings'],
  },
  {
    id: 'info-box',
    name: 'Info Box',
    description: 'Highlight important information',
    category: 'Formatting',
    insertHtml: '<div class="macro-info-box"><strong>Info:</strong> Important information goes here.</div>',
    tags: ['info', 'highlight', 'box'],
  },
  {
    id: 'warning-box',
    name: 'Warning Box',
    description: 'Display warnings or cautions',
    category: 'Formatting',
    insertHtml: '<div class="macro-warning-box"><strong>Warning:</strong> Caution information goes here.</div>',
    tags: ['warning', 'caution', 'alert'],
  },
  {
    id: 'code-snippet',
    name: 'Code Snippet',
    description: 'Insert formatted code blocks',
    category: 'Development',
    insertHtml: '<pre class="macro-code"><code>// Your code here\nconsole.log("Hello, World!");</code></pre>',
    tags: ['code', 'programming', 'snippet'],
  },
  {
    id: 'jira-issue',
    name: 'Jira Issue',
    description: 'Link to Jira issues with status',
    category: 'Collaboration',
    insertHtml: '<div class="macro-jira-issue"><span class="jira-key">PROJ-123</span> <span class="jira-status">In Progress</span> Example issue title</div>',
    tags: ['jira', 'issue', 'project'],
  },
  {
    id: 'roadmap',
    name: 'Roadmap',
    description: 'Display project timeline and milestones',
    category: 'Planning',
    insertHtml: '<div class="macro-roadmap"><h4>Project Roadmap</h4><div class="roadmap-item"><span class="date">Q1 2024</span> - Milestone 1</div></div>',
    tags: ['roadmap', 'timeline', 'planning'],
  },
  {
    id: 'team-calendar',
    name: 'Team Calendar',
    description: 'Show team events and schedules',
    category: 'Collaboration',
    insertHtml: '<div class="macro-calendar"><h4>Team Calendar</h4><div class="calendar-event">Meeting @ 2PM</div></div>',
    tags: ['calendar', 'events', 'schedule'],
  },
  {
    id: 'chart',
    name: 'Chart',
    description: 'Insert data visualization charts',
    category: 'Data',
    insertHtml: '<div class="macro-chart"><h4>Chart Title</h4><div class="chart-placeholder">Chart data visualization</div></div>',
    tags: ['chart', 'graph', 'data'],
  },
];

const categoryIcons: Record<string, any> = {
  Navigation: FileText,
  Formatting: Zap,
  Development: FileText,
  Collaboration: Users,
  Planning: Calendar,
  Data: BarChart3,
};

export const MacroBrowser: React.FC<MacroBrowserProps> = ({
  isOpen,
  onClose,
  onInsert,
  macros = defaultMacros,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = Array.from(new Set(macros.map(macro => macro.category)));
  
  const filteredMacros = macros.filter(macro => {
    const matchesSearch = searchQuery === '' || 
      macro.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      macro.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      macro.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === null || macro.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleInsert = (macro: Macro) => {
    onInsert(macro);
    setSearchQuery('');
    setSelectedCategory(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Browse Macros</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search macros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              All Categories
            </Badge>
            {categories.map(category => (
              <Badge
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Badge>
            ))}
          </div>

          {/* Macros Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
            {filteredMacros.map(macro => {
              const IconComponent = categoryIcons[macro.category] || Zap;
              return (
                <div
                  key={macro.id}
                  className="border border-border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleInsert(macro)}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-md">
                      <IconComponent className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{macro.name}</h4>
                      {macro.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {macro.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {macro.category}
                        </Badge>
                        {macro.tags && macro.tags.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredMacros.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No macros found matching your search.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};