export const SITE_URL =
  "https://invitegmbh.sharepoint.com/sites/APLPortalRedesignDEV";
export const departments = [
  "Automation",
  "Robotics",
  "Formulation Technology",
] as const;
export type Department = (typeof departments)[number];
export const lists = {
  engineers: "Ordering Department Engineers",
  info: "Ordering Info Users",
  management: "Ordering Management Users",
  admins: "Ordering Admin Users",
  requests: "Ordering Requests",
  items: "Ordering Request Items",
  lots: "Ordering Delivery Lots",
  history: "Ordering Activity History",
  parcels: "Ordering Unidentified Parcels",
} as const;
export type ListKey = keyof typeof lists;
export const statuses = [
  "Requested",
  "To order",
  "Ordered",
  "On shelf",
  "Picked up",
  "Rejected",
  "Changes requested",
] as const;
export type Status = (typeof statuses)[number];
export interface User {
  Id: number;
  Title: string;
  Email: string;
  LoginName: string;
}
export interface Row {
  Id: number;
  Title: string;
  [field: string]: unknown;
}
export interface RequestRow extends Row {
  Department: Department;
  RequestStatus: Status;
  RequesterId: number;
  RecipientId: number;
}
export interface ItemRow extends Row {
  RequestId: number;
  RequestedQty: number;
  OrderedQty: number | null;
  ArrivedQty: number;
  PickedUpQty: number;
  Unit: string;
}
export interface LotRow extends Row {
  RequestItemId: number;
  ArrivedQty: number;
  PickedUpQty: number;
  IsVoid: boolean;
  ShelfLocation: string;
  ArrivedAt: string;
}
export const listPath = (key: ListKey) =>
  `web/lists/getbytitle('${lists[key].replaceAll("'", "''")}')`;
