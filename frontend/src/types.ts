import { User } from "./api";
export type Common = {
  user: User;
  revision: number;
  refresh: () => void;
  tell: (s: string) => void;
};
