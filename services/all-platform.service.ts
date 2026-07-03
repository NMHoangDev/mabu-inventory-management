// Mock service for Mabu Single User structure to satisfy imports in Zalo components
export const allPlatformKpiService: any = {
  getAll: async (email: string): Promise<any> => {
    return {
      success: true,
      message: "",
      data: {
        members: [
          {
            email: "admin@localhost",
            name: "Admin",
            member_id: "default",
            id_team: "admin-team",
            team_name: "Workspace của tôi",
          }
        ]
      }
    };
  }
};

export const zaloInboxShareService: any = {
  toggle: async (payload: any): Promise<any> => {
    return {
      success: true,
      message: "",
      data: {
        is_active: payload.is_active,
        row: { id: 1 }
      }
    };
  },
  listMine: async (email: string, isActive?: any): Promise<any> => {
    return {
      success: true,
      message: "",
      data: {
        items: [],
        total: 0
      }
    };
  },
  leaderView: async (leaderEmail: string, memberEmail?: string): Promise<any> => {
    return {
      success: true,
      message: "",
      data: {
        items: [],
        total: 0
      }
    };
  },
  countVerified: async (email: string, start: string, end: string): Promise<any> => {
    return {
      success: true,
      message: "",
      data: {
        count: 0,
        items: []
      }
    };
  },
  toggleLead: async (rowId: number, email: string, value: boolean): Promise<any> => {
    return {
      success: true,
      message: "",
      data: { row: { id: rowId, is_lead: value } }
    };
  },
  revokeAll: async (payload: any): Promise<any> => {
    return {
      success: true,
      message: "",
      data: { count: 0 }
    };
  }
};
