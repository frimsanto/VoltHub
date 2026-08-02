import apiClient, { ApiResponse, handleResponse } from "./client";

// Roles the FE may send (canonical VoltHub set). The backend additionally
// returns legacy values (SUPERADMIN/ADMIN_RTUPP) for un-migrated rows.
export type CanonicalUserRole = "PETUGAS" | "ADMIN" | "MANAGER" | "MASTER";
export type StoredUserRole = CanonicalUserRole | "SUPERADMIN" | "ADMIN_RTUPP";

export interface User {
  id: string;
  email: string;
  name: string;
  role: StoredUserRole;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  rtupp?: {
    id: string;
    name: string;
    code: string;
  };
  team?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: CanonicalUserRole;
  phone?: string;
  rtuppId?: string;
  teamId?: string;
  // Free-text alternatives: RTUPP name (static ADMIN selector) / Team name (PETUGAS).
  rtuppName?: string;
  teamName?: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  role?: CanonicalUserRole;
  rtuppId?: string;
  teamId?: string;
  rtuppName?: string;
  teamName?: string;
  isActive?: boolean;
}

export interface Rtupp {
  id: string;
  name: string;
  code: string;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  rtuppId: string;
}

// Get all users
export const getUsers = async (params?: {
  search?: string;
  role?: string;
  isActive?: boolean;
}): Promise<User[]> => {
  const response = await apiClient.get<ApiResponse<User[]>>("/users", { params });
  return handleResponse(response);
};

// Get user by ID
export const getUserById = async (id: string): Promise<User> => {
  const response = await apiClient.get<ApiResponse<User>>(`/users/${id}`);
  return handleResponse(response);
};

// Create user
export const createUser = async (data: CreateUserInput): Promise<User> => {
  const response = await apiClient.post<ApiResponse<User>>("/users", data);
  return handleResponse(response);
};

// Update user
export const updateUser = async (id: string, data: UpdateUserInput): Promise<User> => {
  const response = await apiClient.put<ApiResponse<User>>(`/users/${id}`, data);
  return handleResponse(response);
};

// Reset another user's password (sets a temporary password + forces change on next login)
export const resetUserPassword = async (id: string, password: string): Promise<void> => {
  const response = await apiClient.post<ApiResponse<void>>(`/users/${id}/reset-password`, {
    password,
  });
  return handleResponse(response);
};

// Delete user
export const deleteUser = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/users/${id}`);
  return handleResponse(response);
};

// Get RTUPP list
export const getRtuppList = async (): Promise<Rtupp[]> => {
  const response = await apiClient.get<ApiResponse<Rtupp[]>>("/users/dropdown/rtupp");
  return handleResponse(response);
};

// Get Team list
export const getTeamList = async (): Promise<Team[]> => {
  const response = await apiClient.get<ApiResponse<Team[]>>("/users/dropdown/team");
  return handleResponse(response);
};
