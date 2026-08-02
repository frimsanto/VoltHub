import apiClient, { ApiResponse, handleResponse } from "./client";

export interface Team {
  id: string;
  code: string;
  name: string;
  rtuppId: string;
  leaderId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rtupp?: {
    id: string;
    name: string;
    code: string;
  };
  users_teams_leaderIdTousers?: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count?: {
    members: number;
  };
}

export interface CreateTeamInput {
  code: string;
  name: string;
  rtuppId: string;
  leaderId?: string;
  isActive?: boolean;
}

export interface UpdateTeamInput {
  code?: string;
  name?: string;
  rtuppId?: string;
  leaderId?: string | null;
  isActive?: boolean;
}

// Get all Teams
export const getTeams = async (params?: {
  search?: string;
  rtuppId?: string;
  isActive?: boolean;
}): Promise<Team[]> => {
  const response = await apiClient.get<ApiResponse<Team[]>>("/teams", { params });
  return handleResponse(response);
};

// Create Team
export const createTeam = async (data: CreateTeamInput): Promise<Team> => {
  const response = await apiClient.post<ApiResponse<Team>>("/teams", data);
  return handleResponse(response);
};

// Update Team
export const updateTeam = async (id: string, data: UpdateTeamInput): Promise<Team> => {
  const response = await apiClient.put<ApiResponse<Team>>(`/teams/${id}`, data);
  return handleResponse(response);
};

// Delete Team
export const deleteTeam = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/teams/${id}`);
  return handleResponse(response);
};
