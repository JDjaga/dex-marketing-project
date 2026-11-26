import React, { useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Palette,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import type { JwtRealtimeStatus, NavSectionId } from '../../shared/types.ts';
import type { AuthContext } from '../lib/api.ts';

interface AppShellProps {
  context: AuthContext;
  activeSection: NavSectionId;
  activeWorkspaceId: string;
  jwtStatus: JwtRealtimeStatus;
  onSelectSection: (section: NavSectionId) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSwitchOrganization: (orgId: string) => void;
  onVerifyJwtNow: () => void;
  onLogout: () => void;
  primaryAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: NavSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'campaigns', label: 'Campaigns', icon: Send },
  { id: 'email', label: 'Email Marketing', icon: Mail },
  { id: 'social', label: 'Social Media', icon: Share2 },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'leads', label: 'Lead Intelligence', icon: Search },
  { id: 'studio', label: 'Content Studio', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'crm', label: 'CRM Integrations', icon: Database },
  { id: 'automation', label: 'Automation', icon: Workflow },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle2 },
  { id: 'brand', label: 'Brand Kit', icon: Palette },
  { id: 'team', label: 'Team', icon: Briefcase },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const MOBILE_BOTTOM_TABS: Array<{ id: NavSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Home', icon: LayoutDashboard },
  { id: 'campaigns', label: 'Campaigns', icon: Send },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'social', label: 'Social', icon: Share2 },
];

export const AppShell: React.FC<AppShellProps> = ({
  context,
  activeSection,
  activeWorkspaceId,
  jwtStatus,
  onSelectSection,
  onSelectWorkspace,
  onSwitchOrganization,
  onVerifyJwtNow,
  onLogout,
  primaryAction,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeNav = NAV_ITEMS.find((n) => n.id === activeSection);
  const activeWorkspace =
    context.workspaces.find((w) => w.id === activeWorkspaceId) || context.workspaces[0];

  const renderSidebarContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Lockup: companylogo1 (Colakin) on top, companylogo2 (DeX) sub-brand nearby below */}
      <div className="px-4 py-4 border-b border-slate-100 flex items-start justify-between gap-2">
        <div className={`flex flex-col ${collapsed && !isMobile ? 'items-center w-full' : 'items-start'} gap-1.5`}>
          <img
            src="/assets/aistudio/companylogo1_5f78dfc9.png"
            alt="Colakin"
            className={`${collapsed && !isMobile ? 'h-6' : 'h-7'} w-auto object-contain`}
            referrerPolicy="no-referrer"
          />
          {(!collapsed || isMobile) && (
            <div className="flex items-center gap-1.5 pl-0.5">
              <img
                src="/assets/aistudio/companylogo2_754b2368.png"
                alt="DeX"
                className="h-4.5 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                Marketing Ops
              </span>
            </div>
          )}
        </div>
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Organization & Workspace Selectors */}
      {(!collapsed || isMobile) && (
        <div className="px-3 py-3 border-b border-slate-100 space-y-2 bg-[#F8FAFC]">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Organization</label>
            <div className="relative">
              <select
                value={context.organization.id}
                onChange={(e) => onSwitchOrganization(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-2.5 py-2 pr-7 text-xs font-semibold text-[#0A2472] focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
              >
                {context.organizations.map((o) => (
                  <option key={o.organization.id} value={o.organization.id}>
                    {o.organization.name} ({o.role})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Workspace</label>
            <div className="relative">
              <select
                value={activeWorkspace?.id || ''}
                onChange={(e) => onSelectWorkspace(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-2.5 py-2 pr-7 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1D63ED]"
              >
                {context.workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* 15 Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                if (isMobile) setMobileOpen(false);
              }}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center ${
                collapsed && !isMobile ? 'justify-center px-2' : 'justify-start px-3'
              } py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#1D63ED] text-white dex-tab-active'
                  : 'text-slate-600 hover:text-[#0A2472] hover:bg-[#EAF1FF]/70'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {(!collapsed || isMobile) && <span className="ml-2.5 truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Signed-in User Profile & Logout */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center' : 'justify-between'} gap-2`}>
          {(!collapsed || isMobile) && (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{context.user.name}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {context.role} · {context.user.timezone}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            title="Sign out & revoke JWT"
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F7FE] text-[#0F172A]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 no-print ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarContent(false)}</div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-[85vw] max-w-[300px] h-full z-10 shadow-xl">{renderSidebarContent(true)}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb trail left, JWT status + primary CTA right */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate max-w-[160px]">
                {context.organization.name}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="text-slate-500 hidden md:inline truncate max-w-[160px]">
                {activeWorkspace?.name}
              </span>
              <span className="text-slate-300 hidden md:inline">/</span>
              <span className="font-semibold text-[#0A2472] truncate">
                {activeNav?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onVerifyJwtNow}
              title={
                jwtStatus.jti
                  ? `Session ${jwtStatus.jti.slice(0, 8)} · Click to re-verify JWT now`
                  : 'Click to verify JWT session'
              }
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                jwtStatus.state === 'verified'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : jwtStatus.state === 'connecting'
                    ? 'bg-blue-50 text-[#1D63ED] border-blue-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  jwtStatus.state === 'verified'
                    ? 'bg-emerald-500 animate-pulse'
                    : jwtStatus.state === 'connecting'
                      ? 'bg-[#1D63ED] animate-pulse'
                      : 'bg-amber-500'
                }`}
              />
              <ShieldCheck className="w-3.5 h-3.5 hidden sm:inline" />
              <span>{jwtStatus.state === 'verified' ? 'JWT Live' : 'Verifying'}</span>
            </button>

            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="px-3 sm:px-4 py-2 bg-[#1D63ED] hover:bg-[#1752C9] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {primaryAction.label}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>

        {/* Mobile Bottom Quick Navigation Bar */}
        <nav
          aria-label="Mobile quick navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-1 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] grid grid-cols-5 gap-1 no-print"
        >
          {MOBILE_BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectSection(tab.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  isActive ? 'text-[#1D63ED] bg-[#EAF1FF]/70' : 'text-slate-500'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="truncate max-w-full px-1">{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-medium text-slate-500 cursor-pointer"
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span>All Tools</span>
          </button>
        </nav>
      </div>
    </div>
  );
};
