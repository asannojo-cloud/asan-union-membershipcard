import { createContext, useContext, type ReactNode } from "react";
import { useAdminSession, type AdminInfo, type AdminLoginResult } from "./useAdminSession";

interface AdminSessionValue {
  admin: AdminInfo | null;
  loading: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<AdminLoginResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const value = useAdminSession();
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSessionContext(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSessionContext는 AdminSessionProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
