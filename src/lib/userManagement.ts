import { supabase } from "@/integrations/supabase/client";

/**
 * Security-enhanced user role management utility
 */
export class UserRoleManager {
  private static instance: UserRoleManager;
  private currentUserRole: string | null = null;
  private lastRoleCheck: number = 0;
  private readonly ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): UserRoleManager {
    if (!UserRoleManager.instance) {
      UserRoleManager.instance = new UserRoleManager();
    }
    return UserRoleManager.instance;
  }

  /**
   * Get current user's role with caching
   */
  async getCurrentUserRole(): Promise<string | null> {
    const now = Date.now();
    
    // Return cached role if still valid
    if (this.currentUserRole && (now - this.lastRoleCheck) < this.ROLE_CACHE_TTL) {
      return this.currentUserRole;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        this.currentUserRole = null;
        return null;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        this.currentUserRole = null;
        return null;
      }

      this.currentUserRole = profile?.role || 'viewer';
      this.lastRoleCheck = now;
      
      return this.currentUserRole;
    } catch (error) {
      console.error('Error in getCurrentUserRole:', error);
      this.currentUserRole = null;
      return null;
    }
  }

  /**
   * Check if current user has specified role
   */
  async hasRole(role: string): Promise<boolean> {
    const userRole = await this.getCurrentUserRole();
    return userRole === role;
  }

  /**
   * Check if current user is admin
   */
  async isAdmin(): Promise<boolean> {
    return await this.hasRole('admin');
  }

  /**
   * Check if current user can perform admin actions
   */
  async canPerformAdminActions(): Promise<boolean> {
    const userRole = await this.getCurrentUserRole();
    return userRole === 'admin';
  }

  /**
   * Invalidate role cache (useful after role changes)
   */
  invalidateCache(): void {
    this.currentUserRole = null;
    this.lastRoleCheck = 0;
  }

  /**
   * Update user role (admin only)
   */
  async updateUserRole(userId: string, newRole: string): Promise<boolean> {
    // Verify admin status
    const isAdmin = await this.isAdmin();
    if (!isAdmin) {
      throw new Error('Insufficient permissions to update user roles');
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      // Log the role change for security audit
      await this.logSecurityEvent('role_change', {
        target_user_id: userId,
        new_role: newRole,
        action: 'update_user_role'
      });

      return true;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }

  /**
   * Log security events for audit trail
   */
  private async logSecurityEvent(eventType: string, eventDetails: any): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase.rpc('log_security_event', {
          p_user_id: user.id,
          p_event_type: eventType,
          p_event_details: eventDetails,
          p_ip_address: null, // Client-side can't reliably get IP
          p_user_agent: navigator.userAgent
        });
      }
    } catch (error) {
      console.error('Error logging security event:', error);
      // Don't throw - logging failure shouldn't break functionality
    }
  }
}

// Export singleton instance
export const userRoleManager = UserRoleManager.getInstance();