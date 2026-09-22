export type ChatMessage = { id?: string; role: "user" | "assistant"; content: string };
export type AmeEvent = {
  id:string; title:string; status?:string; urgency?:string; created?:string; owner?:string;
  raw:Record<string,unknown>;
};
export type SearchAudit = { searchId:string; query:string; resultCount:number; truncated:boolean };
