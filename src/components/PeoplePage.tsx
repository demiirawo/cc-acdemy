import React, { useState, useEffect } from "react";
import { Users, User, FileText, Crown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  pages?: Page[];
  pageCount?: number;
  totalViews?: number;
}

interface Page {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  view_count: number;
}

interface PeoplePageProps {
  onPageSelect: (pageId: string) => void;
  onCreatePage?: () => void;
}

export function PeoplePage({ onPageSelect, onCreatePage }: PeoplePageProps) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [filteredPeople, setFilteredPeople] = useState<Profile[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPeopleData();
  }, []);

  useEffect(() => {
    // Filter people based on search query
    const filtered = people.filter(person =>
      person.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.role?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredPeople(filtered);
  }, [people, searchQuery]);

  const fetchPeopleData = async () => {
    try {
      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch pages for each user
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('id, title, content, updated_at, view_count, created_by');

      if (pagesError) throw pagesError;

      // Group pages by user and calculate stats
      const userPagesMap = new Map<string, Page[]>();
      const userStatsMap = new Map<string, { pageCount: number; totalViews: number }>();

      pagesData?.forEach(page => {
        if (!userPagesMap.has(page.created_by)) {
          userPagesMap.set(page.created_by, []);
        }
        userPagesMap.get(page.created_by)!.push(page);

        const stats = userStatsMap.get(page.created_by) || { pageCount: 0, totalViews: 0 };
        stats.pageCount += 1;
        stats.totalViews += page.view_count || 0;
        userStatsMap.set(page.created_by, stats);
      });

      // Enrich profiles with page data
      const enrichedProfiles = profilesData?.map(profile => {
        const userPages = userPagesMap.get(profile.user_id) || [];
        const stats = userStatsMap.get(profile.user_id) || { pageCount: 0, totalViews: 0 };
        
        return {
          ...profile,
          pages: userPages.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
          pageCount: stats.pageCount,
          totalViews: stats.totalViews
        };
      }) || [];

      // Sort by page count (most active first)
      enrichedProfiles.sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0));

      setPeople(enrichedProfiles);
    } catch (error) {
      console.error('Error fetching people data:', error);
      toast({
        title: "Error loading people",
        description: "Failed to load team members data.",
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
    
    if (diffDays < 1) return 'Today';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getRoleColor = (role: string | null) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'editor': return 'default';
      case 'viewer': return 'secondary';
      default: return 'outline';
    }
  };

  const getRoleIcon = (role: string | null) => {
    switch (role) {
      case 'admin': return Crown;
      case 'editor': return FileText;
      default: return User;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gradient-subtle">
        <div className="max-w-5xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-12 bg-muted rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gradient-subtle">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Users className="h-8 w-8 text-primary" />
            <Button onClick={onCreatePage}>
              <Plus className="h-4 w-4 mr-2" />
              Create Page
            </Button>
          </div>
          <p className="text-muted-foreground mb-6">
            Team members and their contributions to Care Cudde Academy
          </p>

          {/* Search */}
          <div className="relative max-w-xl">
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-4"
            />
          </div>
        </div>

        {!selectedPerson ? (
          /* People Overview */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{filteredPeople.length} Team Members</span>
                <Button variant="outline" size="sm" onClick={fetchPeopleData}>
                  Refresh
                </Button>
              </CardTitle>
              <CardDescription>
                Click on a person to see their contributions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredPeople.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPeople.map((person) => {
                    const RoleIcon = getRoleIcon(person.role);
                    return (
                      <div
                        key={person.id}
                        className="p-4 bg-card hover:bg-muted/50 rounded-lg border cursor-pointer transition-colors group"
                        onClick={() => setSelectedPerson(person)}
                      >
                        <div className="flex items-start gap-3 mb-4">
                          <Avatar className="h-12 w-12">
                            <AvatarFallback className="text-sm">
                              {person.display_name?.split(' ').map(n => n[0]).join('') || 
                               person.email?.charAt(0).toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {person.display_name || 'Unknown User'}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {person.email}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant={getRoleColor(person.role)} className="text-xs">
                                <RoleIcon className="h-3 w-3 mr-1" />
                                {person.role || 'viewer'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-lg font-semibold text-foreground">{person.pageCount || 0}</p>
                            <p className="text-xs text-muted-foreground">Pages</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">{person.totalViews || 0}</p>
                            <p className="text-xs text-muted-foreground">Views</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchQuery ? "No people match your search" : "No team members found"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Person Details */
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPerson(null)}>
                      ← Back to all people
                    </Button>
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>
                        {selectedPerson.display_name?.split(' ').map(n => n[0]).join('') || 
                         selectedPerson.email?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle>{selectedPerson.display_name || 'Unknown User'}</CardTitle>
                      <CardDescription>{selectedPerson.email}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getRoleColor(selectedPerson.role)}>
                      {getRoleIcon(selectedPerson.role) && 
                        React.createElement(getRoleIcon(selectedPerson.role), { className: "h-3 w-3 mr-1" })
                      }
                      {selectedPerson.role || 'viewer'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{selectedPerson.pageCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Pages Created</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{selectedPerson.totalViews || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {new Date(selectedPerson.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground">Member Since</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-foreground mb-4">Recent Pages</h3>
                  {selectedPerson.pages && selectedPerson.pages.length > 0 ? (
                    <div className="space-y-3">
                      {selectedPerson.pages.slice(0, 10).map((page) => (
                        <div
                          key={page.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors group"
                          onClick={() => onPageSelect(page.id)}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="h-4 w-4 text-primary" />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                                {page.title}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Updated {formatTimeAgo(page.updated_at)} • {page.view_count || 0} views
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">No pages created yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}