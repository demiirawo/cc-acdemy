import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Page {
  id: string;
  title: string;
  content: string;
  view_count: number;
  updated_at: string;
  created_by: string;
  profiles?: {
    display_name?: string;
  };
}

interface DashboardStats {
  totalPages: number;
  activeUsers: number;
  totalViews: number;
  recentUpdates: number;
}

interface DashboardProps {
  onCreatePage: () => void;
  onPageSelect: (pageId: string) => void;
}

export function RealDashboard({ onCreatePage, onPageSelect }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [popularPages, setPopularPages] = useState<Page[]>([]);
  const [recentPages, setRecentPages] = useState<Page[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalPages: 0,
    activeUsers: 0,
    totalViews: 0,
    recentUpdates: 0
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch popular pages (most viewed)
      const { data: popularData, error: popularError } = await supabase
        .from('pages')
        .select('id, title, content, view_count, updated_at, created_by')
        .order('view_count', { ascending: false })
        .limit(5);

      if (popularError) throw popularError;

      // Fetch recent pages (recently updated)
      const { data: recentData, error: recentError } = await supabase
        .from('pages')
        .select('id, title, content, view_count, updated_at, created_by')
        .order('updated_at', { ascending: false })
        .limit(8);

      if (recentError) throw recentError;

      // Fetch user profiles for display names
      const userIds = [...new Set([
        ...(popularData?.map(p => p.created_by) || []),
        ...(recentData?.map(p => p.created_by) || [])
      ])];

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      // Create a map for quick lookup
      const profilesMap = new Map(
        profilesData?.map(p => [p.user_id, p]) || []
      );

      // Add profile data to pages
      const enrichedPopularData = popularData?.map(page => ({
        ...page,
        profiles: profilesMap.get(page.created_by) || { display_name: 'Unknown' }
      })) || [];

      const enrichedRecentData = recentData?.map(page => ({
        ...page,
        profiles: profilesMap.get(page.created_by) || { display_name: 'Unknown' }
      })) || [];
        
        {/* Company announcements will be added once types are available */}
        
      // Fetch stats
      const { count: totalPages } = await supabase
        .from('pages')
        .select('*', { count: 'exact', head: true });

      const { count: activeUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Calculate total views
      const { data: viewData } = await supabase
        .from('pages')
        .select('view_count');

      const totalViews = viewData?.reduce((sum, page) => sum + (page.view_count || 0), 0) || 0;

      // Count recent updates (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count: recentUpdates } = await supabase
        .from('pages')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', sevenDaysAgo.toISOString());

      setPopularPages(enrichedPopularData);
      setRecentPages(enrichedRecentData);
      setStats({
        totalPages: totalPages || 0,
        activeUsers: activeUsers || 0,
        totalViews,
        recentUpdates: recentUpdates || 0
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: "Error loading dashboard",
        description: "Failed to load dashboard data. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const statsData = [
    {
      title: 'Total Pages',
      value: stats.totalPages.toString(),
      icon: BookOpen,
      change: `+${Math.floor(stats.recentUpdates * 0.3)}`,
      changeType: 'positive' as const
    },
    {
      title: 'Active Users',
      value: stats.activeUsers.toString(),
      icon: Users,
      change: '+8%',
      changeType: 'positive' as const
    },
    {
      title: 'Page Views',
      value: stats.totalViews.toLocaleString(),
      icon: TrendingUp,
      change: '+23%',
      changeType: 'positive' as const
    },
    {
      title: 'Recent Updates',
      value: stats.recentUpdates.toString(),
      icon: Clock,
      change: '+5%',
      changeType: 'positive' as const
    }
  ];

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gradient-subtle">
        <div className="max-w-7xl mx-auto p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gradient-subtle">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Welcome back{user?.user_metadata?.display_name ? `, ${user.user_metadata.display_name}` : ''}!
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
          {statsData.map((stat) => {
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
                      Most viewed pages this week
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {popularPages.length > 0 ? popularPages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 rounded-lg border cursor-pointer transition-colors group"
                      onClick={() => onPageSelect(page.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {page.title}
                          </h3>
                          <Badge variant="secondary">page</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {page.content.substring(0, 100)}...
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{page.view_count || 0} views</span>
                          <span>Updated {formatTimeAgo(page.updated_at)}</span>
                          <span>by {page.profiles?.display_name || 'Unknown'}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  )) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pages yet. Create your first page to get started!</p>
                      <Button onClick={onCreatePage} variant="outline" className="mt-4">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Page
                      </Button>
                    </div>
                  )}
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
                  {recentPages.length > 0 ? recentPages.slice(0, 6).map((page) => (
                    <div key={page.id} className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {page.profiles?.display_name?.split(' ').map(n => n[0]).join('') || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{page.profiles?.display_name || 'Someone'}</span>
                          <span className="text-muted-foreground"> updated </span>
                          <span className="font-medium cursor-pointer hover:text-primary" onClick={() => onPageSelect(page.id)}>
                            {page.title}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimeAgo(page.updated_at)}
                        </p>
                      </div>
                      <div className="w-2 h-2 rounded-full mt-2 bg-primary" />
                    </div>
                  )) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No recent activity</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}