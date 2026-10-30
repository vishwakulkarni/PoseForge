/** Drops credential previews. The settings route shows the UI a masked key
 * (first and last characters); an agent only needs to know a key is there. */
function withoutSecrets(value) {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "masked").map(([key, item]) => [key, withoutSecrets(item)])
  );
}

module.exports = [
  {
    name: "get_settings",
    route: "GET /api/settings",
    description: "Read PoseForge settings: default engine, which provider credentials are configured (never their values), model choices and spending limits. Settings are changed in the PoseForge UI.",
    input: {},
    annotations: { readOnlyHint: true },
    async call(args, api) {
      return withoutSecrets(await api.call("GET /api/settings"));
    },
  },
];
