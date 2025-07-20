import { useState, useEffect } from "react";
import { Search, Plus, Clock, TrendingUp, Users, BookOpen, Star, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CompanyNoticeboard } from "./CompanyNoticeboard";
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
export function RealDashboard({
  onCreatePage,
  onPageSelect
}: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Page[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [popularPages, setPopularPages] = useState<Page[]>([]);
  const [recentPages, setRecentPages] = useState<Page[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalPages: 0,
    activeUsers: 0,
    totalViews: 0,
    recentUpdates: 0
  });
  const [loading, setLoading] = useState(true);
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }

    if (searchQuery.trim().length < 2) {
      return;
    }

    performSearch(searchQuery.trim());
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    try {
      const { data: searchData, error } = await supabase
        .from('pages')
        .select('id, title, content, view_count, updated_at, created_by')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order('view_count', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Get user profiles for display names
      const userIds = [...new Set(searchData?.map(p => p.created_by) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      const enrichedResults = searchData?.map(page => ({
        ...page,
        profiles: profilesMap.get(page.created_by) || { display_name: 'Unknown' }
      })) || [];

      setSearchResults(enrichedResults);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };
  const fetchDashboardData = async () => {
    try {
      // Fetch popular pages (most viewed)
      const {
        data: popularData,
        error: popularError
      } = await supabase.from('pages').select('id, title, content, view_count, updated_at, created_by').order('view_count', {
        ascending: false
      }).limit(5);
      if (popularError) throw popularError;

      // Fetch recent pages (recently updated)
      const {
        data: recentData,
        error: recentError
      } = await supabase.from('pages').select('id, title, content, view_count, updated_at, created_by').order('updated_at', {
        ascending: false
      }).limit(8);
      if (recentError) throw recentError;

      // Fetch user profiles for display names
      const userIds = [...new Set([...(popularData?.map(p => p.created_by) || []), ...(recentData?.map(p => p.created_by) || [])])];
      const {
        data: profilesData
      } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);

      // Create a map for quick lookup
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      // Add profile data to pages
      const enrichedPopularData = popularData?.map(page => ({
        ...page,
        profiles: profilesMap.get(page.created_by) || {
          display_name: 'Unknown'
        }
      })) || [];
      const enrichedRecentData = recentData?.map(page => ({
        ...page,
        profiles: profilesMap.get(page.created_by) || {
          display_name: 'Unknown'
        }
      })) || [];

      // Fetch stats
      const {
        count: totalPages
      } = await supabase.from('pages').select('*', {
        count: 'exact',
        head: true
      });
      const {
        count: activeUsers
      } = await supabase.from('profiles').select('*', {
        count: 'exact',
        head: true
      });

      // Calculate total views
      const {
        data: viewData
      } = await supabase.from('pages').select('view_count');
      const totalViews = viewData?.reduce((sum, page) => sum + (page.view_count || 0), 0) || 0;

      // Count recent updates (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const {
        count: recentUpdates
      } = await supabase.from('pages').select('*', {
        count: 'exact',
        head: true
      }).gte('updated_at', sevenDaysAgo.toISOString());
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
        variant: "destructive"
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
  const statsData = [{
    title: 'Total Pages',
    value: stats.totalPages.toString(),
    icon: BookOpen,
    change: `+${Math.floor(stats.recentUpdates * 0.3)}`,
    changeType: 'positive' as const
  }, {
    title: 'Active Users',
    value: stats.activeUsers.toString(),
    icon: Users,
    change: '+8%',
    changeType: 'positive' as const
  }, {
    title: 'Page Views',
    value: stats.totalViews.toLocaleString(),
    icon: TrendingUp,
    change: '+23%',
    changeType: 'positive' as const
  }, {
    title: 'Recent Updates',
    value: stats.recentUpdates.toString(),
    icon: Clock,
    change: '+5%',
    changeType: 'positive' as const
  }];
  if (loading) {
    return <div className="flex-1 overflow-auto bg-gradient-subtle">
        <div className="max-w-none mx-8 p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-lg"></div>)}
            </div>
          </div>
        </div>
      </div>;
  }
  return <div className="flex-1 overflow-auto bg-gradient-subtle">
      <div className="max-w-none mx-8 p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Button onClick={onCreatePage} className="mb-2">
                <Plus className="h-4 w-4 mr-2" />
                Create Page
              </Button>
              <p className="text-lg text-muted-foreground">
                Welcome back{user?.user_metadata?.display_name ? `, ${user.user_metadata.display_name}` : ''}! Your team's collective knowledge, organized and accessible
              </p>
            </div>
            
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-3 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search Care Cudde Academy..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="pl-12 h-12 text-lg shadow-md" 
            />
            
            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="py-2">
                  <div className="px-4 py-2 text-sm font-medium text-muted-foreground border-b border-border">
                    Search Results ({searchResults.length})
                  </div>
                  {searchResults.map(result => (
                    <div
                      key={result.id}
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                      onClick={() => {
                        onPageSelect(result.id);
                        setSearchQuery("");
                        setShowSearchResults(false);
                      }}
                    >
                      <FileText className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground truncate">{result.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {result.content.substring(0, 120)}...
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{result.view_count || 0} views</span>
                          <span>•</span>
                          <span>by {result.profiles?.display_name || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50">
                <div className="py-8 px-4 text-center">
                  <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No results found for "{searchQuery}"</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Company Noticeboard */}
        <CompanyNoticeboard />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsData.map(stat => {
          const Icon = stat.icon;
          return <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
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
              </Card>;
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
                  {popularPages.length > 0 ? popularPages.map(page => <div key={page.id} className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 rounded-lg border cursor-pointer transition-colors group" onClick={() => onPageSelect(page.id)}>
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
                    </div>) : <div className="text-center py-8 text-muted-foreground">
                      <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pages yet. Create your first page to get started!</p>
                      <Button onClick={onCreatePage} variant="outline" className="mt-4">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Page
                      </Button>
                    </div>}
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
                  {recentPages.length > 0 ? recentPages.slice(0, 6).map(page => <div key={page.id} className="flex items-start gap-3">
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
                    </div>) : <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No recent activity</p>
                    </div>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>;
}