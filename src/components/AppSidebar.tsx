import {
  LayoutDashboard, PenSquare, Megaphone, ListOrdered,
  ScrollText, AlertTriangle, ShieldBan, Globe, BarChart3, Settings, Mail, Server, Webhook, LayoutTemplate, TrendingUp,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import edapostLogo from "@/assets/edapost-logo.png";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Servers", url: "/servers", icon: Server },
  { title: "Compose", url: "/compose", icon: PenSquare },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Queue", url: "/queue", icon: ListOrdered },
  { title: "Logs", url: "/logs", icon: ScrollText },
  { title: "Bounces", url: "/bounces", icon: AlertTriangle },
  { title: "Suppression List", url: "/suppression", icon: ShieldBan },
  { title: "DNS Health", url: "/dns", icon: Globe },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Webhook Log", url: "/webhook-deliveries", icon: Webhook },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-foreground">
            EdaPost
          </span>
        )}
      </div>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
