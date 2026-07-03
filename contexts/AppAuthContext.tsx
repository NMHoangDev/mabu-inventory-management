"use client";

import { createContext, useContext } from "react";

export const AppAuthContext = createContext<any>(null);

export function useAppAuth() {
  return {
    user: {
      id: "default",
      email: "admin@localhost",
      name: "Admin",
      role: "admin"
    },
    logout: () => {},
    login: () => {}
  };
}
