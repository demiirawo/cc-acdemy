import { useState } from "react";
import { 
  Search,
  Plus,
  Clock,
  TrendingUp,
  Users,
  BookOpen,
  Star,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface QuickLink {
  id: string;
  title: string;
  description: string;
  type: 'page' | 'space';
  views: number;
  lastUpdated: string;
  author: string;
}

interface RecentActivity {
  id: string;
  action: string;
  page: string;
  user: string;
  time: string;
  type: 'created' | 'updated' | 'commented';
}

const quickLinks: QuickLink[] = [
  {
    id: '1',
    title: 'API Documentation',
    description: 'Complete REST API reference and examples',
    type: 'page',
    views: 234,
    lastUpdated: '2 hours ago',
    author: 'John Doe'
  },
  {
    id: '2',
    title: 'Onboarding Guide',
    description: 'Everything new team members need to know',
    type: 'page',
    views: 156,
    lastUpdated: '1 day ago',
    author: 'Jane Smith'
  },
  {
    id: '3',
    title: 'Engineering Standards',
    description: 'Code review guidelines and best practices',
    type: 'space',
    views: 89,
    lastUpdated: '3 days ago',
    author: 'Mike Johnson'
  },
  {
    id: '4',
    title: 'Product Requirements',
    description: 'Q4 feature specifications and user stories',
    type: 'page',
    views: 78,
    lastUpdated: '1 week ago',
    author: 'Sarah Wilson'
  }
];

const recentActivity: RecentActivity[] = [
  {
    id: '1',
    action: 'updated',
    page: 'API Authentication Guide',
    user: 'John Doe',
    time: '15 minutes ago',
    type: 'updated'
  },
  {
    id: '2',
    action: 'created',
    page: 'Mobile App Testing Process',
    user: 'Jane Smith',
    time: '1 hour ago',
    type: 'created'
  },
  {
    id: '3',
    action: 'commented on',
    page: 'Database Migration Plan',
    user: 'Mike Johnson',
    time: '2 hours ago',
    type: 'commented'
  },
  {
    id: '4',
    action: 'updated',
    page: 'Security Checklist',
    user: 'Sarah Wilson',
    time: '4 hours ago',
    type: 'updated'
  }
];

const stats = [
  {
    title: 'Total Pages',
    value: '247',
    icon: BookOpen,
    change: '+12%',
    changeType: 'positive' as const
  },
  {
    title: 'Active Users',
    value: '32',
    icon: Users,
    change: '+8%',
    changeType: 'positive' as const
  },
  {
    title: 'Page Views',
    value: '1,234',
    icon: TrendingUp,
    change: '+23%',
    changeType: 'positive' as const
  },
  {
    title: 'Recent Updates',
    value: '18',
    icon: Clock,
    change: '+5%',
    changeType: 'positive' as const
  }
];

interface DashboardProps {
  onCreatePage: () => void;
  onPageSelect: (pageId: string) => void;
}

export function Dashboard({ onCreatePage, onPageSelect }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex-1 overflow-auto bg-gradient-subtle">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Welcome to Knowledge Base
              </h1>
              <p className="text-lg text-muted-foreground">
                Your team's collective knowledge, organized and accessible
              </p>
            </div>
            <Button onClick={onCreatePage} className="bg-gradient-primary">
              <Plus className="h-4 w-4 mr-2" />
              Create Page
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search knowledge base..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg shadow-md"
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {stat.title}
                      </p>
                      <p className="text-2xl font-bold text-foreground">
                        {stat.value}
                      </p>
                    </div>
                    <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="text-sm text-success font-medium">
                      {stat.change}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">
                      from last month
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Popular Content */}
          <div className="lg:col-span-2">
            <Card className="shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-warning" />
                      Popular Content
                    </CardTitle>
                    <CardDescription>
                      Most viewed pages and spaces this week
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {quickLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 rounded-lg border cursor-pointer transition-colors group"
                      onClick={() => onPageSelect(link.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {link.title}
                          </h3>
                          <Badge variant={link.type === 'space' ? 'default' : 'secondary'}>
                            {link.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {link.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{link.views} views</span>
                          <span>Updated {link.lastUpdated}</span>
                          <span>by {link.author}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-accent" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Latest updates from your team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {activity.user.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{activity.user}</span>
                          <span className="text-muted-foreground"> {activity.action} </span>
                          <span className="font-medium">{activity.page}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {activity.time}
                        </p>
                      </div>
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        activity.type === 'created' ? 'bg-success' :
                        activity.type === 'updated' ? 'bg-primary' :
                        'bg-accent'
                      }`} />
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4" size="sm">
                  View All Activity
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}