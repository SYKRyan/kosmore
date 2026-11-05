// Synthetic subjects and progress, shaped after the read-only GET /quests contract.
export const questCatalog = {
  quests: [
    {
      id: "wanderers",
      state: "open",
      stars: [{ subjectId: "42", lit: false }],
    },
    {
      id: "symphony",
      state: "following",
      stars: [{ subjectId: "44", lit: true }],
    },
  ],
  following: ["symphony"],
  max: 3,
};
