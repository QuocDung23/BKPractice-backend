export interface Principal {
  userId: string;
  permissions: ReadonlySet<string>;
}
