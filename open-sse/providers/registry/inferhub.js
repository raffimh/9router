export default {
  id: "inferhub-image",
  priority: 70,
  alias: "inferhub-image",
  display: {
    name: "Inferhub",
    icon: "image",
    color: "#6366F1",
    textIcon: "IH",
    website: "https://inferhub.dev",
    notice: {
      apiKeyUrl: "https://inferhub.dev",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: null,
  models: [
    { id: "cx/gpt-image-2-codex", name: "GPT Image 2 (Codex)", params: ["n", "size"], kind: "image" },
    { id: "gpt-image-2-codex", name: "GPT Image 2 Codex", params: ["n", "size"], kind: "image" },
  ],
  serviceKinds: ["image"],
  imageConfig: {
    baseUrl: "https://api.inferhub.dev/v1/images/generations",
    authHeader: "bearer",
    // inferhub's codex-lane image model rejects the default complexity "low"
    // (400: "Complexity 'low' is not supported for this image model") — send
    // medium on every request (defaultBody is merged by the openai adapter).
    defaultBody: { complexity: "medium" },
  },
};
