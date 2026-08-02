import apiClient, { ApiResponse, handleResponse } from "./client";
import { useAuthStore } from "@/stores/auth";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string; // Backend sends 'SUPERADMIN' | 'ADMIN' | 'PETUGAS'
  phone: string | null;
  avatar: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
  rtupp?: {
    id: string;
    code: string;
    name: string;
  } | null;
  team?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Login with timeout to prevent hanging
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  console.log("[API] login() called with:", credentials.email);

  try {
    console.log("[API] Sending POST /auth/login...");

    // Add explicit timeout for login
    const response = await apiClient.post<ApiResponse<LoginResponse>>("/auth/login", credentials, {
      timeout: 10000, // 10 second timeout
    });

    console.log("[API] Response received:", {
      status: response.status,
      hasData: !!response.data,
      success: response.data?.success,
    });

    if (!response.data) {
      console.error("[API] No data in response");
      throw new Error("Server tidak merespon dengan data");
    }

    if (!response.data.success) {
      console.error("[API] Response success=false:", response.data.message);
      throw new Error(response.data.message || "Login gagal");
    }

    // Extract the actual payload from the wrapped response
    const payload = response.data.data;
    console.log("[API] Payload extracted:", {
      hasUser: !!payload?.user,
      hasTokens: !!payload?.tokens,
      userName: payload?.user?.name,
      userRole: payload?.user?.role,
    });

    if (!payload || !payload.user || !payload.tokens) {
      console.error("[API] Invalid payload structure:", payload);
      throw new Error("Format response dari server tidak valid");
    }

    return payload;
  } catch (error: any) {
    console.error("[API] Error in login:", {
      name: error.name,
      message: error.message,
      code: error.code,
      response: error.response
        ? {
            status: error.response.status,
            data: error.response.data,
          }
        : "no response",
    });

    // Re-throw with better message
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error("Request timeout - Server terlalu lama merespon");
    }
    if (!error.response) {
      throw new Error("Server tidak dapat dihubungi. Pastikan backend berjalan di port 3001.");
    }
    if (error.response?.status === 401) {
      throw new Error("Email atau password salah");
    }
    if (error.response?.status === 404) {
      throw new Error("Endpoint login tidak ditemukan");
    }
    const message = error.response?.data?.message || error.message || "Login gagal";
    throw new Error(message);
  }
};

// Refresh token — backend rotates: returns a new access AND refresh token.
export const refreshToken = async (
  token: string,
): Promise<{ accessToken: string; refreshToken?: string }> => {
  const response = await apiClient.post<
    ApiResponse<{ accessToken: string; refreshToken?: string }>
  >("/auth/refresh", { refreshToken: token });
  return handleResponse(response);
};

// Server-side logout: revoke this device's session (single) or all sessions.
export const logoutServer = async (
  refreshTokenValue: string | null,
  scope: "single" | "all" = "single",
): Promise<void> => {
  const path = scope === "all" ? "/auth/logout-all" : "/auth/logout";
  await apiClient.post(path, scope === "all" ? {} : { refreshToken: refreshTokenValue });
};

// Profile response carries extra live stats beyond the auth User.
export interface ProfileData extends User {
  createdAt?: string;
  reportCount?: number;
  lastLoginAt?: string | null;
  activeSessions?: number;
}

// Get profile (with live stats)
export const getProfile = async (): Promise<ProfileData> => {
  const response = await apiClient.get<ApiResponse<ProfileData>>("/auth/profile");
  return handleResponse(response);
};

// Self-service profile update (email / phone only).
export interface UpdateProfileInput {
  email?: string;
  phone?: string;
}
export const updateProfile = async (data: UpdateProfileInput): Promise<ProfileData> => {
  const response = await apiClient.patch<ApiResponse<ProfileData>>("/auth/profile", data);
  return handleResponse(response);
};

// Upload / replace the current user's avatar (JPG/PNG/WEBP).
export const uploadAvatar = async (file: File): Promise<ProfileData> => {
  const form = new FormData();
  form.append("avatar", file);
  // IMPORTANT: do NOT set Content-Type manually. The shared axios client defaults
  // to "application/json"; for a multipart body we must let the browser generate
  // the header *with its boundary* (e.g. "multipart/form-data; boundary=…").
  // Setting a bare "multipart/form-data" omits the boundary, so multer can't parse
  // the body and req.file ends up undefined → the upload silently fails. Passing
  // `undefined` removes the inherited default and lets axios serialise FormData.
  const response = await apiClient.post<ApiResponse<ProfileData>>("/auth/avatar", form, {
    headers: { "Content-Type": undefined },
  });
  return handleResponse(response);
};

// Resolve a stored avatar path ("/uploads/avatars/…") to an absolute URL the
// browser can load. Avatars are served by the backend origin (not under /api).
export function resolveAvatarUrl(avatar?: string | null): string | undefined {
  if (!avatar) return undefined;
  if (/^https?:\/\//.test(avatar)) return avatar;
  const base = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(
    /\/api\/?$/,
    "",
  );
  return `${base}${avatar}`;
}

// Change password
export const changePassword = async (
  data: ChangePasswordInput,
): Promise<{ mustChangePassword: boolean }> => {
  const response = await apiClient.post<
    ApiResponse<{ mustChangePassword: boolean; tokens?: AuthTokens }>
  >("/auth/change-password", data);
  const result = handleResponse(response);

  // Changing the password revokes all prior sessions server-side and mints a
  // fresh pair for this device. Adopt the new tokens so the current session
  // keeps working without forcing a re-login. (Tokens are optional/additive —
  // older backends omit them and this is a no-op.)
  if (result.tokens) {
    const { setAccessToken, setRefreshToken } = useAuthStore.getState();
    setAccessToken(result.tokens.accessToken);
    setRefreshToken(result.tokens.refreshToken);
  }

  return { mustChangePassword: result.mustChangePassword };
};
