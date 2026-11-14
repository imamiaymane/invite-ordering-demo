import type { Department } from "./model";
export type DepartmentRole = {
  department: Department;
  engineers: string[];
};
export interface DepartmentRoleProvider {
  getRoles(): readonly DepartmentRole[];
}
// Replace this provider with the SharePoint Department Roles configuration list.
export const localDepartmentRoles: DepartmentRoleProvider = {
  getRoles: () => [
    {
      department: "Automation",
      engineers: ["Jan Wiggeshoff"],
    },
    {
      department: "Robotics",
      engineers: ["Marius Kling"],
    },
    {
      department: "Formulation Technology",
      engineers: ["Tim Lillotte"],
    },
  ],
};
export const departmentRoles = localDepartmentRoles.getRoles();
export const roleFor = (department: Department) =>
  departmentRoles.find((r) => r.department === department)!;
// Local counterparts of the three single-person-per-row configuration lists.
export type RoleUser = { person: string; enabled: boolean };
export const infoUsers: RoleUser[] = [
  { person: "Elham Moghaddamas", enabled: true },
  { person: "Kamila Kalkin", enabled: true },
];
export const managementUsers: RoleUser[] = [
  { person: "Carl-Helmut Coulon", enabled: true },
  { person: "Jan-Olav Henck", enabled: true },
  { person: "Maja Diebig-Lorenz", enabled: true },
];
export const adminUsers: RoleUser[] = [{ person: "Aymane Elimami", enabled: true }];
const enabled = (rows: RoleUser[], person: string) =>
  rows.some((r) => r.enabled && r.person === person);
export const isAdmin = (person: string) => enabled(adminUsers, person);
export const isManagement = (person: string) =>
  enabled(managementUsers, person);
export const isGlobalApprover = (person: string) =>
  isAdmin(person) || isManagement(person);
export const isDepartmentEngineer = (department: Department, person: string) =>
  roleFor(department).engineers.includes(person);
// "info" remains a convenient prototype persona; real authentication uses the configured people.
export const isInfoUser = (person: string) =>
  person === sharedOrderingAccount.displayName || enabled(infoUsers, person);
export const canConfigureRoles = isAdmin;

// Shared ordering identity; email is configuration metadata for future integration.
export const sharedOrderingAccount = {
  displayName: "info",
  email: "info@invite-research.com",
};
