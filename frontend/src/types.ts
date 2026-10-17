import { User } from "./api";
export type Common = {
  launch?: (page:string,recordId?:string)=>void;
  recordId?:string;
  user: User;
  revision: number;
  refresh: () => void;
  tell: (s: string) => void;
};
