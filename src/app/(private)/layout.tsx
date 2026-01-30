/** @format */

"use client";

import type React from "react";
import { usePathname } from "next/navigation";
import { logoutAdminAction, getCurrentUserAction } from "@/actions/private/auth/actions";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AppSidebar,
  AppHeader,
  adminNavigation,
  partnerNavigation
} from "@/components";
import type { User as UserType } from "@/types";

import { Loader2 } from "lucide-react";

// ... existing imports

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [user, setUser] = useState<UserType | null>(null);
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Route detection
  const isExcludedRoute = ["/login", "/admin/login", "/login/invite"].includes(pathname);

  // Context & Navigation
  const partnerRoles = ["PARTNER", "PARTNER_ADMIN", "PARTNER_STAFF", "DRIVER"];
  const isPartnerContext = (user?.role && partnerRoles.includes(user.role)) || pathname.startsWith("/partners");
  const currentNavigation = isPartnerContext ? partnerNavigation : adminNavigation;
  const needsVerification = user?.role && partnerRoles.includes(user.role) && !user.isVerified && pathname !== "/partners/settings/profile";

  // Fetch user data com retry automático
  useEffect(() => {
    let mounted = true;
    
    async function fetchUser() {
      try {
        const result = await getCurrentUserAction();
        if (mounted) {
          if (result.success) {
            setUser(result.data);
          } else {
            console.error("[Auth] Falha ao obter dados do usuário:", result.error);
            // Usuário pode estar desconectado, deixa state como null
          }
          setIsLoadingUser(false);
        }
      } catch (error) {
        if (mounted) {
          console.error("[Auth] Erro crítico ao obter dados do usuário:", error);
          setIsLoadingUser(false);
          // Falha crítica, mas deixa usuário tentar navegar
        }
      }
    }

    fetchUser();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-open active submenus
  useEffect(() => {
    if (isExcludedRoute) return;
    const activeGroup = currentNavigation.find(item =>
      item.children?.some(child => child.href && pathname.startsWith(child.href))
    );
    if (activeGroup) setOpenSubmenus([activeGroup.label]);
  }, [pathname, currentNavigation, isExcludedRoute]);

  const toggleSubmenu = (label: string) =>
    setOpenSubmenus(prev => prev.includes(label) ? [] : [label]);

  if (isExcludedRoute) return <>{children}</>;

  if (isLoadingUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  const isVerified = user?.isVerified || (user as any)?.isPrincipal;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex flex-1 bg-[#F8FAFC] admin-layout text-slate-900 border-t border-white/10">
        <AppSidebar
          navigation={currentNavigation}
          user={user}
          isSidebarOpen={isSidebarOpen}
          openSubmenus={openSubmenus}
          onToggleSubmenu={toggleSubmenu}
          onLogout={logoutAdminAction}
          isPartnerRoute={isPartnerContext}
        />

        <div className={cn("flex-1 flex flex-col min-w-0 transition-all duration-300", isSidebarOpen ? "pl-64" : "pl-20")}>
          <AppHeader
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            user={user}
            isPartnerRoute={isPartnerContext}
            onLogout={logoutAdminAction}
          />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
