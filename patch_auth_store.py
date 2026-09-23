import re

file = "src/store/auth-store.ts"
with open(file, "r") as f:
    content = f.read()

content = content.replace("import { persist } from 'zustand/middleware';\n", "")
content = content.replace(
    "export const useAuthStore = create<AuthState>()(\n  persist(\n    (set) => ({\n      accessToken: null,\n      user: null,\n      setAuth: (accessToken, user) => set({ accessToken, user }),\n      logout: () => set({ accessToken: null, user: null }),\n    }),\n    {\n      name: 'lean-commerce-auth', // This is the key in localStorage\n    }\n  )\n);",
    "export const useAuthStore = create<AuthState>()((set) => ({\n  accessToken: null,\n  user: null,\n  setAuth: (accessToken, user) => set({ accessToken, user }),\n  logout: () => set({ accessToken: null, user: null }),\n}));"
)

with open(file, "w") as f:
    f.write(content)
