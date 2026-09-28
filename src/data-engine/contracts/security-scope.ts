export interface SecurityScope {
  organizationId: string;
  // Des contraintes plus fines exigent d'abord un modèle RBAC vérifié.
  constraints?: ReadonlyArray<{ field: string; allowedValues: readonly string[] }>;
}
