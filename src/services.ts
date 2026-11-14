import { people } from "./model";
// Integration seams: replace with SPFx context and Power Automate-backed delivery.
export interface CurrentUserProvider {
  getCurrentUser(): string;
}
export const sampleCurrentUser: CurrentUserProvider = {
  getCurrentUser: () => people[0],
};
export type NotificationFlag = { message: string; at: string; read: boolean };
export interface NotificationService {
  flag(message: string): NotificationFlag;
}
export const localNotifications: NotificationService = {
  flag: (message) => ({ message, at: new Date().toISOString(), read: false }),
};
