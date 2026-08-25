import { useEffect, useState, useCallback } from "react";
import { api } from "../shared/api";

export interface AdminInfo {
  username: string;
  name: string;
  totpEnabled: boolean;
}

export interface AdminLoginResult {
  ok: boolean;
  needsTotp?: boolean;
  name?: string;
}

export function useAdminSession() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AdminInfo>("/admin/auth/me");
      setAdmin(data);
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 2단계 인증이 켜진 계정은 서버가 곧바로 로그인시키지 않고 needsTotp를 돌려줄 수 있어
  // 결과를 그대로 반환한다 — 화면에서 그 값을 보고 인증번호 입력 단계로 넘어갈지 판단한다.
  const login = useCallback(
    async (username: string, password: string, totpCode?: string): Promise<AdminLoginResult> => {
      const result = await api.post<AdminLoginResult>("/admin/auth/login", { username, password, totpCode });
      if (result.ok) await refresh();
      return result;
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    await api.post("/admin/auth/logout");
    setAdmin(null);
  }, []);

  return { admin, loading, login, logout, refresh };
}
