type Field = { id: string; etiqueta: string; secreto: boolean };

const usernameLabel = /usuario|user|e-?mail|correo|login|nombre de usuario/i;
const passwordLabel = /contraseña|contrasena|password|clave|pass/i;

/** Fields used to fill a login form: a visible one for the user, a secret one for the password. */
export function pickLoginFields<T extends Field>(fields: readonly T[]) {
  const visible = fields.filter((field) => !field.secreto);
  const secret = fields.filter((field) => field.secreto);
  return {
    username: visible.find((field) => usernameLabel.test(field.etiqueta)) ?? visible[0] ?? null,
    password: secret.find((field) => passwordLabel.test(field.etiqueta)) ?? secret[0] ?? null,
  };
}
